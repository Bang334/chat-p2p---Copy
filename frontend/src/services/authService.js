// Đơn giản hóa authService - không cần backend, không cần database
class AuthService {
  constructor() {
    this.user = JSON.parse(localStorage.getItem('user') || 'null');
  }

  // Tạo user ID và peer ID từ nickname + timestamp
  generateUserId(nickname) {
    // Tạo ID ngẫu nhiên dựa trên nickname
    const random = Math.random().toString(36).substring(2, 8);
    return `${nickname.toLowerCase()}_${random}`;
  }

  generatePeerId(nickname) {
    // Peer ID duy nhất cho WebRTC
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `peer_${nickname.toLowerCase()}_${timestamp}_${random}`;
  }

  // Tạo user từ nickname (không cần gọi backend)
  setUser(nickname) {
    const userId = this.generateUserId(nickname);
    const peerId = this.generatePeerId(nickname);
    
    this.user = {
      userId,
      username: nickname,
      peerId
    };
    
    localStorage.setItem('user', JSON.stringify(this.user));
    
    return this.user;
  }

  logout() {
    this.user = null;
    localStorage.removeItem('user');
  }

  isAuthenticated() {
    return !!this.user;
  }

  getUser() {
    return this.user;
  }

  getPeerId() {
    return this.user?.peerId;
  }

  getUsername() {
    return this.user?.username;
  }
}

const authService = new AuthService();
export default authService;

