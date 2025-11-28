import React from 'react';
import { FiX } from 'react-icons/fi';
import peerDiscoveryService from '../services/peerDiscovery';
import './PeerDiscoveryModal.css';

function PeerDiscoveryModal({ isOpen, onClose, discoveredPeers, onlinePeers = new Map() }) {
  console.log('PeerDiscoveryModal - onlinePeers:', Array.from(onlinePeers.entries()));
  console.log('PeerDiscoveryModal - discoveredPeers:', discoveredPeers);
  
  // Get peerId -> IP mapping from peerDiscoveryService
  const peerIdToIPMap = peerDiscoveryService.getPeerIdToIPMap();

  return (
    <>
      {isOpen && (
        <div className="modal-overlay" onClick={onClose}>
          <div className="peer-discovery-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Danh sách kết nối ({onlinePeers.size})</h2>
              <button className="close-btn" onClick={onClose}>
                <FiX />
              </button>
            </div>

            <div className="modal-content">
              {/* Connected Peers Section */}
              <div className="connected-peers-section">
                {onlinePeers.size > 0 ? (
                  <div className="peers-list">
                    {Array.from(onlinePeers.entries()).map(([peerId, username]) => {
                      // Try multiple methods to get IP:
                      // 1) From peerIdToIPMap (most reliable - from peerDiscoveryService)
                      // 2) From discoveredPeers by username
                      // 3) From discoveredPeers by peerId
                      // 4) Extract from signalingUrl
                      
                      let ip = peerIdToIPMap.get(peerId);
                      
                      if (!ip) {
                        // Try to find in discoveredPeers by username
                        let discovered = discoveredPeers.find(p => p.username === username);
                        if (!discovered) {
                          // Try to find by peerId
                          discovered = discoveredPeers.find(p => p.peerId === peerId);
                        }
                        
                        if (discovered?.ip) {
                          ip = discovered.ip;
                        } else if (discovered?.signalingUrl) {
                          // Extract IP from signalingUrl
                          const urlMatch = discovered.signalingUrl.match(/http:\/\/([0-9.]+):/);
                          if (urlMatch) {
                            ip = urlMatch[1];
                          }
                        }
                      }
                      
                      // Fallback message if still no IP
                      if (!ip) {
                        ip = 'Đang cập nhật IP...';
                      }
                      
                      const initials = username ? username.charAt(0).toUpperCase() : '?';
                      
                      return (
                        <div key={peerId} className="peer-item">
                          <div className="peer-avatar">
                            {initials}
                          </div>
                          <div className="peer-info">
                            <div className="peer-username">{username}</div>
                            <div className="peer-ip-text">{ip}</div>
                          </div>
                          <div className="peer-status-badge">
                            <span className="status-dot-small online"></span>
                            <span>Online</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state-small">
                    Chưa có kết nối nào.
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="cancel-btn" onClick={onClose}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default PeerDiscoveryModal;


