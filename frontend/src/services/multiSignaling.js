/**
 * Multi-Signaling Service - Hỗ trợ kết nối đến nhiều signaling servers
 * Cho phép mỗi máy kết nối đến TẤT CẢ các máy khác (mesh network)
 */

import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

class MultiSignalingService {
  constructor() {
    this.clients = new Map(); // Map<serverUrl, client>
    this.peerId = null;
    this.onOfferCallback = null;
    this.onAnswerCallback = null;
    this.onIceCandidateCallback = null;
    this.onPeerOnlineCallback = null;
    this.onPeerOfflineCallback = null;
    this.onCallRequestCallback = null;
    this.onCallAcceptCallback = null;
    this.allPeers = new Set(); // Tổng hợp peers từ tất cả connections
  }

  /**
   * Connect to multiple signaling servers
   * @param {string} peerId - Peer ID của máy hiện tại
   * @param {string[]} serverUrls - Array of signaling server URLs
   * @param {Function} onConnected - Callback khi tất cả kết nối thành công
   * @param {Function} onError - Callback khi có lỗi
   */
  connectToMultiple(peerId, serverUrls, onConnected, onError) {
    this.peerId = peerId;
    this.allPeers.clear();

    if (!serverUrls || serverUrls.length === 0) {
      console.warn('⚠️ No signaling servers provided');
      return;
    }

    let connectedCount = 0;
    const totalServers = serverUrls.length;
    const errors = [];

    serverUrls.forEach((serverUrl) => {
      // Skip if already connected
      if (this.clients.has(serverUrl)) {
        connectedCount++;
        if (connectedCount === totalServers && onConnected) {
          onConnected();
        }
        return;
      }

      const client = new Client({
        webSocketFactory: () => new SockJS(serverUrl),
        reconnectDelay: 5000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
        onWebSocketClose: () => {
          // Auto-reconnect
        },
        
        onConnect: () => {
          setTimeout(() => {
            this.subscribeToSignals(serverUrl, client);
            this.subscribeToPeers(serverUrl, client);
            this.notifyOnline(serverUrl, client);
            
            connectedCount++;
            if (connectedCount === totalServers) {
              if (onConnected) onConnected();
            }
          }, 100);
        },
        
        onStompError: (frame) => {
          console.error(`❌ Signaling error for ${serverUrl}:`, frame);
          errors.push({ serverUrl, error: frame });
          if (onError) onError({ serverUrl, error: frame });
        },
      });

      this.clients.set(serverUrl, client);
      client.activate();
    });
  }

  /**
   * Connect to a single signaling server (backward compatibility)
   */
  connect(peerId, onConnected, onError) {
    // Use WS_BASE_URL from config
    const { WS_BASE_URL } = require('../config/api');
    this.connectToMultiple(peerId, [WS_BASE_URL], onConnected, onError);
  }

  /**
   * Subscribe to signals from a specific server
   */
  subscribeToSignals(serverUrl, client) {
    if (!client || !client.connected) {
      return;
    }

    const peerTopic = `/topic/peer/${this.peerId}`;
    client.subscribe(peerTopic, (message) => {
      const signal = JSON.parse(message.body);

      switch (signal.type) {
        case 'OFFER':
          if (this.onOfferCallback) {
            this.onOfferCallback(signal.from, signal.payload);
          }
          break;

        case 'ANSWER':
          if (this.onAnswerCallback) {
            this.onAnswerCallback(signal.from, signal.payload);
          }
          break;

        case 'ICE_CANDIDATE':
          if (this.onIceCandidateCallback) {
            this.onIceCandidateCallback(signal.from, signal.payload);
          }
          break;

        case 'CALL_REQUEST':
          if (this.onCallRequestCallback) {
            this.onCallRequestCallback(signal.from, signal.payload);
          }
          break;

        case 'CALL_ACCEPT':
          if (this.onCallAcceptCallback) {
            this.onCallAcceptCallback(signal.from, signal.payload);
          }
          break;

        case 'PEER_ONLINE':
          if (this.onPeerOnlineCallback && signal.from !== this.peerId) {
            this.allPeers.add(signal.from);
            this.onPeerOnlineCallback(signal.from);
          }
          break;

        case 'PEER_OFFLINE':
          if (this.onPeerOfflineCallback && signal.from !== this.peerId) {
            this.allPeers.delete(signal.from);
            this.onPeerOfflineCallback(signal.from);
          }
          break;

        default:
          break;
      }
    });
  }

