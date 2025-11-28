package com.p2pchat.event;

import com.p2pchat.service.PeerRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

/**
 * WebSocket Event Listener - Handles WebSocket lifecycle events
 * Automatically cleans up peer registry when clients disconnect
 */
@Component
public class WebSocketEventListener {

    private static final Logger log = LoggerFactory.getLogger(WebSocketEventListener.class);
    
    private final SimpMessagingTemplate messagingTemplate;
    private final PeerRegistry peerRegistry;
    
    public WebSocketEventListener(SimpMessagingTemplate messagingTemplate, PeerRegistry peerRegistry) {
        this.messagingTemplate = messagingTemplate;
        this.peerRegistry = peerRegistry;
    }

    @EventListener
    public void handleWebSocketConnectListener(SessionConnectedEvent event) {
        log.info("🔌 New WebSocket connection established: {}", event.getMessage().getHeaders().get("simpSessionId"));
    }

    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        SimpMessageHeaderAccessor headerAccessor = SimpMessageHeaderAccessor.wrap(event.getMessage());
        String sessionId = headerAccessor.getSessionId();
        
        log.info("🔌 WebSocket session disconnected: {}", sessionId);
        
        // Find peerId associated with this session and clean up
        String peerId = peerRegistry.unregisterBySession(sessionId);
        
        if (peerId != null) {
            log.info("👋 Cleaning up peer {} from session {}", peerId, sessionId);
            
            // Broadcast peer offline to all connected peers
            var notification = new com.p2pchat.dto.SignalingMessage();
            notification.setType(com.p2pchat.dto.SignalingMessage.SignalType.PEER_OFFLINE);
            notification.setFrom(peerId);
            notification.setTimestamp(System.currentTimeMillis());
            
            messagingTemplate.convertAndSend("/topic/peers", notification);
            log.info("📤 Broadcasted PEER_OFFLINE for {}", peerId);
        } else {
            log.warn("⚠️ No peerId found for session {} - peer may have already disconnected", sessionId);
        }
    }
}

