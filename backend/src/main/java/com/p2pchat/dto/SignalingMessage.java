package com.p2pchat.dto;

public class SignalingMessage {
    
    private SignalType type;
    private String from;
    private String to;
    private Object payload; // Can be SDP or ICE candidate
    private Long timestamp;

    public SignalingMessage() {}
    
    public SignalingMessage(SignalType type, String from, String to, Object payload, Long timestamp) {
        this.type = type;
        this.from = from;
        this.to = to;
        this.payload = payload;
        this.timestamp = timestamp;
    }

    // Getters and Setters
    public SignalType getType() { return type; }
    public void setType(SignalType type) { this.type = type; }
    
    public String getFrom() { return from; }
    public void setFrom(String from) { this.from = from; }
    
    public String getTo() { return to; }
    public void setTo(String to) { this.to = to; }
    
    public Object getPayload() { return payload; }
    public void setPayload(Object payload) { this.payload = payload; }
    
    public Long getTimestamp() { return timestamp; }
    public void setTimestamp(Long timestamp) { this.timestamp = timestamp; }
    
    public enum SignalType {
        // WebRTC Signaling
        OFFER,           // Send WebRTC offer
        ANSWER,          // Send WebRTC answer
        ICE_CANDIDATE,   // Send ICE candidate
        
        // Peer Management
        PEER_ONLINE,     // User came online
        PEER_OFFLINE,    // User went offline
        PEER_LIST,       // List of online peers
        
        // Connection Management
        CALL_REQUEST,    // Request to establish P2P connection
        CALL_ACCEPT,     // Accept P2P connection
        CALL_REJECT,     // Reject P2P connection
        CALL_END,        // End P2P connection
        
        // Messaging
        TYPING,          // User is typing
        MESSAGE,         // Direct P2P message (fallback if needed)
        
        // Group Management
        GROUP_MEMBER_JOINED,  // New member joined group
        GROUP_MEMBER_LEFT,    // Member left group
        GROUP_UPDATED,        // Group info updated
        
        // Error
        ERROR
    }
}