  /**
   * Subscribe to peer status updates from a specific server
   */
  subscribeToPeers(serverUrl, client) {
    if (!client || !client.connected) {
      return;
    }

    client.subscribe('/topic/peers', (message) => {
      const signal = JSON.parse(message.body);
      
      switch (signal.type) {
        case 'PEER_ONLINE':
          if (this.onPeerOnlineCallback && signal.from !== this.peerId) {
            this.allPeers.add(signal.from);
            this.onPeerOnlineCallback(signal.from);
          }
          break;

        case 'PEER_OFFLINE':
          if (this.onPeerOfflineCallback && signal.from !== this.peerId) {
            this.allPeers.delete(signal.from);
            this.onPeerOfflineCallback(signal.from);
          }
          break;

        default:
          break;
      }
    });
  }

  /**
   * Notify a specific server that we're online
   */
  notifyOnline(serverUrl, client) {
    if (!client || !client.connected) return;

    client.publish({
      destination: '/app/signal/peer-online',
      body: JSON.stringify({
        type: 'PEER_ONLINE',
        from: this.peerId,
        timestamp: Date.now()
      })
    });
  }

  /**
   * Notify all servers that we're online
   */
  notifyOnlineAll() {
    this.clients.forEach((client, serverUrl) => {
      this.notifyOnline(serverUrl, client);
    });
  }

  /**
   * Send offer to peer (try all connections)
   */
  sendOffer(toPeerId, offer) {
    let sent = false;
    this.clients.forEach((client, serverUrl) => {
      if (client && client.connected && !sent) {
        client.publish({
          destination: '/app/signal/offer',
          body: JSON.stringify({
            type: 'OFFER',
            from: this.peerId,
            to: toPeerId,
            payload: offer,
            timestamp: Date.now()
          })
        });
        sent = true;
      }
    });
  }

  /**
   * Send answer to peer (try all connections)
   */
  sendAnswer(toPeerId, answer) {
    let sent = false;
    this.clients.forEach((client, serverUrl) => {
      if (client && client.connected && !sent) {
        client.publish({
          destination: '/app/signal/answer',
          body: JSON.stringify({
            type: 'ANSWER',
            from: this.peerId,
            to: toPeerId,
            payload: answer,
            timestamp: Date.now()
          })
        });
        sent = true;
      }
    });
  }

  /**
   * Send ICE candidate to peer (try all connections)
   */
  sendIceCandidate(toPeerId, candidate) {
    let sent = false;
    this.clients.forEach((client, serverUrl) => {
      if (client && client.connected && !sent) {
        client.publish({
          destination: '/app/signal/ice-candidate',
          body: JSON.stringify({
            type: 'ICE_CANDIDATE',
            from: this.peerId,
            to: toPeerId,
            payload: candidate,
            timestamp: Date.now()
          })
        });
        sent = true;
      }
    });
  }

  /**
   * Set callbacks
   */
  onOffer(callback) {
    this.onOfferCallback = callback;
  }

  onAnswer(callback) {
    this.onAnswerCallback = callback;
  }

  onIceCandidate(callback) {
    this.onIceCandidateCallback = callback;
  }

  onPeerOnline(callback) {
    this.onPeerOnlineCallback = callback;
  }

  onPeerOffline(callback) {
    this.onPeerOfflineCallback = callback;
  }

  onCallRequest(callback) {
    this.onCallRequestCallback = callback;
  }

  onCallAccept(callback) {
    this.onCallAcceptCallback = callback;
  }

  /**
   * Disconnect from all servers
   */
  disconnect() {
    this.clients.forEach((client, serverUrl) => {
      if (client) {
        try {
          // Only publish if still connected
          if (client.connected) {
            client.publish({
              destination: '/app/signal/peer-offline',
              body: JSON.stringify({
                type: 'PEER_OFFLINE',
                from: this.peerId,
                timestamp: Date.now()
              })
            });
          }
          client.deactivate();
        } catch (error) {
          console.warn(`Error disconnecting from ${serverUrl}:`, error.message);
        }
      }
    });
    this.clients.clear();
    this.allPeers.clear();
  }

  /**
   * Check if connected to any server
   */
  isConnected() {
    for (const client of this.clients.values()) {
      if (client && client.connected) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get all connected server URLs
   */
  getConnectedServers() {
    const connected = [];
    this.clients.forEach((client, serverUrl) => {
      if (client && client.connected) {
        connected.push(serverUrl);
      }
    });
    return connected;
  }
}

const multiSignalingService = new MultiSignalingService();
export default multiSignalingService;

