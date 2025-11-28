package com.p2pchat.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.io.BufferedReader;
import java.io.IOException;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * UDP Broadcast Discovery Service
 * Tự động phát hiện các peers trong cùng mạng local bằng UDP broadcast
 */
@Service
public class PeerDiscoveryService {
    
    private static final Logger log = LoggerFactory.getLogger(PeerDiscoveryService.class);
    
    private static final int DISCOVERY_PORT = 8888;
    private static final String DISCOVERY_MESSAGE_PREFIX = "P2P-CHAT-DISCOVERY:";
    private static final long PEER_TIMEOUT_MS = 30000; // 30 seconds
    
    @Value("${server.port:8080}")
    private int serverPort;
    
    private DatagramSocket socket;
    private boolean running = false;
    private ScheduledExecutorService executorService;
    
    // Map of discovered peers: IP -> {peerId, username, lastSeen, port}
    private final Map<String, DiscoveredPeer> discoveredPeers = new ConcurrentHashMap<>();
    
    // Set of blocked IP addresses
    private final Set<String> blockedIPs = new HashSet<>();
    private static final String BLOCKED_IPS_FILE = "blocked-ips.txt";
    
    // Local peer information
    private String localIP;
    private String localPeerId;
    private String localUsername;
    
    @PostConstruct
    public void init() {
        try {
            // Load blocked IPs from file
            loadBlockedIPs();
            
            // Get local IP address
            localIP = getLocalIPAddress();
            if (localIP == null) {
                log.warn("⚠️ Could not determine local IP address");
                return;
            }
            
            log.info("🔍 Starting UDP Discovery Service on {}:{}", localIP, DISCOVERY_PORT);
            if (!blockedIPs.isEmpty()) {
                log.info("🚫 Loaded {} blocked IP(s): {}", blockedIPs.size(), blockedIPs);
            }
            
            // Create UDP socket
            socket = new DatagramSocket(DISCOVERY_PORT);
            socket.setBroadcast(true);
            socket.setReuseAddress(true);
            
            running = true;
            
            // Start listening thread
            executorService = Executors.newScheduledThreadPool(2);
            executorService.execute(this::listenForBroadcasts);
            executorService.scheduleAtFixedRate(this::broadcastPresence, 0, 5, TimeUnit.SECONDS);
            executorService.scheduleAtFixedRate(this::cleanupStalePeers, 10, 10, TimeUnit.SECONDS);
            
            log.info("✅ UDP Discovery Service started successfully");
        } catch (Exception e) {
            log.error("❌ Failed to start UDP Discovery Service", e);
        }
    }
    
