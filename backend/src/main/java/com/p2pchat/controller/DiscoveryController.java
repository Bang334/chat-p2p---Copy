package com.p2pchat.controller;

import com.p2pchat.service.PeerDiscoveryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * REST Controller for Peer Discovery
 * Exposes endpoints for frontend to query discovered peers
 */
@RestController
@RequestMapping("/api/discovery")
@CrossOrigin(origins = "*")
public class DiscoveryController {
    
    private static final Logger log = LoggerFactory.getLogger(DiscoveryController.class);
    
    @Autowired
    private PeerDiscoveryService discoveryService;
    
    /**
     * Get all discovered peers
     * Returns map of IP -> {peerId, username, port, lastSeen}
     */
    @GetMapping("/peers")
    public ResponseEntity<Map<String, Map<String, Object>>> getDiscoveredPeers() {
        var peers = discoveryService.getDiscoveredPeers();
        
        Map<String, Map<String, Object>> result = peers.entrySet().stream()
            .collect(Collectors.toMap(
                Map.Entry::getKey,
                entry -> {
                    PeerDiscoveryService.DiscoveredPeer peer = entry.getValue();
                    Map<String, Object> peerInfo = new HashMap<>();
                    peerInfo.put("ip", peer.ip);
                    peerInfo.put("peerId", peer.peerId);
                    peerInfo.put("username", peer.username);
                    peerInfo.put("port", peer.port);
                    peerInfo.put("lastSeen", peer.lastSeen);
                    peerInfo.put("signalingUrl", "http://" + peer.ip + ":" + peer.port + "/ws/signaling");
                    return peerInfo;
                }
            ));
        
        return ResponseEntity.ok(result);
    }
    
    /**
     * Trigger broadcast of peer information
     * Called when a peer comes online
     */
    @PostMapping("/broadcast")
    public ResponseEntity<Map<String, String>> broadcastPeerInfo(
            @RequestBody Map<String, String> request) {
        String peerId = request.get("peerId");
        String username = request.get("username");
        
        if (peerId == null || username == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "peerId and username are required"));
        }
        
        log.info("📢 Broadcasting peer info: {} ({})", username, peerId);
        discoveryService.broadcastPeerInfo(peerId, username);
        
        return ResponseEntity.ok(Map.of("status", "broadcasted"));
    }
    
    /**
     * Reload blocked IPs from file
     */
    @PostMapping("/reload-blocked-ips")
    public ResponseEntity<Map<String, Object>> reloadBlockedIPs() {
        discoveryService.reloadBlockedIPs();
        var blockedIPs = discoveryService.getBlockedIPs();
        
        return ResponseEntity.ok(Map.of(
            "status", "reloaded",
            "count", blockedIPs.size(),
            "blockedIPs", blockedIPs
        ));
    }
    
    /**
     * Get list of blocked IPs
     */
    @GetMapping("/blocked-ips")
    public ResponseEntity<Map<String, Object>> getBlockedIPs() {
        var blockedIPs = discoveryService.getBlockedIPs();
        
        return ResponseEntity.ok(Map.of(
            "count", blockedIPs.size(),
            "blockedIPs", blockedIPs
        ));
    }
}

