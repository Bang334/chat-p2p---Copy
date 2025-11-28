import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { WS_BASE_URL } from '../config/api';

class SignalingService {
  constructor() {
    this.client = null;
    this.peerId = null;
    this.onOfferCallback = null;
    this.onAnswerCallback = null;
    this.onIceCandidateCallback = null;
    this.onPeerOnlineCallback = null;
    this.onPeerOfflineCallback = null;
    this.onCallRequestCallback = null;
    this.onCallAcceptCallback = null;
  }

  /**
   * Connect to signaling server
   */
  connect(peerId, onConnected, onError) {
    this.peerId = peerId;

    this.client = new Client({
      webSocketFactory: () => new SockJS(WS_BASE_URL),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      onWebSocketClose: () => {
        // Auto-reconnect on close (including page refresh)
      },
      
      onConnect: () => {
        setTimeout(() => {
          this.subscribeToSignals();
          this.subscribeToPeers();
          this.notifyOnline();
          if (onConnected) onConnected();
        }, 100);
      },
      
      onStompError: (frame) => {
        console.error('❌ Signaling error:', frame);
        if (onError) onError(frame);
      },
    });

    this.client.activate();
  }

  /**
   * Subscribe to personal signal queue
   */
  subscribeToSignals() {
    if (!this.client || !this.client.connected) {
      return;
    }

    const peerTopic = `/topic/peer/${this.peerId}`;
    this.client.subscribe(peerTopic, (message) => {
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

        case 'GROUP_MEMBER_JOINED':
          if (this.onGroupMemberJoinedCallback) {
            this.onGroupMemberJoinedCallback(signal.payload);
          }
          break;

        case 'GROUP_MEMBER_LEFT':
          if (this.onGroupMemberLeftCallback) {
            this.onGroupMemberLeftCallback(signal.payload);
          }
          break;

        case 'PEER_ONLINE':
          if (this.onPeerOnlineCallback && signal.from !== this.peerId) {
            this.onPeerOnlineCallback(signal.from);
          }
          break;

        case 'PEER_OFFLINE':
          if (this.onPeerOfflineCallback && signal.from !== this.peerId) {
            this.onPeerOfflineCallback(signal.from);
          }
          break;

        default:
          break;
      }
    });
  }

  /**
   * Subscribe to peer status updates
   */
  subscribeToPeers() {
    if (!this.client || !this.client.connected) {
      return;
    }

    this.client.subscribe('/topic/peers', (message) => {
      const signal = JSON.parse(message.body);
      
      switch (signal.type) {
        case 'PEER_ONLINE':
          if (this.onPeerOnlineCallback && signal.from !== this.peerId) {
            this.onPeerOnlineCallback(signal.from);
          }
          break;

        case 'PEER_OFFLINE':
          if (this.onPeerOfflineCallback && signal.from !== this.peerId) {
            this.onPeerOfflineCallback(signal.from);
          }
          break;

        default:
          break;
      }
    });
  }

  /**
   * Notify server that we're online
   */
  notifyOnline() {
    if (!this.client || !this.client.connected) return;

    this.client.publish({
      destination: '/app/signal/peer-online',
      body: JSON.stringify({
        type: 'PEER_ONLINE',
        from: this.peerId,
        timestamp: Date.now()
      })
    });
  }

  /**
   * Notify server that we're offline
   */
  notifyOffline() {
    if (!this.client || !this.client.connected) return;

    this.client.publish({
      destination: '/app/signal/peer-offline',
      body: JSON.stringify({
        type: 'PEER_OFFLINE',
        from: this.peerId,
        timestamp: Date.now()
      })
    });
  }

  /**
   * Send WebRTC offer to peer
   */
  sendOffer(toPeerId, offer) {
    if (!this.client || !this.client.connected) {
      return;
    }

    this.client.publish({
      destination: '/app/signal/offer',
      body: JSON.stringify({
        type: 'OFFER',
        from: this.peerId,
        to: toPeerId,
        payload: offer,
        timestamp: Date.now()
      })
    });
  }

  /**
   * Send WebRTC answer to peer
   */
  sendAnswer(toPeerId, answer) {
    if (!this.client || !this.client.connected) {
      return;
    }

    this.client.publish({
      destination: '/app/signal/answer',
      body: JSON.stringify({
        type: 'ANSWER',
        from: this.peerId,
        to: toPeerId,
        payload: answer,
        timestamp: Date.now()
      })
    });
  }

  /**
   * Send ICE candidate to peer
   */
  sendIceCandidate(toPeerId, candidate) {
    if (!this.client || !this.client.connected) {
      return;
    }

    this.client.publish({
      destination: '/app/signal/ice-candidate',
      body: JSON.stringify({
        type: 'ICE_CANDIDATE',
        from: this.peerId,
        to: toPeerId,
        payload: candidate,
        timestamp: Date.now()
      })
    });
  }

  /**
   * Send call request to peer
   */
  sendCallRequest(toPeerId, payload = {}) {
    if (!this.client || !this.client.connected) {
      return;
    }

    this.client.publish({
      destination: '/app/signal/call-request',
      body: JSON.stringify({
        type: 'CALL_REQUEST',
        from: this.peerId,
        to: toPeerId,
        payload,
        timestamp: Date.now()
      })
    });
  }

  sendCallAccept(toPeerId, payload = {}) {
    if (!this.client || !this.client.connected) {
      return;
    }

    this.client.publish({
      destination: '/app/signal/call-accept',
      body: JSON.stringify({
        type: 'CALL_ACCEPT',
        from: this.peerId,
        to: toPeerId,
        payload,
        timestamp: Date.now()
      })
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

  onGroupMemberJoined(callback) {
    this.onGroupMemberJoinedCallback = callback;
  }

  onGroupMemberLeft(callback) {
    this.onGroupMemberLeftCallback = callback;
  }

  /**
   * Disconnect from signaling server
   */
  disconnect() {
    if (this.client) {
      this.notifyOffline();
      this.client.deactivate();
      this.client = null;
    }
  }

  isConnected() {
    return this.client && this.client.connected;
  }
}

const signalingService = new SignalingService();
export default signalingService;

