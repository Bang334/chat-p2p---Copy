
export const API_BASE_URL = 'http://localhost:8080/api';
export const WS_BASE_URL = 'http://localhost:8080/ws/signaling';

// ==========================================
// 🔄 OPTION 4: 3-4 MÁY - MESH NETWORK (True P2P - Mỗi máy kết nối đến TẤT CẢ máy khác)
// ==========================================
// Mỗi máy kết nối đến TẤT CẢ các máy khác, tạo thành mesh network
// ✅ Nếu 1 máy tắt, các máy khác vẫn chat được với nhau!
//
// Cấu hình: Mỗi máy cần list TẤT CẢ IP của các máy khác
//
// Ví dụ với 4 máy:
// Máy A (IP: 192.168.1.100) - Kết nối đến B, C, D:
export const SIGNALING_SERVERS = [
  'http://192.168.3.125:8080/ws/signaling',  // Máy B
];
//
// Máy B (IP: 192.168.1.101) - Kết nối đến A, C, D:
// export const SIGNALING_SERVERS = [
//   'http://192.168.1.100:8080/ws/signaling',  // Máy A
//   'http://192.168.1.102:8080/ws/signaling',  // Máy C
//   'http://192.168.1.103:8080/ws/signaling'   // Máy D
// ];
//
// Máy C (IP: 192.168.1.102) - Kết nối đến A, B, D:
// export const SIGNALING_SERVERS = [
//   'http://192.168.1.100:8080/ws/signaling',  // Máy A
//   'http://192.168.1.101:8080/ws/signaling',  // Máy B
//   'http://192.168.1.103:8080/ws/signaling'   // Máy D
// ];
//
// Máy D (IP: 192.168.1.103) - Kết nối đến A, B, C:
// export const SIGNALING_SERVERS = [
//   'http://192.168.1.100:8080/ws/signaling',  // Máy A
//   'http://192.168.1.101:8080/ws/signaling',  // Máy B
//   'http://192.168.1.102:8080/ws/signaling'   // Máy C
// ];
//
// ⚠️ LƯU Ý: Cần dùng multiSignalingService thay vì signalingService
// Xem MESH_NETWORK_SETUP.md để biết cách setup

export const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
];

export const ICE_SERVERS = {
  iceServers: STUN_SERVERS
};

