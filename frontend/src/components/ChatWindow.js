import React, { useState, useEffect, useRef } from 'react';
import { FiSend, FiPaperclip, FiDownload, FiSmile, FiUsers } from 'react-icons/fi';
import { convertEmoticons } from '../utils/emoticonConverter';
import './ChatWindow.css';

function ChatWindow({ 
  peer, 
  messages, 
  currentPeerId, 
  isConnected, 
  onSendMessage, 
  onSendFile, 
  waitingForAcceptance = false,
  onBroadcast = null,
  onSendToRecipients = null,
  selectedRecipients = null,
  hasConnectedRecipients = false
}) {
  const [newMessage, setNewMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

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
    if (!newMessage.trim() || !isConnected) return;

    // Convert any remaining emoticons before sending
    const finalMessage = convertEmoticons(newMessage);

    // Check if we have selected recipients for broadcast
    if (selectedRecipients && onSendToRecipients) {
      onSendToRecipients(finalMessage);
    } else {
      onSendMessage(finalMessage);
    }
    setNewMessage('');
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && isConnected) {
      // Check file size (max 10MB for P2P)
      if (file.size > 10 * 1024 * 1024) {
        alert('File too large! Maximum size is 10MB for P2P transfer.');
        return;
      }
      // Check if we have selected recipients for broadcast
      if (selectedRecipients && onSendToRecipients) {
        onSendToRecipients(null, file);
      } else {
        onSendFile(file);
      }
    }
    e.target.value = '';
  };

  const handleDownload = (fileData, fileName) => {
    const link = document.createElement('a');
    link.href = fileData;
    link.download = fileName;
    link.click();
  };

  const isImageFile = (fileName) => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
    const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    return imageExtensions.includes(extension);
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

  return (
    <div className="chat-window">
      {/* Header */}
      <div className="chat-window-header">
        <div className="chat-peer-info">
          <div className="chat-peer-avatar">
            {peer.username.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3>{peer.username}</h3>
            <p className={`connection-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? '🟢 P2P Connected' : '🔴 Establishing connection...'}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="no-messages">
            <p>No messages yet. Start the conversation! 💬</p>
            {!isConnected && (
              <p className="connecting-message">
                {waitingForAcceptance ? 'Waiting for acceptance...' : 'Establishing P2P connection...'}
              </p>
            )}
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`message ${msg.type === 'sent' ? 'sent' : 'received'}`}
            >
              <div className="message-bubble">
                {msg.fileData ? (
                  <div className="file-message">
                    {isImageFile(msg.fileName) ? (
                      <div className="image-message">
                        <img 
                          src={msg.fileData} 
                          alt={msg.fileName}
                          className="image-preview"
                          onClick={() => window.open(msg.fileData, '_blank')}
                        />
                        <div className="file-info">
                          <div className="file-name">{msg.fileName}</div>
                          <button
                            className="download-btn"
                            onClick={() => handleDownload(msg.fileData, msg.fileName)}
                          >
                            <FiDownload /> Download
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="file-content">
                        <div className="file-icon">📎</div>
                        <div className="file-info">
                          <div className="file-name">{msg.fileName}</div>
                          <button
                            className="download-btn"
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
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        <button
          type="button"
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={!isConnected}
          title="Send file"
        >
          <FiPaperclip />
        </button>
        <input
          type="text"
          className="message-input"
          placeholder={isConnected ? "Type a message..." : "Waiting for connection..."}
          value={newMessage}
          onChange={handleInputChange}
          disabled={!isConnected}
        />
        
        {/* Emoji Picker */}
        <div className="emoji-picker-container">
          <button
            type="button"
            className="emoji-btn"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            disabled={!isConnected}
            title="Add emoji"
          >
            <FiSmile />
          </button>
          
          {showEmojiPicker && (
            <div className="emoji-picker">
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
        
        {/* Broadcast Button */}
        {onBroadcast && hasConnectedRecipients && (
          <button
            type="button"
            className="broadcast-btn"
            onClick={() => onBroadcast()}
            disabled={!isConnected}
            title="Broadcast message"
          >
            <FiUsers />
          </button>
        )}
        
        {/* Recipients Indicator */}
        {selectedRecipients && (
          <div className="recipients-indicator">
            <span className="recipients-count">
              {selectedRecipients.friends.length + selectedRecipients.groups.length} recipients
            </span>
          </div>
        )}
        
        <button
          type="submit"
          className="send-btn"
          disabled={!newMessage.trim() || !isConnected}
        >
          <FiSend />
        </button>
      </form>
    </div>
  );
}

export default ChatWindow;

