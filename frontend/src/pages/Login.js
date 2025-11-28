import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../services/authService';
import './Login.css';

function Login() {
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!nickname.trim()) {
      setError('Vui lòng nhập nickname');
      return;
    }

    if (nickname.trim().length < 2) {
      setError('Nickname phải có ít nhất 2 ký tự');
      return;
    }

    try {
      // Tạo user tạm thời từ nickname (không cần backend)
      authService.setUser(nickname.trim());
      navigate('/chat');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <h1>P2P Chat</h1>
          <p>WebRTC Peer-to-Peer Messaging</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>Nhập Nickname</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Ví dụ: Alice, Bob, ..."
              required
              autoFocus
              maxLength={20}
            />
            <small style={{ color: '#999', fontSize: '12px', marginTop: '5px', display: 'block' }}>
              Nickname của bạn sẽ hiển thị với người khác
            </small>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="submit-btn">
            Bắt đầu Chat
          </button>
        </form>

        <div className="login-footer">
          <p>🔒 Fully encrypted P2P communication</p>
          <p>💬 Direct peer-to-peer messaging</p>
          <p>🚀 No registration needed</p>
        </div>
      </div>
    </div>
  );
}

export default Login;

