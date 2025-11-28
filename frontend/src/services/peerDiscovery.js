/**
 * Peer Discovery Service - Tự động tìm peers trong cùng mạng local
 * Sử dụng UDP broadcast discovery qua backend REST API
 */

import { API_BASE_URL } from '../config/api';

class PeerDiscoveryService {
  constructor() {
    this.discoveredPeers = new Map(); // IP -> { peerId, username, lastSeen, port, signalingUrl }
    this.pollInterval = null;
    this.onPeerDiscoveredCallback = null;
    this.apiBaseUrl = API_BASE_URL;
  }

  /**
   * Start discovery - Poll backend để lấy danh sách peers được phát hiện qua UDP
   * Backend tự động lắng nghe UDP broadcasts và cập nhật danh sách peers
   */
  startDiscovery(myIP, onPeerDiscovered) {
    this.onPeerDiscoveredCallback = onPeerDiscovered;
    
    console.log('🔍 Starting UDP-based peer discovery');

    // Poll backend để lấy discovered peers
    this.pollDiscoveredPeers();
    
    // Repeat poll every 3 seconds
    this.pollInterval = setInterval(() => {
      this.pollDiscoveredPeers();
    }, 3000);
  }

  /**
   * Poll backend để lấy danh sách discovered peers
   */
  async pollDiscoveredPeers() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/discovery/peers`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn('Failed to fetch discovered peers:', response.status);
        return;
      }

      const peers = await response.json();
      const now = Date.now();

      // Update discovered peers
      for (const [ip, peerInfo] of Object.entries(peers)) {
        const existing = this.discoveredPeers.get(ip);
        
        // Check if this is a new peer or updated info
        if (!existing || 
            existing.peerId !== peerInfo.peerId || 
            existing.username !== peerInfo.username ||
            (now - existing.lastSeen) > 5000) {
          
          this.discoveredPeers.set(ip, {
            ip: peerInfo.ip,
            peerId: peerInfo.peerId,
            username: peerInfo.username,
            port: peerInfo.port,
            signalingUrl: peerInfo.signalingUrl,
            lastSeen: peerInfo.lastSeen || now
          });

          // Notify callback about new/updated peer
          if (this.onPeerDiscoveredCallback) {
            this.onPeerDiscoveredCallback(ip, peerInfo);
          }
        } else {
          // Update last seen
          existing.lastSeen = peerInfo.lastSeen || now;
        }
      }

      // Remove peers that are no longer in the list (stale)
      const currentIPs = new Set(Object.keys(peers));
      for (const ip of this.discoveredPeers.keys()) {
        if (!currentIPs.has(ip)) {
          this.discoveredPeers.delete(ip);
        }
      }
    } catch (error) {
      console.warn('Error polling discovered peers:', error);
    }
  }

  /**
   * Broadcast peer information to network
   * Gọi khi peer online để các peers khác phát hiện
   */
  async broadcastPeerInfo(peerId, username) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/discovery/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          peerId,
          username
        })
      });

      if (response.ok) {
        console.log('📢 Broadcasted peer info to network');
      } else {
        console.warn('Failed to broadcast peer info:', response.status);
      }
    } catch (error) {
      console.error('Error broadcasting peer info:', error);
    }
  }


  /**
   * Stop discovery
   */
  stopDiscovery() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
  }

  /**
   * Get discovered peers
   * Returns array of peer objects with full info
   */
  getDiscoveredPeers() {
    const now = Date.now();
    const activePeers = [];
    
    for (const [ip, peer] of this.discoveredPeers.entries()) {
      // Only return peers seen in last 30 seconds
      if (now - peer.lastSeen < 30000) {
        activePeers.push({
          ip: peer.ip,
          peerId: peer.peerId,
          username: peer.username,
          port: peer.port,
          signalingUrl: peer.signalingUrl,
          lastSeen: peer.lastSeen
        });
      }
    }
    
    return activePeers;
  }

  /**
   * Get discovered peers as simple IP array (backward compatibility)
   */
  getDiscoveredPeerIPs() {
    return this.getDiscoveredPeers().map(peer => peer.ip);
  }

  /**
   * Get blocked IPs from backend
   */
  async getBlockedIPs() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/discovery/blocked-ips`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn('Failed to fetch blocked IPs:', response.status);
        return new Set();
      }

      const data = await response.json();
      return new Set(data.blockedIPs || []);
    } catch (error) {
      console.warn('Error fetching blocked IPs:', error);
      return new Set();
    }
  }

  /**
   * Get mapping of peerId -> IP from discovered peers
   */
  getPeerIdToIPMap() {
    const map = new Map();
    for (const [ip, peer] of this.discoveredPeers.entries()) {
      if (peer.peerId) {
        map.set(peer.peerId, ip);
      }
    }
    return map;
  }
}

const peerDiscoveryService = new PeerDiscoveryService();
export default peerDiscoveryService;

