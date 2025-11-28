package com.p2pchat.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Central registry for tracking online peers and their WebSocket sessions
 */
@Service
public class PeerRegistry {
    
    private static final Logger log = LoggerFactory.getLogger(PeerRegistry.class);
    
    // Track online peers: peerId -> sessionId
    private final Map<String, String> onlinePeers = new ConcurrentHashMap<>();
    
    // Track session -> peerId mapping (for cleanup)
    private final Map<String, String> sessionToPeer = new ConcurrentHashMap<>();
    
    /**
     * Register a peer as online
     */
    public void registerPeer(String peerId, String sessionId) {
        log.info("📝 Registering peer {} with session {}", peerId, sessionId);
        onlinePeers.put(peerId, sessionId);
        sessionToPeer.put(sessionId, peerId);
    }
    
    /**
     * Unregister a peer
     */
    public void unregisterPeer(String peerId) {
        if (peerId == null) {
            log.warn("⚠️ Cannot unregister peer: peerId is null");
            return;
        }
        log.info("🗑️ Unregistering peer {}", peerId);
        String sessionId = onlinePeers.remove(peerId);
        if (sessionId != null) {
            sessionToPeer.remove(sessionId);
        }
    }
    
    /**
     * Unregister peer by session ID
     */
    public String unregisterBySession(String sessionId) {
        String peerId = sessionToPeer.remove(sessionId);
        if (peerId != null) {
            onlinePeers.remove(peerId);
            log.info("🗑️ Unregistered peer {} by session {}", peerId, sessionId);
        }
        return peerId;
    }
    
    /**
     * Get session ID for a peer
     */
    public String getSessionId(String peerId) {
        return onlinePeers.get(peerId);
    }
    
    /**
     * Get peer ID for a session
     */
    public String getPeerId(String sessionId) {
        return sessionToPeer.get(sessionId);
    }
    
    /**
     * Check if peer is online
     */
    public boolean isPeerOnline(String peerId) {
        return onlinePeers.containsKey(peerId);
    }
    
    /**
     * Get all online peer IDs
     */
    public java.util.Set<String> getAllPeerIds() {
        return onlinePeers.keySet();
    }
    
    /**
     * Clear all peers (used for testing or emergency cleanup)
     */
    public void clearAll() {
        log.warn("⚠️ Clearing all peer registrations");
        onlinePeers.clear();
        sessionToPeer.clear();
    }
}

