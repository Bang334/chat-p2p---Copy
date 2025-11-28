import React from 'react';
import { FiAlertTriangle } from 'react-icons/fi';
import './ConfirmModal.css';

function ConfirmModal({ isOpen, title, message, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onCancel, type = 'warning' }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay confirm-modal-overlay" onClick={onCancel}>
      <div className="confirm-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className={`confirm-modal-icon ${type}`}>
          <FiAlertTriangle />
        </div>
        <h3 className="confirm-modal-title">{title}</h3>
        <p className="confirm-modal-message">{message}</p>
        <div className="confirm-modal-actions">
          <button className="confirm-btn-cancel" onClick={onCancel}>
            {cancelText}
          </button>
          <button className={`confirm-btn-confirm ${type}`} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;

