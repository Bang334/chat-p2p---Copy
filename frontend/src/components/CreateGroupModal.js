import React, { useState } from 'react';
import { FiX, FiUsers } from 'react-icons/fi';
import './CreateGroupModal.css';

function CreateGroupModal({ isOpen, onClose, onlinePeers, onCreateGroup, showNotification }) {
  const [groupName, setGroupName] = useState('');
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

  const handleCreate = () => {
    if (!groupName.trim()) {
      if (showNotification) {
        showNotification('Vui lòng nhập tên nhóm', 'warning');
      } else {
        alert('Vui lòng nhập tên nhóm');
      }
      return;
    }

    if (selectedPeers.size === 0) {
      if (showNotification) {
        showNotification('Vui lòng chọn ít nhất 1 thành viên', 'warning');
      } else {
        alert('Vui lòng chọn ít nhất 1 thành viên');
      }
      return;
    }

    onCreateGroup(groupName, Array.from(selectedPeers));
    setGroupName('');
    setSelectedPeers(new Set());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <FiUsers />
            <h3>Tạo Nhóm Chat Tạm Thời</h3>
          </div>
          <button className="close-modal-btn" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>Tên Nhóm</label>
            <input
              type="text"
              placeholder="Nhập tên nhóm..."
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="group-name-input"
              autoFocus
              maxLength={50}
            />
            <small style={{ color: '#999', fontSize: '12px', marginTop: '5px', display: 'block' }}>
              Nhóm sẽ tự động mất khi tất cả thành viên offline
            </small>
          </div>

          <div className="form-group">
            <label>Chọn Thành Viên Online ({selectedPeers.size} đã chọn)</label>
            <div className="user-select-list">
              {Array.from(onlinePeers.entries()).map(([peerId, username]) => (
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
              
              {onlinePeers.size === 0 && (
                <div className="no-friends-message">
                  <p>Không có user online nào</p>
                  <p>Chờ có người online để tạo nhóm</p>
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
            onClick={handleCreate}
            disabled={selectedPeers.size === 0 || !groupName.trim()}
          >
            Tạo Nhóm
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateGroupModal;

