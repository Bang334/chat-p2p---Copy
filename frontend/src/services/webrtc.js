import { ICE_SERVERS } from '../config/api';
import peerDiscoveryService from './peerDiscovery';

class WebRTCService {
  constructor() {
    this.peerConnections = new Map(); // Map of peerId -> RTCPeerConnection
    this.dataChannels = new Map();    // Map of peerId -> RTCDataChannel
    this.groupConnections = new Map(); // Map of groupId -> Set of peerIds
    this.receivedMessages = new Map(); // Map of messageId -> timestamp (for deduplication)
    this.onMessageCallback = null;
    this.onTypingCallback = null;
    this.onFileCallback = null;
    this.onGroupMessageCallback = null;
    this.connectionStateCallback = null; // Callback for connection state changes
    this.blockedIPs = new Set(); // Cached blocked IPs
    this.blockedIPsLastUpdate = 0;
    this.BLOCKED_IPS_CACHE_TTL = 10000; // Cache for 10 seconds
    
    // Cleanup old received messages every 60 seconds
    setInterval(() => {
      const now = Date.now();
      const oneMinuteAgo = now - 60000;
      for (const [messageId, timestamp] of this.receivedMessages.entries()) {
        if (timestamp < oneMinuteAgo) {
          this.receivedMessages.delete(messageId);
        }
      }
    }, 60000);
  }

