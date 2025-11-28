import React from 'react';
import './Notification.css';

function Notification({ message, type = 'info', onClose }) {
  if (!message) return null;

  return (
    <div className={`notification ${type}`}>
      <span className="notification-message">{message}</span>
      <button className="notification-close" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}

export default Notification;

