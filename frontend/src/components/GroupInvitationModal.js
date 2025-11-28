import React from 'react';
import { FiX, FiUsers, FiCheck } from 'react-icons/fi';
import './GroupInvitationModal.css';

function GroupInvitationModal({ invitations, onAccept, onReject }) {
  if (!invitations || invitations.length === 0) return null;

  return (
    <div className="group-invitation-container">
      {invitations.map((invitation, index) => (
        <div key={invitation.groupId} className="group-invitation-card" style={{ bottom: `${20 + index * 120}px` }}>
          <div className="invitation-header">
            <FiUsers className="invitation-icon" />
            <button className="close-invitation-btn" onClick={() => onReject(invitation.groupId)}>
              <FiX />
            </button>
          </div>
          
          <div className="invitation-body">
            <h4>Lời mời vào nhóm</h4>
            <p className="invitation-text">
              <strong>{invitation.creatorUsername}</strong> mời bạn tham gia nhóm
            </p>
            <p className="group-name">"{invitation.groupName}"</p>
            <p className="member-count">{invitation.memberCount} thành viên</p>
          </div>
          
          <div className="invitation-actions">
            <button className="reject-btn" onClick={() => onReject(invitation.groupId)}>
              Từ chối
            </button>
            <button className="accept-btn" onClick={() => onAccept(invitation)}>
              <FiCheck /> Chấp nhận
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default GroupInvitationModal;