  /**
   * Create peer connection for a remote peer
   */
  createPeerConnection(peerId, signalingService, isInitiator = false) {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(peerId, pc);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signalingService.sendIceCandidate(peerId, event.candidate);
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        if (this.connectionStateCallback) {
          this.connectionStateCallback(peerId, true);
        }
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        if (this.connectionStateCallback) {
          this.connectionStateCallback(peerId, false);
        }
        this.closePeerConnection(peerId);
      }
    };

    // Handle data channel from remote peer
    pc.ondatachannel = (event) => {
      this.setupDataChannel(peerId, event.channel);
    };

    // If initiator, create data channel
    if (isInitiator) {
      const dataChannel = pc.createDataChannel('chat', {
        ordered: true
      });
      this.setupDataChannel(peerId, dataChannel);
    }

    return pc;
  }

  /**
   * Setup data channel event handlers
   */
  setupDataChannel(peerId, dataChannel) {
    // Check if already have a data channel for this peer
    const existingChannel = this.dataChannels.get(peerId);
    if (existingChannel && existingChannel.readyState === 'open') {
      return;
    }
    
    this.dataChannels.set(peerId, dataChannel);

    dataChannel.onopen = () => {
      // Data channel opened
    };

    dataChannel.onclose = () => {
      this.dataChannels.delete(peerId);
    };

    dataChannel.onerror = (error) => {
      console.error(`Data channel error:`, error);
    };

    dataChannel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Message relaying for fault tolerance in group chat
        if (data.groupId && data.messageId) {
          // Check if we've already seen this message
          if (this.receivedMessages.has(data.messageId)) {
            console.log(`⏭️ [relay] Skipping duplicate message ${data.messageId} from ${peerId}`);
            return; // Skip duplicate
          }
          
          // Mark message as received
          this.receivedMessages.set(data.messageId, Date.now());
          console.log(`📨 [relay] Received group message ${data.messageId} from ${peerId}, originalSender: ${data.originalSender}, groupId: ${data.groupId}`);
          
          // Forward to other group members (except sender and original sender)
          const groupPeers = this.groupConnections.get(data.groupId);
          if (groupPeers) {
            console.log(`🔄 [relay] Group peers: ${Array.from(groupPeers).join(', ')}, will relay to others`);
            let relayedCount = 0;
            for (const otherPeerId of groupPeers) {
              // Skip: the peer who sent it to us, and the original sender
              if (otherPeerId !== peerId && otherPeerId !== data.originalSender) {
                const otherChannel = this.dataChannels.get(otherPeerId);
                if (otherChannel && otherChannel.readyState === 'open') {
                  try {
                    otherChannel.send(event.data); // Forward raw message
                    console.log(`✅ [relay] Relayed message ${data.messageId} to ${otherPeerId}`);
                    relayedCount++;
                  } catch (error) {
                    console.warn(`⚠️ [relay] Failed to relay to ${otherPeerId}:`, error);
                  }
                } else {
                  console.warn(`⚠️ [relay] Cannot relay to ${otherPeerId} - channel state: ${otherChannel?.readyState}`);
                }
              } else {
                console.log(`⏭️ [relay] Skipping ${otherPeerId} (${otherPeerId === peerId ? 'sender to me' : 'original sender'})`);
              }
            }
            console.log(`📊 [relay] Relayed to ${relayedCount} peers`);
          } else {
            console.warn(`⚠️ [relay] No group peers found for groupId: ${data.groupId}`);
          }
        }
        
        switch (data.type) {
          case 'text':
            if (this.onMessageCallback) {
              this.onMessageCallback(peerId, data);
            }
            break;
          case 'typing':
            if (this.onTypingCallback) {
              this.onTypingCallback(peerId, data.isTyping);
            }
            break;
          case 'file':
            if (this.onFileCallback) {
              this.onFileCallback(peerId, data);
            }
            break;
          case 'file-start':
          case 'file-chunk':
          case 'file-end':
            // File chunking handled by onMessage callback in Chat.js
            if (this.onMessageCallback) {
              this.onMessageCallback(peerId, data);
            }
            break;
          case 'group-invitation':
          case 'member-joined':
            // Group invitation and member-joined handled by onMessage callback in Chat.js
            if (this.onMessageCallback) {
              this.onMessageCallback(peerId, data);
            }
            break;
          default:
            console.warn('Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('Error parsing P2P message:', error);
      }
    };
  }

  /**
   * Create and send offer to remote peer
   */
  async createOffer(peerId, signalingService) {
    const pc = this.peerConnections.get(peerId);
    if (!pc) {
      throw new Error('Peer connection not found');
    }

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      signalingService.sendOffer(peerId, offer);
    } catch (error) {
      console.error('Error creating offer:', error);
      throw error;
    }
  }

  /**
   * Handle received offer from remote peer
   */
  async handleOffer(peerId, offer, signalingService, currentPeerId = null) {
    let pc = this.peerConnections.get(peerId);
    
    // If connection already stable/connected, decide whether to reconnect
    if (pc && pc.signalingState === 'stable') {
      const iceState = pc.iceConnectionState;
      
      // If connection is healthy, ignore the offer
      if (iceState === 'connected' || iceState === 'completed') {
        return;
      }
      
      // If connection is failed/disconnected, restart
      this.closePeerConnection(peerId);
      pc = null;
    }
    
    // Handle glare: both sides sent offer at the same time
    if (pc && pc.signalingState === 'have-local-offer') {
      const myPeerId = currentPeerId || signalingService.peerId;
      if (myPeerId && myPeerId < peerId) {
        return; // Ignore the incoming offer
      } else {
        this.closePeerConnection(peerId);
        pc = null;
      }
    }
    
    if (!pc) {
      pc = this.createPeerConnection(peerId, signalingService, false);
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      // Process any queued ICE candidates
      await this.processQueuedCandidates(peerId);
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signalingService.sendAnswer(peerId, answer);
    } catch (error) {
      console.error(`❌ Error handling offer from ${peerId}:`, error);
      return;
    }
  }

  /**
   * Handle received answer from remote peer
   * Prevents duplicate answer handling
   */
  async handleAnswer(peerId, answer) {
    const pc = this.peerConnections.get(peerId);
    if (!pc) {
      console.warn(`handleAnswer: No peer connection found for ${peerId}`);
      return;
    }

    // Always check if already stable or closed - these are final states
    if (pc.signalingState === 'stable' || pc.signalingState === 'closed') {
      return;
    }
    
    // Only handle answer if we have a local offer
    if (pc.signalingState !== 'have-local-offer') {
      console.warn(`⚠️ handleAnswer: Wrong state ${pc.signalingState} for ${peerId}, expected 'have-local-offer'. Ignoring.`);
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      
      // Process any queued ICE candidates
      await this.processQueuedCandidates(peerId);
    } catch (error) {
      // Check if it's because we're in wrong state now
      if (error.name !== 'InvalidStateError') {
        console.warn(`⚠️ Unexpected error handling answer from ${peerId}:`, error.message);
      }
      // Don't throw - this is safe to ignore as connection may be already established
    }
  }

  /**
   * Handle received ICE candidate
   */
  async handleIceCandidate(peerId, candidate) {
    const pc = this.peerConnections.get(peerId);
    if (!pc) {
      return;
    }

    // Initialize queue if not exists
    if (!this.candidateQueues) {
      this.candidateQueues = new Map();
    }
    if (!this.candidateQueues.has(peerId)) {
      this.candidateQueues.set(peerId, []);
    }

    try {
      // If remote description is set, add candidate immediately
      if (pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        // Otherwise queue it
        console.log(`❄️ Queuing ICE candidate for ${peerId} (Remote description not set)`);
        this.candidateQueues.get(peerId).push(candidate);
      }
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }

  /**
   * Process queued ICE candidates
   */
  async processQueuedCandidates(peerId) {
    if (!this.candidateQueues || !this.candidateQueues.has(peerId)) return;

    const pc = this.peerConnections.get(peerId);
    if (!pc || !pc.remoteDescription) return;

    const queue = this.candidateQueues.get(peerId);
    console.log(`❄️ Processing ${queue.length} queued ICE candidates for ${peerId}`);
    
    while (queue.length > 0) {
      const candidate = queue.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error adding queued ICE candidate:', error);
      }
    }
  }

  /**
   * Send text message via P2P data channel
   * Auto-creates connection if not exists
   */
  async sendMessage(peerId, message, groupId = null, signalingService = null, myPeerId = null, type = 'text') {
    // Check if data channel exists and is open
    let dataChannel = this.dataChannels.get(peerId);
    
    if (!dataChannel || dataChannel.readyState !== 'open') {
      // Check if connection already exists
      const existingConnection = this.peerConnections.get(peerId);
      
      // If connection exists and is healthy (or connecting), wait for it
      if (existingConnection && ['new', 'checking', 'connected', 'completed'].includes(existingConnection.iceConnectionState)) {
        console.log(`⏳ sendMessage: Waiting for connection with ${peerId} (State: ${existingConnection.iceConnectionState})`);
        
        // Poll for data channel to open (max 10 seconds)
        let attempts = 0;
        const maxAttempts = 100; // 100 * 100ms = 10 seconds
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
          dataChannel = this.dataChannels.get(peerId);
          if (dataChannel && dataChannel.readyState === 'open') {
            break;
          }
          // Check if connection failed while waiting
          if (['failed', 'disconnected', 'closed'].includes(existingConnection.iceConnectionState)) {
            break;
          }
          attempts++;
        }
      }

      // Re-check data channel
      dataChannel = this.dataChannels.get(peerId);

      if (!dataChannel || dataChannel.readyState !== 'open') {
        if (!signalingService) {
          throw new Error('Signaling service required to create connection');
        } else {
          console.log(`🔄 sendMessage: Recreating connection to ${peerId}`);
          // Auto-create peer connection
          await this.createPeerConnection(peerId, signalingService, true);
          await this.createOffer(peerId, signalingService);
          
          // Poll for data channel to open (max 10 seconds)
          let attempts = 0;
          const maxAttempts = 100; // 100 * 100ms = 10 seconds
          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            dataChannel = this.dataChannels.get(peerId);
            if (dataChannel && dataChannel.readyState === 'open') {
              break;
            }
            attempts++;
          }
          
          if (!dataChannel || dataChannel.readyState !== 'open') {
            throw new Error('Failed to establish data channel');
          }
        }
      }
    }

    const data = {
      type: type,
      content: message,
      timestamp: Date.now(),
      groupId: groupId,  // Add groupId to distinguish group messages
      messageId: groupId ? `${groupId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : null,
      originalSender: myPeerId || peerId  // Track original sender for relaying
    };

    // Mark our own message as received to prevent relay loops
    if (groupId && data.messageId) {
      this.receivedMessages.set(data.messageId, Date.now());
    }

    try {
      dataChannel.send(JSON.stringify(data));
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Send typing indicator
   */
  sendTyping(peerId, isTyping) {
    const dataChannel = this.dataChannels.get(peerId);
    
    if (!dataChannel || dataChannel.readyState !== 'open') {
      return;
    }

    const data = {
      type: 'typing',
      isTyping,
      timestamp: Date.now()
    };

    try {
      dataChannel.send(JSON.stringify(data));
    } catch (error) {
      console.error('Error sending typing indicator:', error);
    }
  }

  /**
   * Send file via P2P data channel
   * Auto-creates connection if not exists
   */
  async sendFile(peerId, file, groupId = null, signalingService = null) {
    // Check if data channel exists and is open
    let dataChannel = this.dataChannels.get(peerId);
    
    if (!dataChannel || dataChannel.readyState !== 'open') {
      // Check if connection already exists
      const existingConnection = this.peerConnections.get(peerId);
      
      // If connection exists and is healthy (or connecting), wait for it
      if (existingConnection && ['new', 'checking', 'connected', 'completed'].includes(existingConnection.iceConnectionState)) {
        console.log(`⏳ sendFile: Waiting for connection with ${peerId} (State: ${existingConnection.iceConnectionState})`);
        
        // Poll for data channel to open (max 10 seconds)
        let attempts = 0;
        const maxAttempts = 100; // 100 * 100ms = 10 seconds
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
          dataChannel = this.dataChannels.get(peerId);
          if (dataChannel && dataChannel.readyState === 'open') {
            break;
          }
          // Check if connection failed while waiting
          if (['failed', 'disconnected', 'closed'].includes(existingConnection.iceConnectionState)) {
            break;
          }
          attempts++;
        }
      }

      // Re-check data channel
      dataChannel = this.dataChannels.get(peerId);

      if (!dataChannel || dataChannel.readyState !== 'open') {
        if (!signalingService) {
          throw new Error('Signaling service required to create connection');
        } else {
          console.log(`🔄 sendFile: Recreating connection to ${peerId}`);
          // Auto-create peer connection
          await this.createPeerConnection(peerId, signalingService, true);
          await this.createOffer(peerId, signalingService);
          
          // Poll for data channel to open (max 10 seconds)
          let attempts = 0;
          const maxAttempts = 100; // 100 * 100ms = 10 seconds
          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            dataChannel = this.dataChannels.get(peerId);
            if (dataChannel && dataChannel.readyState === 'open') {
              break;
            }
            attempts++;
          }
          
          if (!dataChannel || dataChannel.readyState !== 'open') {
            throw new Error('Failed to establish data channel');
          }
        }
      }
    }

    // Convert file to base64 and send in chunks
    const reader = new FileReader();
    
    return new Promise((resolve, reject) => {
      reader.onload = async () => {
        const base64Data = reader.result;
        const chunkSize = 256000; // 256KB chunks (maximum safe size for WebRTC)
        
        try {
          // Extract actual data (without header)
          const dataStart = base64Data.indexOf(',') + 1;
          const actualData = base64Data.substring(dataStart);
          
          // Send file metadata first
          const metadata = {
            type: 'file-start',
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            totalChunks: Math.ceil(actualData.length / chunkSize),
            timestamp: Date.now(),
            groupId: groupId
          };
          
          // Send metadata
          dataChannel.send(JSON.stringify(metadata));
          
          // Set buffer threshold for flow control
          const bufferThreshold = 65536; // 64KB
          dataChannel.bufferedAmountLowThreshold = bufferThreshold;
          
          // Send chunks with adaptive delay based on buffer
          for (let i = 0; i < actualData.length; i += chunkSize) {
            // Check if data channel is still open
            if (dataChannel.readyState !== 'open') {
              throw new Error('Data channel closed while sending chunks');
            }
            
            // Wait if buffer is too full
            while (dataChannel.bufferedAmount > bufferThreshold) {
              await new Promise(resolve => setTimeout(resolve, 10));
            }
            
            const chunk = actualData.substring(i, i + chunkSize);
            const chunkData = {
              type: 'file-chunk',
              chunkIndex: Math.floor(i / chunkSize),
              data: chunk,
              groupId: groupId
            };
            
            dataChannel.send(JSON.stringify(chunkData));
          }
          
          // Send file end marker
          const endMarker = {
            type: 'file-end',
            fileName: file.name,
            groupId: groupId
          };
          dataChannel.send(JSON.stringify(endMarker));
          
          resolve();
        } catch (error) {
          console.error('❌ Error sending file:', error);
          reject(error);
        }
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Check if connected to peer
   */
  isConnected(peerId) {
    const pc = this.peerConnections.get(peerId);
    return pc && pc.connectionState === 'connected';
  }

  /**
   * Close connection with peer
   */
  closePeerConnection(peerId) {
    const dataChannel = this.dataChannels.get(peerId);
    if (dataChannel) {
      dataChannel.close();
      this.dataChannels.delete(peerId);
    }

    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }
  }

  /**
   * Close all connections
   */
  closeAllConnections() {
    for (const peerId of this.peerConnections.keys()) {
      this.closePeerConnection(peerId);
    }
  }

  /**
   * Set callback for received messages
   */
  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  /**
   * Set callback for typing indicators
   */
  onTyping(callback) {
    this.onTypingCallback = callback;
  }

  /**
   * Set callback for received files
   */
  onFile(callback) {
    this.onFileCallback = callback;
  }

  /**
   * Set callback for group messages
   */
  onGroupMessage(callback) {
    this.onGroupMessageCallback = callback;
  }

  /**
   * Connect to all peers in a group (Mesh network)
   */
  async connectToGroup(groupId, peerIds, signalingService, myPeerId = null) {
    if (!this.groupConnections.has(groupId)) {
      this.groupConnections.set(groupId, new Set());
    }

    const connectedPeers = this.groupConnections.get(groupId);
    
    // Include myself in the group connections if myPeerId is provided
    if (myPeerId) {
      connectedPeers.add(myPeerId);
      console.log(`🔗 [connectToGroup] Group: ${groupId}, My peerId: ${myPeerId}, Peers to connect: ${Array.from(peerIds).join(', ')}`);
    } else {
      console.log(`🔗 [connectToGroup] Group: ${groupId}, Peers to connect: ${Array.from(peerIds).join(', ')}`);
    }

    for (const peerId of peerIds) {
      // Skip myself
      if (myPeerId && peerId === myPeerId) {
        console.log(`⏭️ [connectToGroup] Skipping myself: ${peerId}`);
        continue;
      }
      
      // Skip if already in this group
      if (connectedPeers.has(peerId)) {
        console.log(`⏭️ [connectToGroup] ${peerId} already in group ${groupId}`);
        continue;
      }

      // Check if we have a working connection with this peer
      const pc = this.peerConnections.get(peerId);
      const dataChannel = this.dataChannels.get(peerId);
      if (pc && this.isConnected(peerId) && dataChannel && dataChannel.readyState === 'open') {
        console.log(`✅ [connectToGroup] Using existing connection with ${peerId} for group ${groupId}`);
        connectedPeers.add(peerId);
        continue;
      }

      // Create connection if not exists
      if (!pc) {
        console.log(`📤 [connectToGroup] Creating new connection to ${peerId} for group ${groupId}`);
        this.createPeerConnection(peerId, signalingService, true);
        await this.createOffer(peerId, signalingService);
      } else {
        // Connection exists, check status
        console.log(`⚠️ [connectToGroup] Connection exists: ${peerId}, PC state: ${pc.connectionState}, DC state: ${dataChannel?.readyState}`);
        
        // If connection is failed or closed, recreate it
        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
             console.log(`🔄 [connectToGroup] Recreating failed connection to ${peerId}`);
             this.closePeerConnection(peerId);
             this.createPeerConnection(peerId, signalingService, true);
             await this.createOffer(peerId, signalingService);
        } 
        // If connected but no data channel, create it
        else if (!dataChannel) {
             console.log(`🔌 [connectToGroup] Creating missing data channel for ${peerId}`);
             const newDc = pc.createDataChannel('chat', { ordered: true });
             this.setupDataChannel(peerId, newDc);
        }
      }

      connectedPeers.add(peerId);
    }

    console.log(`✅ [connectToGroup] Group ${groupId} mesh network (${connectedPeers.size} peers): ${Array.from(connectedPeers).join(', ')}`);
  }

  /**
   * Check if a peer is blocked (by IP)
   * Uses cached blocked IPs to avoid frequent API calls
   */
  async isPeerBlocked(peerId) {
    // Refresh cache if expired
    const now = Date.now();
    if (now - this.blockedIPsLastUpdate > this.BLOCKED_IPS_CACHE_TTL) {
      this.blockedIPs = await peerDiscoveryService.getBlockedIPs();
      this.blockedIPsLastUpdate = now;
    }

    // Get peerId -> IP mapping
    const peerIdToIP = peerDiscoveryService.getPeerIdToIPMap();
    const peerIP = peerIdToIP.get(peerId);

    if (!peerIP) {
      // If we don't know the IP, assume not blocked (conservative approach)
      return false;
    }

    return this.blockedIPs.has(peerIP);
  }

  /**
   * Send message to all peers in group (broadcast)
   * Auto-creates connections if needed
   * Fault tolerance: Skip blocked peers, rely on message relaying
   */
  async sendGroupMessage(groupId, message, signalingService = null, myPeerId = null, type = 'text') {
    const peerIds = this.groupConnections.get(groupId);
    
    if (!peerIds || peerIds.size === 0) {
      console.error('No peers connected in group', groupId);
      throw new Error('No peers in group');
    }

    if (!myPeerId) {
      console.error('sendGroupMessage: myPeerId is required but was not provided');
      throw new Error('myPeerId is required');
    }

    // Generate unique message ID for this group message
    const messageId = `${groupId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Mark as received to prevent relay loops
    this.receivedMessages.set(messageId, Date.now());

    // Filter out the sender from recipients (don't send to yourself)
    let recipients = Array.from(peerIds).filter(peerId => peerId !== myPeerId);
    
    // Filter out blocked peers - they will receive via message relaying
    const blockedPeers = [];
    const unblockedRecipients = [];
    
    for (const peerId of recipients) {
      const isBlocked = await this.isPeerBlocked(peerId);
      if (isBlocked) {
        blockedPeers.push(peerId);
        console.log(`🚫 [sendGroupMessage] Skipping blocked peer ${peerId} (will receive via relay)`);
      } else {
        unblockedRecipients.push(peerId);
      }
    }
    
    recipients = unblockedRecipients;
    
    console.log(`📤 [sendGroupMessage] Group: ${groupId}, Sender: ${myPeerId}, Recipients: ${recipients.join(', ')}, Blocked: ${blockedPeers.join(', ') || 'none'}, MessageId: ${messageId}`);

    if (recipients.length === 0) {
      if (blockedPeers.length > 0) {
        console.log(`ℹ️ [sendGroupMessage] All peers are blocked, message will be relayed by other group members`);
      } else {
        console.warn(`⚠️ [sendGroupMessage] No recipients to send to (only sender in group)`);
      }
      return { sent: 0, failed: 0, blocked: blockedPeers.length };
    }

    let sentCount = 0;
    const failedPeers = [];

    for (const peerId of recipients) {
      try {
        // Send with messageId and originalSender for relaying
        const dataChannel = this.dataChannels.get(peerId);
        if (dataChannel && dataChannel.readyState === 'open') {
          const data = {
            type: type,
            content: message,
            timestamp: Date.now(),
            groupId: groupId,
            messageId: messageId,
            originalSender: myPeerId  // Fixed: always use myPeerId, not peerId
          };
          dataChannel.send(JSON.stringify(data));
          console.log(`✅ [sendGroupMessage] Sent to ${peerId}`);
          sentCount++;
        } else {
          console.warn(`⚠️ [sendGroupMessage] Data channel not open for ${peerId}, state: ${dataChannel?.readyState}`);
          throw new Error('Data channel not open');
        }
      } catch (error) {
        console.error(`❌ [sendGroupMessage] Failed to send to ${peerId}:`, error);
        failedPeers.push(peerId);
      }
    }

    if (failedPeers.length > 0) {
      console.warn('⚠️ [sendGroupMessage] Failed to send group message to peers:', failedPeers);
    }

    if (blockedPeers.length > 0) {
      console.log(`🔄 [sendGroupMessage] Blocked peers (${blockedPeers.length}) will receive via message relaying from other group members`);
    }

    console.log(`📊 [sendGroupMessage] Result: ${sentCount} sent, ${failedPeers.length} failed, ${blockedPeers.length} blocked (will relay)`);
    return { sent: sentCount, failed: failedPeers.length, blocked: blockedPeers.length };
  }

  /**
   * Send file to all peers in group (broadcast)
   * Auto-creates connections if needed
   */
  async sendGroupFile(groupId, file, signalingService = null) {
    const peerIds = this.groupConnections.get(groupId);
    
    if (!peerIds || peerIds.size === 0) {
      console.error('No peers connected in group', groupId);
      throw new Error('No peers in group');
    }

    let sentCount = 0;
    const failedPeers = [];

    for (const peerId of peerIds) {
      try {
        await this.sendFile(peerId, file, groupId, signalingService);  // Pass groupId to distinguish group files
        sentCount++;
      } catch (error) {
        console.error(`Failed to send file to ${peerId}:`, error);
        failedPeers.push(peerId);
      }
    }

    if (failedPeers.length > 0) {
      console.warn('Failed to send group file to peers:', failedPeers);
    }

    return { sent: sentCount, failed: failedPeers.length };
  }

  /**
   * Disconnect from a group
   */
  disconnectFromGroup(groupId) {
    const peerIds = this.groupConnections.get(groupId);
    
    if (!peerIds) return;


    // Note: Don't close connections as peer might be in multiple groups
    // Just remove from group tracking
    this.groupConnections.delete(groupId);
  }

  /**
   * Get connected peers in a group
   */
  getGroupPeers(groupId) {
    return this.groupConnections.get(groupId) || new Set();
  }

  /**
   * Check if connected to all peers in group
   */
  isGroupConnected(groupId) {
    const peerIds = this.groupConnections.get(groupId);
    if (!peerIds || peerIds.size === 0) return false;

    // Check if all peers are actually connected
    for (const peerId of peerIds) {
      if (!this.isConnected(peerId)) {
        return false;
      }
    }

    return true;
  }
}

const webrtcService = new WebRTCService();
export default webrtcService;