    /**
     * Listen for UDP broadcast messages from other peers
     */
    private void listenForBroadcasts() {
        byte[] buffer = new byte[1024];
        
        while (running) {
            try {
                DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                socket.receive(packet);
                
                String message = new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8);
                String senderIP = packet.getAddress().getHostAddress();
                
                // Ignore our own broadcasts
                if (senderIP.equals(localIP)) {
                    continue;
                }
                
                if (message.startsWith(DISCOVERY_MESSAGE_PREFIX)) {
                    handleDiscoveryMessage(senderIP, message);
                }
            } catch (IOException e) {
                if (running) {
                    log.error("Error receiving UDP broadcast", e);
                }
            }
        }
    }
    
    /**
     * Handle received discovery message
     * Format: P2P-CHAT-DISCOVERY:peerId:username:port
     */
    private void handleDiscoveryMessage(String ip, String message) {
        // Check if IP is blocked
        if (isBlocked(ip)) {
            log.debug("🚫 Ignoring blocked IP: {}", ip);
            return;
        }
        
        try {
            String data = message.substring(DISCOVERY_MESSAGE_PREFIX.length());
            String[] parts = data.split(":");
            
            if (parts.length >= 3) {
                String peerId = parts[0];
                String username = parts[1];
                int port = Integer.parseInt(parts[2]);
                
                DiscoveredPeer peer = new DiscoveredPeer(ip, peerId, username, port, System.currentTimeMillis());
                discoveredPeers.put(ip, peer);
                
                log.debug("📡 Discovered peer: {} ({}) at {}:{}", username, peerId, ip, port);
            }
        } catch (Exception e) {
            log.warn("Failed to parse discovery message from {}: {}", ip, message, e);
        }
    }
    
    /**
     * Broadcast our presence to the network
     */
    private void broadcastPresence() {
        if (!running || socket == null || localIP == null) {
            return;
        }
        
        // Only broadcast if we have peer info
        if (localPeerId == null || localUsername == null) {
            return;
        }
        
        try {
            // Broadcast peer info: P2P-CHAT-DISCOVERY:peerId:username:port
            String message = DISCOVERY_MESSAGE_PREFIX + localPeerId + ":" + localUsername + ":" + serverPort;
            
            byte[] data = message.getBytes(StandardCharsets.UTF_8);
            
            // Broadcast to all interfaces
            InetAddress broadcastAddress = InetAddress.getByName("255.255.255.255");
            DatagramPacket packet = new DatagramPacket(
                data, 
                data.length, 
                broadcastAddress, 
                DISCOVERY_PORT
            );
            
            socket.send(packet);
            
            // Also try subnet broadcast
            String subnet = getSubnet(localIP);
            if (subnet != null) {
                InetAddress subnetBroadcast = InetAddress.getByName(subnet + ".255");
                packet.setAddress(subnetBroadcast);
                socket.send(packet);
            }
            
        } catch (Exception e) {
            log.debug("Error broadcasting presence", e);
        }
    }
    
    /**
     * Broadcast peer information (called by REST endpoint)
     */
    public void broadcastPeerInfo(String peerId, String username) {
        // Store local peer info for periodic broadcasts
        this.localPeerId = peerId;
        this.localUsername = username;
        
        if (!running || socket == null || localIP == null) {
            return;
        }
        
        try {
            String message = DISCOVERY_MESSAGE_PREFIX + peerId + ":" + username + ":" + serverPort;
            byte[] data = message.getBytes(StandardCharsets.UTF_8);
            
            // Broadcast to all interfaces
            InetAddress broadcastAddress = InetAddress.getByName("255.255.255.255");
            DatagramPacket packet = new DatagramPacket(
                data, 
                data.length, 
                broadcastAddress, 
                DISCOVERY_PORT
            );
            
            socket.send(packet);
            
            // Also try subnet broadcast
            String subnet = getSubnet(localIP);
            if (subnet != null) {
                InetAddress subnetBroadcast = InetAddress.getByName(subnet + ".255");
                packet.setAddress(subnetBroadcast);
                socket.send(packet);
            }
            
            log.info("📢 Broadcasted peer info: {} ({})", username, peerId);
        } catch (Exception e) {
            log.error("Error broadcasting peer info", e);
        }
    }
    
    /**
     * Clean up stale peers (not seen for 30 seconds)
     */
    private void cleanupStalePeers() {
        long now = System.currentTimeMillis();
        discoveredPeers.entrySet().removeIf(entry -> {
            boolean stale = (now - entry.getValue().lastSeen) > PEER_TIMEOUT_MS;
            if (stale) {
                log.debug("🗑️ Removing stale peer: {}", entry.getKey());
            }
            return stale;
        });
    }
    
    /**
     * Get all discovered peers (excluding blocked IPs)
     */
    public Map<String, DiscoveredPeer> getDiscoveredPeers() {
        // Remove stale peers before returning
        cleanupStalePeers();
        
        // Filter out blocked IPs
        Map<String, DiscoveredPeer> filtered = new ConcurrentHashMap<>();
        for (Map.Entry<String, DiscoveredPeer> entry : discoveredPeers.entrySet()) {
            if (!isBlocked(entry.getKey())) {
                filtered.put(entry.getKey(), entry.getValue());
            }
        }
        
        return filtered;
    }
    
    /**
     * Check if an IP is blocked
     */
    private boolean isBlocked(String ip) {
        return blockedIPs.contains(ip);
    }
    
    /**
     * Load blocked IPs from file
     * File format: one IP per line, lines starting with # are comments
     */
    private void loadBlockedIPs() {
        blockedIPs.clear();
        
        try {
            // Try to find file in current directory or project root
            Path filePath = Paths.get(BLOCKED_IPS_FILE);
            if (!Files.exists(filePath)) {
                // Try in parent directory (project root)
                filePath = Paths.get("backend", BLOCKED_IPS_FILE);
            }
            
            if (!Files.exists(filePath)) {
                log.info("📝 No blocked-ips.txt file found, no IPs will be blocked");
                return;
            }
            
            try (BufferedReader reader = Files.newBufferedReader(filePath, StandardCharsets.UTF_8)) {
                String line;
                int lineNumber = 0;
                
                while ((line = reader.readLine()) != null) {
                    lineNumber++;
                    line = line.trim();
                    
                    // Skip empty lines and comments
                    if (line.isEmpty() || line.startsWith("#")) {
                        continue;
                    }
                    
                    // Validate IP format (simple validation)
                    if (isValidIP(line)) {
                        blockedIPs.add(line);
                        log.debug("🚫 Blocked IP loaded: {}", line);
                    } else {
                        log.warn("⚠️ Invalid IP format in blocked-ips.txt line {}: {}", lineNumber, line);
                    }
                }
            }
            
            if (!blockedIPs.isEmpty()) {
                log.info("✅ Loaded {} blocked IP(s) from {}", blockedIPs.size(), filePath);
            }
        } catch (IOException e) {
            log.error("❌ Error reading blocked-ips.txt", e);
        }
    }
    
    /**
     * Reload blocked IPs from file (can be called via REST endpoint)
     */
    public void reloadBlockedIPs() {
        log.info("🔄 Reloading blocked IPs from file...");
        loadBlockedIPs();
        log.info("✅ Reloaded {} blocked IP(s)", blockedIPs.size());
    }
    
    /**
     * Simple IP validation
     */
    private boolean isValidIP(String ip) {
        if (ip == null || ip.isEmpty()) {
            return false;
        }
        
        String[] parts = ip.split("\\.");
        if (parts.length != 4) {
            return false;
        }
        
        try {
            for (String part : parts) {
                int num = Integer.parseInt(part);
                if (num < 0 || num > 255) {
                    return false;
                }
            }
            return true;
        } catch (NumberFormatException e) {
            return false;
        }
    }
    
    /**
     * Get list of blocked IPs (for debugging/admin)
     */
    public Set<String> getBlockedIPs() {
        return new HashSet<>(blockedIPs);
    }
    
    /**
     * Get local IP address (first non-loopback, non-link-local address)
     */
    private String getLocalIPAddress() {
        try {
            // Try to get IP from network interfaces
            for (NetworkInterface ni : java.util.Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (ni.isLoopback() || !ni.isUp()) {
                    continue;
                }
                
                for (InetAddress addr : java.util.Collections.list(ni.getInetAddresses())) {
                    if (addr instanceof Inet4Address && !addr.isLoopbackAddress() && !addr.isLinkLocalAddress()) {
                        return addr.getHostAddress();
                    }
                }
            }
            
            // Fallback: try to connect to a remote address to determine local IP
            try (Socket s = new Socket()) {
                s.connect(new InetSocketAddress("8.8.8.8", 80), 1000);
                return s.getLocalAddress().getHostAddress();
            }
        } catch (Exception e) {
            log.warn("Could not determine local IP", e);
            return null;
        }
    }
    
    /**
     * Get subnet from IP (e.g., 192.168.1.100 -> 192.168.1)
     */
    private String getSubnet(String ip) {
        if (ip == null) return null;
        int lastDot = ip.lastIndexOf('.');
        if (lastDot > 0) {
            return ip.substring(0, lastDot);
        }
        return null;
    }
    
    @PreDestroy
    public void shutdown() {
        running = false;
        if (socket != null && !socket.isClosed()) {
            socket.close();
        }
        if (executorService != null) {
            executorService.shutdown();
        }
        log.info("🛑 UDP Discovery Service stopped");
    }
    
    /**
     * Discovered peer information
     */
    public static class DiscoveredPeer {
        public final String ip;
        public final String peerId;
        public final String username;
        public final int port;
        public final long lastSeen;
        
        public DiscoveredPeer(String ip, String peerId, String username, int port, long lastSeen) {
            this.ip = ip;
            this.peerId = peerId;
            this.username = username;
            this.port = port;
            this.lastSeen = lastSeen;
        }
    }
}

