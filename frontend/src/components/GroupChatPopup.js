import React, { useState, useEffect, useRef } from 'react';
import { FiX, FiMaximize2, FiSend, FiPaperclip, FiDownload, FiSmile, FiUsers } from 'react-icons/fi';
import { convertEmoticons } from '../utils/emoticonConverter';
import './GroupChatPopup.css';

function GroupChatPopup({ 
  group,
  messages, 
  currentPeerId,
  allUsers,
  connectedPeersCount,
  onClose,
  onMinimize,
  onMaximize,
  onSendMessage,
  onSendFile,
  isMinimized 
}) {
  const [newMessage, setNewMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showEmojiPicker && !event.target.closest('.emoji-picker-container')) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  // Drag handlers
  const handleMouseDown = (e) => {
    // Only allow dragging from the header
    if (e.target.closest('.popup-header')) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleInputChange = (e) => {
    const inputValue = e.target.value;
    const currentValue = newMessage;
    
    // Check if user just typed a space or is at the end
    if (inputValue.length > currentValue.length) {
      const lastChar = inputValue[inputValue.length - 1];
      
      // If space was typed or Enter, try to convert emoticons
      if (lastChar === ' ' || lastChar === '\n') {
        const convertedText = convertEmoticons(inputValue);
        setNewMessage(convertedText);
        return;
      }
    }
    
    setNewMessage(inputValue);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    // Convert any remaining emoticons before sending
    const finalMessage = convertEmoticons(newMessage);
    onSendMessage(finalMessage);
    setNewMessage('');
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('File too large! Maximum size is 10MB for P2P transfer.');
        return;
      }
      onSendFile(file);
    }
    e.target.value = '';
  };

  const handleDownload = (fileData, fileName) => {
    const link = document.createElement('a');
    link.href = fileData;
    link.download = fileName;
    link.click();
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const handleEmojiClick = (emoji) => {
    setNewMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const getUsernameByPeerId = (peerId) => {
    const user = allUsers.find(u => u.peerId === peerId);
    return user?.username || 'Unknown';
  };

  const isImageFile = (fileName) => {
    if (!fileName) return false;
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    const lowerName = fileName.toLowerCase();
    return imageExtensions.some(ext => lowerName.endsWith(ext));
  };

  const renderMessageContent = (content) => {
    // Check if message is code block
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g;
    const match = codeBlockRegex.exec(content);
    
    if (match) {
      const language = match[1] || 'text';
      const code = match[2];
      
      return (
        <div className="code-block">
          <div className="code-header">
            <span>{language}</span>
            <button
              className="copy-code-btn"
              onClick={() => {
                navigator.clipboard.writeText(code);
                alert('Code copied!');
              }}
              title="Copy code"
            >
              Copy
            </button>
          </div>
          <pre className="code-content">
            <code>{code}</code>
          </pre>
        </div>
      );
    }
    
    // Convert emoticons to emoji
    return convertEmoticons(content);
  };

  // Common emojis
  const commonEmojis = [
    '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', 
    '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', 
    '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', 
    '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', 
    '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', 
    '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', 
    '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', 
    '😦', '😧', '😮', '😲', '🥴', '😴', '🤤', '😪', '😵', '🤐', 
    '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', 
    '👿', '💀', '☠️', '👽', '🤖', '🎃', '😺', '😸', '😹', '😻', 
    '👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘', 
    '👌', '🤏', '✋', '🤚', '🖐️', '👋', '🤙', '💪', '🦾', '🦿', 
    '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👅', 
    '👄', '💋', '💘', '💝', '💖', '💗', '💓', '💞', '💕', '💟', 
    '❣️', '💔', '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', 
    '🤍', '💯', '🔥', '💥', '✨', '⭐', '🌟', '💫', '⚡', '☄️',
    '🎉', '🎊', '🎁', '🎈', '🎀', '🏆', '🥇', '🥈', '🥉', '🏅'
  ];

  const isConnected = connectedPeersCount === (group.memberCount - 1);

  if (isMinimized) {
    return (
      <div className="group-chat-popup minimized" onClick={onMinimize}>
        <div className="popup-minimized-header">
          <div className="popup-group-avatar-small">
            <FiUsers />
          </div>
          <span className="minimized-title">{group.groupName}</span>
          <button className="close-btn" onClick={(e) => { e.stopPropagation(); onClose(); }}>
            <FiX />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="group-chat-popup" 
      ref={popupRef}
      style={{ 
        left: `${position.x}px`, 
        top: `${position.y}px`,
        pointerEvents: 'auto' // Enable clicks only on popup itself
      }}
    >
      <div className="popup-header" style={{ cursor: 'grab' }} onMouseDown={handleMouseDown}>
        <div className="popup-user-info">
          <div className="popup-group-avatar">
            <FiUsers />
          </div>
          <div>
            <span className="popup-title">{group.groupName}</span>
            <p className="popup-connection-status">
              {isConnected 
                ? `🟢 ${connectedPeersCount}/${group.memberCount - 1} peers` 
                : `🔴 ${connectedPeersCount}/${group.memberCount - 1} peers`
              }
            </p>
          </div>
        </div>
        <div className="popup-actions">
          <button 
            className="popup-btn" 
            onClick={onMaximize}
            title="Maximize to full screen"
          >
            <FiMaximize2 />
          </button>
          <button 
            className="popup-btn close" 
            onClick={onClose}
            title="Close"
          >
            <FiX />
          </button>
        </div>
      </div>

      <div className="popup-messages">
        {messages.length === 0 ? (
          <div className="no-messages-popup">
            <p>No messages yet 💬</p>
            {!isConnected && (
              <p className="connecting-text">Establishing P2P mesh...</p>
            )}
          </div>
        ) : (
          messages.map((msg, index) => {
            const isOwn = msg.from === currentPeerId;
            const senderName = getUsernameByPeerId(msg.from);
            
            return (
              <div
                key={index}
                className={`message-wrapper ${isOwn ? 'own' : 'other'}`}
              >
                {!isOwn && (
                  <div className="group-message-sender">{senderName}</div>
                )}
                <div className={`message-bubble ${isOwn ? 'own' : 'other'}`}>
                  {msg.fileData ? (
                    <div className="file-message-popup">
                      {isImageFile(msg.fileName) ? (
                        <div className="image-message-popup">
                          <img 
                            src={msg.fileData} 
                            alt={msg.fileName}
                            className="image-preview-popup"
                            onClick={() => window.open(msg.fileData, '_blank')}
                          />
                          <div className="file-info-popup">
                            <div className="file-name">{msg.fileName}</div>
                            <button
                              className="download-btn-popup"
                              onClick={() => handleDownload(msg.fileData, msg.fileName)}
                            >
                              <FiDownload /> Download
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="file-content-popup">
                          <div className="file-icon">📎</div>
                          <div className="file-info-popup">
                            <div className="file-name">{msg.fileName}</div>
                            <button
                              className="download-btn-popup"
                              onClick={() => handleDownload(msg.fileData, msg.fileName)}
                            >
                              <FiDownload /> Download
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="message-content">{renderMessageContent(msg.content)}</div>
                  )}
                  <div className="message-time">{formatTime(msg.timestamp)}</div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="popup-input" onSubmit={handleSubmit}>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        <button
          type="button"
          className="popup-attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={!isConnected}
          title="Send file"
        >
          <FiPaperclip />
        </button>
        <input
          type="text"
          className="popup-message-input"
          placeholder={isConnected ? "Aa" : "Connecting..."}
          value={newMessage}
          onChange={handleInputChange}
          disabled={!isConnected}
        />
        
        {/* Emoji Picker */}
        <div className="emoji-picker-container">
          <button
            type="button"
            className="popup-emoji-btn"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            disabled={!isConnected}
            title="Add emoji"
          >
            <FiSmile />
          </button>
          
          {showEmojiPicker && (
            <div className="emoji-picker-popup">
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
        </div>
        
        <button
          type="submit"
          className="popup-send-btn"
          disabled={!newMessage.trim() || !isConnected}
        >
          <FiSend />
        </button>
      </form>
    </div>
  );
}

export default GroupChatPopup;

