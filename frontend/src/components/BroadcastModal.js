import React, { useState, useRef } from 'react';
import { FiX, FiUsers, FiSend, FiPaperclip, FiSmile } from 'react-icons/fi';
import './BroadcastModal.css';

function BroadcastModal({ isOpen, onClose, onlinePeers, groups, onSend, showNotification }) {
  const [selectedPeers, setSelectedPeers] = useState(new Set());
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef(null);

  const handleTogglePeer = (peerId) => {
    const newSelected = new Set(selectedPeers);
    if (newSelected.has(peerId)) {
      newSelected.delete(peerId);
    } else {
      newSelected.add(peerId);
    }
    setSelectedPeers(newSelected);
  };

  const handleToggleGroup = (groupId) => {
    const newSelected = new Set(selectedGroups);
    if (newSelected.has(groupId)) {
      newSelected.delete(groupId);
    } else {
      newSelected.add(groupId);
    }
    setSelectedGroups(newSelected);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        if (showNotification) {
          showNotification('File quá lớn! Tối đa 10MB', 'warning');
        } else {
          alert('File quá lớn! Tối đa 10MB');
        }
        return;
      }
      setSelectedFile(file);
      
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setFilePreview(e.target.result);
        };
        reader.readAsDataURL(file);
      } else {
        setFilePreview(null);
      }
    }
    e.target.value = '';
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
  };

  const handleEmojiClick = (emoji) => {
    setMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const handleSend = () => {
    if (!message.trim() && !selectedFile) {
      if (showNotification) {
        showNotification('Vui lòng nhập tin nhắn hoặc chọn file', 'warning');
      } else {
        alert('Vui lòng nhập tin nhắn hoặc chọn file');
      }
      return;
    }

    if (selectedPeers.size === 0 && selectedGroups.size === 0) {
      if (showNotification) {
        showNotification('Vui lòng chọn ít nhất 1 người hoặc nhóm', 'warning');
      } else {
        alert('Vui lòng chọn ít nhất 1 người hoặc nhóm');
      }
      return;
    }

    onSend(message, Array.from(selectedPeers), Array.from(selectedGroups), selectedFile);
    
    // Reset
    setMessage('');
    setSelectedPeers(new Set());
    setSelectedGroups(new Set());
    setSelectedFile(null);
    setFilePreview(null);
    onClose();
  };

  if (!isOpen) return null;

  const totalSelected = selectedPeers.size + selectedGroups.size;
  const commonEmojis = ['😀', '😂', '😍', '🥰', '😘', '😊', '😎', '🤔', '😢', '😭', '😡', '🤯', '👍', '👎', '❤️', '💕', '🔥', '💯', '🎉', '👏'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content broadcast-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <FiSend />
            <h3>Gửi Tin Nhắn Cho Nhiều Người</h3>
          </div>
          <button className="close-modal-btn" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="modal-body">
          {/* Message Input */}
          <div className="form-group">
            <label>Tin nhắn hoặc file</label>
            <div className="message-input-container">
              <textarea
                placeholder="Nhập tin nhắn muốn gửi..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="broadcast-message-input"
                rows={3}
              />
              <div className="message-input-actions">
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
                <button
                  type="button"
                  className="emoji-btn-small"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  title="Thêm emoji"
                >
                  <FiSmile />
                </button>
                <button
                  type="button"
                  className="attach-btn-small"
                  onClick={() => fileInputRef.current?.click()}
                  title="Đính kèm file"
                >
                  <FiPaperclip />
                </button>
              </div>
            </div>
            
            {/* Emoji Picker */}
            {showEmojiPicker && (
              <div className="emoji-picker-broadcast">
                {commonEmojis.map((emoji, index) => (
                  <button
                    key={index}
                    type="button"
                    className="emoji-item"
                    onClick={() => handleEmojiClick(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            
            {/* File Preview */}
            {selectedFile && (
              <div className="file-preview-broadcast">
                {filePreview ? (
                  <div className="image-preview-broadcast">
                    <img src={filePreview} alt="Preview" />
                    <button
                      type="button"
                      className="remove-file-btn"
                      onClick={handleRemoveFile}
                    >
                      <FiX />
                    </button>
                  </div>
                ) : (
                  <div className="file-info-broadcast">
                    <FiPaperclip />
                    <span>{selectedFile.name}</span>
                    <button
                      type="button"
                      className="remove-file-btn"
                      onClick={handleRemoveFile}
                    >
                      <FiX />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Users Selection */}
          <div className="form-group">
            <label>Chọn Users ({selectedPeers.size} đã chọn)</label>
            <div className="recipient-select-list">
              {Array.from(onlinePeers.entries()).map(([peerId, username]) => (
                <div
                  key={peerId}
                  className={`recipient-select-item ${selectedPeers.has(peerId) ? 'selected' : ''}`}
                  onClick={() => handleTogglePeer(peerId)}
                >
                  <div className="recipient-avatar">
                    {username.charAt(0).toUpperCase()}
                  </div>
                  <div className="recipient-info">
                    <div className="recipient-name">{username}</div>
                    <div className="recipient-status">● Online</div>
                  </div>
                  <div className="recipient-checkbox">
                    {selectedPeers.has(peerId) && '✓'}
                  </div>
                </div>
              ))}
              
              {onlinePeers.size === 0 && (
                <div className="no-recipients">
                  <p>Không có user online</p>
                </div>
              )}
            </div>
          </div>

          {/* Groups Selection */}
          {groups.length > 0 && (
            <div className="form-group">
              <label>Chọn Nhóm ({selectedGroups.size} đã chọn)</label>
              <div className="recipient-select-list">
                {groups.map(group => (
                  <div
                    key={group.groupId}
                    className={`recipient-select-item ${selectedGroups.has(group.groupId) ? 'selected' : ''}`}
                    onClick={() => handleToggleGroup(group.groupId)}
                  >
                    <div className="recipient-avatar" style={{ background: '#31a24c' }}>
                      {group.groupName.charAt(0).toUpperCase()}
                    </div>
                    <div className="recipient-info">
                      <div className="recipient-name">{group.groupName}</div>
                      <div className="recipient-status">{group.memberPeerIds.length} thành viên</div>
                    </div>
                    <div className="recipient-checkbox">
                      {selectedGroups.has(group.groupId) && '✓'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="selected-count">
            {totalSelected > 0 ? `${totalSelected} người nhận` : 'Chưa chọn'}
          </div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>
              Hủy
            </button>
            <button 
              className="btn-primary" 
              onClick={handleSend}
              disabled={(!message.trim() && !selectedFile) || totalSelected === 0}
            >
              <FiSend /> Gửi {selectedFile ? 'File' : 'Tin nhắn'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BroadcastModal;

