import React, { useState } from 'react';
import { FiX, FiUserPlus } from 'react-icons/fi';
import './CreateGroupModal.css'; // Reuse styles

function InviteMemberModal({ isOpen, onClose, onlinePeers, currentMembers, onInvite, showNotification }) {
  const [selectedPeers, setSelectedPeers] = useState(new Set());

  const handleTogglePeer = (peerId) => {
    const newSelected = new Set(selectedPeers);
    if (newSelected.has(peerId)) {
      newSelected.delete(peerId);
    } else {
      newSelected.add(peerId);
    }
    setSelectedPeers(newSelected);
  };

  const handleInvite = () => {
    if (selectedPeers.size === 0) {
      if (showNotification) {
        showNotification('Vui lòng chọn ít nhất 1 thành viên', 'warning');
      } else {
        alert('Vui lòng chọn ít nhất 1 thành viên');
      }
      return;
    }

    onInvite(Array.from(selectedPeers));
    setSelectedPeers(new Set());
    onClose();
  };

  if (!isOpen) return null;

  // Filter out peers who are already in the group
  const availablePeers = Array.from(onlinePeers.entries()).filter(([peerId]) => !currentMembers.includes(peerId));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <FiUserPlus />
            <h3>Mời Thành Viên Mới</h3>
          </div>
          <button className="close-modal-btn" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>Chọn Thành Viên Online ({selectedPeers.size} đã chọn)</label>
            <div className="user-select-list">
              {availablePeers.map(([peerId, username]) => (
                <div
                  key={peerId}
                  className={`user-select-item ${selectedPeers.has(peerId) ? 'selected' : ''}`}
                  onClick={() => handleTogglePeer(peerId)}
                >
                  <div className="user-select-avatar">
                    {username.charAt(0).toUpperCase()}
                  </div>
                  <div className="user-select-info">
                    <div className="user-select-name">{username}</div>
                    <div style={{ fontSize: '12px', color: '#31a24c' }}>● Online</div>
                  </div>
                  <div className="user-select-checkbox">
                    {selectedPeers.has(peerId) && '✓'}
                  </div>
                </div>
              ))}
              
              {availablePeers.length === 0 && (
                <div className="no-friends-message">
                  <p>Không có user online nào mới để mời</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Hủy
          </button>
          <button 
            className="btn-primary" 
            onClick={handleInvite}
            disabled={selectedPeers.size === 0}
          >
            Mời
          </button>
        </div>
      </div>
    </div>
  );
}

export default InviteMemberModal;
