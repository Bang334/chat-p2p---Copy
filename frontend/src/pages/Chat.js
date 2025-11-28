import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiLogOut, FiUsers, FiPlus, FiSend, FiWifi } from 'react-icons/fi';
import authService from '../services/authService';
import signalingService from '../services/signaling';
import multiSignalingService from '../services/multiSignaling';
import webrtcService from '../services/webrtc';
import peerDiscoveryService from '../services/peerDiscovery';
import { WS_BASE_URL, SIGNALING_SERVERS } from '../config/api';
import ChatWindow from '../components/ChatWindow';
import GroupChatWindow from '../components/GroupChatWindow';
import ChatPopup from '../components/ChatPopup';
import GroupChatPopup from '../components/GroupChatPopup';
import CreateGroupModal from '../components/CreateGroupModal';
import GroupInvitationModal from '../components/GroupInvitationModal';
import InviteMemberModal from '../components/InviteMemberModal';
import BroadcastModal from '../components/BroadcastModal';
import PeerDiscoveryModal from '../components/PeerDiscoveryModal';
import Notification from '../components/Notification';
import './Chat.css';

function Chat() {
  const [onlinePeers, setOnlinePeers] = useState(new Map()); // Map peerId -> username
  const [groups, setGroups] = useState([]); // Temporary groups
  const [selectedPeer, setSelectedPeer] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [activeTab, setActiveTab] = useState('users'); // 'users' or 'groups'
  const [conversations, setConversations] = useState(new Map()); // peerId -> messages[]
  const [groupConversations, setGroupConversations] = useState(new Map()); // groupId -> messages[]
  const [connectionStatus, setConnectionStatus] = useState('offline');
  const [popups, setPopups] = useState([]); // Array of popup chat windows
  const [groupPopups, setGroupPopups] = useState([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [showPeerDiscovery, setShowPeerDiscovery] = useState(false);
  const [groupInvitations, setGroupInvitations] = useState([]); // Pending group invitations
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [notification, setNotification] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState(new Map()); // Map<peerId/groupId, count> - Track unread messages
  const [knownPeers, setKnownPeers] = useState([]); // List of known peer IPs
  const [myIP, setMyIP] = useState(''); // IP of current machine
  const [discoveredPeers, setDiscoveredPeers] = useState([]); // Auto-discovered peers
  const [isDiscovering, setIsDiscovering] = useState(false);
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(authService.getUser());
  const [fileChunks, setFileChunks] = useState(new Map()); // Track incoming file chunks
  const isInitializedRef = useRef(false);
  const selectedGroupRef = useRef(null);

  // Keep ref in sync with state
  useEffect(() => {
    selectedGroupRef.current = selectedGroup;
  }, [selectedGroup]);

  // Redirect to login if not authenticated
  useEffect(() => {
    const user = authService.getUser();
    if (!user || !authService.isAuthenticated()) {
      navigate('/login', { replace: true });
      return;
    }
    
    if (user && JSON.stringify(user) !== JSON.stringify(currentUser)) {
      setCurrentUser(user);
    }
    
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      initializeChat();
      getMyIP();
      loadKnownPeers();
    }
  }, []);

  // Auto-start discovery when IP is available
  useEffect(() => {
    if (myIP && !isDiscovering) {
      handleStartDiscovery();
    }
  }, [myIP]);

  // Get local IP address (only private/local IP, not public IP)
  const getMyIP = async () => {
    try {
      // Try to get IP from WebRTC
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.createDataChannel('');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      let found = false;
      pc.onicecandidate = (event) => {
        if (event.candidate && !found) {
          const candidate = event.candidate.candidate;
          const ipMatch = candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
          if (ipMatch) {
            const ip = ipMatch[0];
            // Only accept local/private IP addresses
            // 127.x.x.x = localhost
            // 169.254.x.x = link-local
            // 192.168.x.x = private network
            // 10.x.x.x = private network
            // 172.16.x.x - 172.31.x.x = private network
            const isLocalIP = 
              ip.startsWith('192.168.') ||
              ip.startsWith('10.') ||
              (ip.startsWith('172.') && 
               parseInt(ip.split('.')[1]) >= 16 && 
               parseInt(ip.split('.')[1]) <= 31) ||
              ip.startsWith('127.') ||
              ip.startsWith('169.254.');
            
            if (isLocalIP && !ip.startsWith('127.') && !ip.startsWith('169.254.')) {
              setMyIP(ip);
              found = true;
              pc.close();
            }
          }
        }
      };
      
      // Timeout after 3 seconds
      setTimeout(() => {
        if (!found) {
          pc.close();
          // Fallback: prompt user to enter manually
          console.log('Could not auto-detect local IP (likely hidden by browser privacy settings). You can enter it manually if needed.');
        }
      }, 3000);
    } catch (error) {
      console.warn('Error getting IP:', error);
    }
  };

  // Load known peers from localStorage
  const loadKnownPeers = () => {
    try {
      const saved = localStorage.getItem('knownPeers');
      if (saved) {
        setKnownPeers(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Error loading known peers:', error);
    }
  };

  // Save known peers to localStorage
  const saveKnownPeers = (peers) => {
    try {
      localStorage.setItem('knownPeers', JSON.stringify(peers));
    } catch (error) {
      console.error('Error saving known peers:', error);
    }
  };

  // Connect to peer's signaling server
  const handleConnectToPeer = async (peerIP) => {
    try {
      showNotification(`Đang kết nối đến ${peerIP}...`, 'info');
      
      // Add to known peers if not exists
      if (!knownPeers.includes(peerIP)) {
        const updated = [...knownPeers, peerIP];
        setKnownPeers(updated);
        saveKnownPeers(updated);
      }
      
      // Note: This requires refactoring SignalingService to support multiple connections
      // For now, we'll show instructions
      showNotification(
        `Để kết nối P2P hoàn toàn:\n1. Mỗi máy chạy backend (signaling server)\n2. Cấu hình WS_BASE_URL trong api.js thành http://${peerIP}:8080/ws/signaling\n3. Restart app`,
        'info'
      );
      
      console.log('Peer IP to connect:', peerIP);
      console.log('Update WS_BASE_URL in api.js to:', `http://${peerIP}:8080/ws/signaling`);
      
    } catch (error) {
      console.error('Error connecting to peer:', error);
      showNotification(`Không thể kết nối đến ${peerIP}`, 'error');
    }
  };

  // Remove peer from known list
  const handleRemovePeer = (peerIP) => {
    const updated = knownPeers.filter(ip => ip !== peerIP);
    setKnownPeers(updated);
    saveKnownPeers(updated);
    showNotification(`Đã xóa ${peerIP}`, 'info');
  };

  // Start peer discovery
  const handleStartDiscovery = () => {
    if (!myIP) {
      showNotification('Chưa lấy được IP. Vui lòng thử lại sau.', 'warning');
      return;
    }

    setIsDiscovering(true);
    setDiscoveredPeers([]);

    // Setup callback for discovered peers
    peerDiscoveryService.onPeerDiscoveredCallback = (ip, peerInfo) => {
      setDiscoveredPeers(prev => {
        // Check if peer already exists
        const exists = prev.find(p => p.ip === ip);
        if (!exists) {
          console.log('🔍 Discovered peer:', ip, peerInfo);
          showNotification(`Tìm thấy peer: ${peerInfo?.username || ip}`, 'success');
          return [...prev, {
            ip: ip,
            peerId: peerInfo?.peerId,
            username: peerInfo?.username,
            signalingUrl: peerInfo?.signalingUrl
          }];
        }
        return prev;
      });
    };

    // Start discovery (UDP-based, no need to pass myIP)
    peerDiscoveryService.startDiscovery(myIP, (ip, peerInfo) => {
      console.log('🔍 Discovered peer:', ip, peerInfo);
    });

    showNotification('Đang tìm kiếm peers trong mạng local (UDP discovery)...', 'info');
  };

  // Stop peer discovery
  const handleStopDiscovery = () => {
    setIsDiscovering(false);
    peerDiscoveryService.stopDiscovery();
    showNotification('Đã dừng tìm kiếm', 'info');
  };

  // Auto-cleanup groups when members go offline
  useEffect(() => {
    setGroups(prevGroups => {
      const updatedGroups = prevGroups.filter(group => {
        // Check if at least one member is still online
        const hasOnlineMembers = group.memberPeerIds.some(peerId => 
          onlinePeers.has(peerId)
        );
        
        if (!hasOnlineMembers) {
          // Close group chat if it's selected
          if (selectedGroup?.groupId === group.groupId) {
            setSelectedGroup(null);
          }
          // Close group popup if open
          setGroupPopups(prev => prev.filter(p => p.groupId !== group.groupId));
        }
        
        return hasOnlineMembers;
      });
      
      return updatedGroups;
    });
  }, [onlinePeers, selectedGroup?.groupId]);

  // Get active signaling service (mesh network or single)
  const getActiveSignalingService = () => {
    return (SIGNALING_SERVERS && SIGNALING_SERVERS.length > 0) ? multiSignalingService : signalingService;
  };

  const initializeChat = async () => {
    const activeService = getActiveSignalingService();
    const useMeshNetwork = SIGNALING_SERVERS && SIGNALING_SERVERS.length > 0;

    // Connect to signaling server(s)
    if (useMeshNetwork) {
      // Mesh network: Connect to all peers
      multiSignalingService.connectToMultiple(
        currentUser.peerId,
        SIGNALING_SERVERS,
        async () => {
          setConnectionStatus('online');
          console.log(`✅ Connected to ${SIGNALING_SERVERS.length} signaling servers (mesh network)`);
          
          // Broadcast our presence to network
          await peerDiscoveryService.broadcastPeerInfo(currentUser.peerId, currentUser.username);
        },
        (error) => {
          console.error('Signaling error:', error);
          setConnectionStatus('error');
        }
      );
    } else {
      // Single connection: Connect to one signaling server
      signalingService.connect(
        currentUser.peerId,
        async () => {
          setConnectionStatus('online');
          
          // Broadcast our presence to network
          await peerDiscoveryService.broadcastPeerInfo(currentUser.peerId, currentUser.username);
        },
        (error) => {
          console.error('Signaling error:', error);
          setConnectionStatus('error');
        }
      );
    }

    // Setup signaling callbacks
    setupSignalingCallbacks(activeService);

    // Setup WebRTC callbacks
    setupWebRTCCallbacks();
  };

  const setupSignalingCallbacks = (activeService = null) => {
    // Use provided service or default to signalingService
    const service = activeService || (SIGNALING_SERVERS && SIGNALING_SERVERS.length > 0 ? multiSignalingService : signalingService);

    service.onOffer((fromPeerId, offer) => {
      webrtcService.handleOffer(fromPeerId, offer, service, currentUser.peerId);
    });

    service.onAnswer((fromPeerId, answer) => {
      webrtcService.handleAnswer(fromPeerId, answer);
    });

    service.onIceCandidate((fromPeerId, candidate) => {
      webrtcService.handleIceCandidate(fromPeerId, candidate);
    });

    service.onPeerOnline((peerId) => {
      // Extract username from peerId
      const username = extractUsernameFromPeerId(peerId);
      
      setOnlinePeers(prev => {
        const newMap = new Map(prev);
        newMap.set(peerId, username);
        return newMap;
      });
    });

    service.onPeerOffline((peerId) => {
      setOnlinePeers(prev => {
        const newMap = new Map(prev);
        newMap.delete(peerId);
        return newMap;
      });
      webrtcService.closePeerConnection(peerId);
    });
  };

  const setupWebRTCCallbacks = () => {
    webrtcService.onMessage((fromPeerId, data) => {
      // Handle file chunks
      if (data.type === 'file-start') {
        const fileKey = `${fromPeerId}-${data.fileName}-${data.timestamp}`;
        setFileChunks(prev => {
          const newMap = new Map(prev);
          newMap.set(fileKey, {
            fileName: data.fileName,
            fileType: data.fileType,
            fileSize: data.fileSize,
            totalChunks: data.totalChunks,
            chunks: [],
            timestamp: data.timestamp,
            groupId: data.groupId
          });
          return newMap;
        });
        return;
      }
      
      if (data.type === 'file-chunk') {
        setFileChunks(prev => {
          const newMap = new Map(prev);
          const fileKey = Array.from(newMap.keys()).find(key => {
            if (!key.includes(fromPeerId)) return false;
            const fileInfo = newMap.get(key);
            if (data.groupId) {
              return fileInfo?.groupId === data.groupId;
            } else {
              return !fileInfo?.groupId;
            }
          });
          
          if (fileKey) {
            const file = newMap.get(fileKey);
            if (file) {
              file.chunks.push({ index: data.chunkIndex, data: data.data });
              }
          }
          
          return newMap;
        });
        return;
      }
      
      if (data.type === 'file-end') {
        setFileChunks(prev => {
          const newMap = new Map(prev);
          const fileKey = Array.from(newMap.keys()).find(key => {
            if (!key.includes(fromPeerId)) return false;
            const fileInfo = newMap.get(key);
            if (data.groupId) {
              return fileInfo?.groupId === data.groupId;
            } else {
              return !fileInfo?.groupId;
            }
          });
          
          if (fileKey) {
            const file = newMap.get(fileKey);
            
            if (file && file.chunks.length === file.totalChunks) {
              try {
                file.chunks.sort((a, b) => a.index - b.index);
                const base64Data = 'data:' + file.fileType + ';base64,' + file.chunks.map(c => c.data).join('');
                
                if (file.groupId) {
                  addGroupMessage(file.groupId, {
                    from: fromPeerId,
                    content: file.fileName,
                    timestamp: file.timestamp,
                    type: 'received',
                    fileData: base64Data,
                    fileName: file.fileName,
                    fileType: file.fileType,
                    fileSize: file.fileSize
                  });
                  
                  // Increment unread count if not viewing this group
                  if (selectedGroupRef.current?.groupId !== file.groupId) {
                    setUnreadCounts(prev => {
                      const newMap = new Map(prev);
                      const current = newMap.get(file.groupId) || 0;
                      newMap.set(file.groupId, current + 1);
                      return newMap;
                    });
                  }
                } else {
                  addMessage(fromPeerId, {
                    from: fromPeerId,
                    content: file.fileName,
                    timestamp: file.timestamp,
                    type: 'received',
                    fileData: base64Data,
                    fileName: file.fileName,
                    fileType: file.fileType,
                    fileSize: file.fileSize
                  });
                  
                  // Increment unread count if not viewing this peer
                  if (selectedPeer?.peerId !== fromPeerId) {
                    setUnreadCounts(prev => {
                      const newMap = new Map(prev);
                      const current = newMap.get(fromPeerId) || 0;
                      newMap.set(fromPeerId, current + 1);
                      return newMap;
                    });
                  }
                }
                
                newMap.delete(fileKey);
              } catch (error) {
                console.error('❌ Error reconstructing file:', error);
              }
            }
          }
          
          return newMap;
        });
        return;
      }
      
      // Handle group invitation
      if (data.type === 'group-invitation') {
        // Add to pending invitations instead of auto-accepting
        setGroupInvitations(prev => {
          // Check if invitation already exists
          const exists = prev.find(inv => inv.groupId === data.groupId);
          if (!exists) {
            return [...prev, data];
          }
          return prev;
        });
        
        return;
      }

      // Handle new member joined notification
      if (data.type === 'member-joined') {
        try {
          const { groupId, newMemberPeerIds } = JSON.parse(data.content);
          
          // Update local group state
          setGroups(prev => prev.map(g => {
            if (g.groupId === groupId) {
              // Add new members if not already present
              const currentMembers = new Set(g.memberPeerIds);
              newMemberPeerIds.forEach(id => currentMembers.add(id));
              
              // Ensure we include ourselves in the count logic if not present in list
              // (Though memberPeerIds should ideally contain everyone except self, or everyone including self depending on convention)
              // Convention used: memberPeerIds contains EVERYONE (including self) for consistent counting
              
              const updatedList = Array.from(currentMembers);
              // If current user is not in the list, add them for the count, but don't mess up the list if it's supposed to be "others"
              // Actually, let's standardize: memberPeerIds should contain ALL members.
              
              if (!currentMembers.has(currentUser.peerId)) {
                  updatedList.push(currentUser.peerId);
              }
              
              return {
                ...g,
                memberPeerIds: updatedList,
                memberCount: updatedList.length
              };
            }
            return g;
          }));
          
          // Update selectedGroup if active
          if (selectedGroupRef.current?.groupId === groupId) {
            setSelectedGroup(prev => {
              const currentMembers = new Set(prev.memberPeerIds);
              newMemberPeerIds.forEach(id => currentMembers.add(id));
              
              const updatedList = Array.from(currentMembers);
              if (!currentMembers.has(currentUser.peerId)) {
                  updatedList.push(currentUser.peerId);
              }

              return {
                ...prev,
                memberPeerIds: updatedList,
                memberCount: updatedList.length
              };
            });
          }
          
          // Connect to new members
          const activeService = getActiveSignalingService();
          webrtcService.connectToGroup(groupId, newMemberPeerIds, activeService, currentUser.peerId);
          
          showNotification(`Có ${newMemberPeerIds.length} thành viên mới tham gia nhóm`, 'info');
        } catch (error) {
          console.error('Error handling member-joined:', error);
        }
        return;
      }
      
      // Regular text messages
      if (data.type === 'text') {
        if (data.groupId) {
          addGroupMessage(data.groupId, {
            from: fromPeerId,
            content: data.content,
            timestamp: data.timestamp,
            type: 'received'
          });
          
          // Increment unread count if not viewing this group
          if (selectedGroupRef.current?.groupId !== data.groupId) {
            setUnreadCounts(prev => {
              const newMap = new Map(prev);
              const current = newMap.get(data.groupId) || 0;
              newMap.set(data.groupId, current + 1);
              return newMap;
            });
          }
        } else {
          addMessage(fromPeerId, {
            from: fromPeerId,
            content: data.content,
            timestamp: data.timestamp,
            type: 'received'
          });
          
          // Increment unread count if not viewing this peer
          if (selectedPeer?.peerId !== fromPeerId) {
            setUnreadCounts(prev => {
              const newMap = new Map(prev);
              const current = newMap.get(fromPeerId) || 0;
              newMap.set(fromPeerId, current + 1);
              return newMap;
            });
          }
        }
      }
    });
  };

  // Extract username from peerId
  const extractUsernameFromPeerId = (peerId) => {
    // Format: peer_nickname_timestamp_random
    const parts = peerId.split('_');
    if (parts.length >= 2) {
      return parts[1]; // nickname
    }
    return peerId;
  };

  const initiateConnection = async (peerId, username, openAsPopup = false) => {
    if (openAsPopup) {
      openChatPopup(peerId, username);
    } else {
      setSelectedPeer({ peerId, username });
      setSelectedGroup(null);
      // Clear unread count when selecting peer
      setUnreadCounts(prev => {
        const newMap = new Map(prev);
        newMap.delete(peerId);
        return newMap;
      });
    }

    // Pre-establish connection in the background
    try {
      const activeService = getActiveSignalingService();
      const existingChannel = webrtcService.dataChannels.get(peerId);
      if (!existingChannel || existingChannel.readyState !== 'open') {
        webrtcService.createPeerConnection(peerId, activeService, true);
        webrtcService.createOffer(peerId, activeService)
          .catch(err => console.warn('Connection setup error:', err));
      }
    } catch (error) {
      console.warn('Could not establish connection:', error);
    }
  };

  const handleCreateGroup = async (groupName, memberPeerIds) => {
    // Generate unique group ID
    const groupId = `group_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    const newGroup = {
      groupId,
      groupName,
      memberPeerIds, // Array of peer IDs
      memberCount: memberPeerIds.length + 1, // Include current user
      createdBy: currentUser.peerId,
      creatorUsername: currentUser.username,
      createdAt: Date.now()
    };
    
    // Add group to local state
    setGroups(prev => [...prev, newGroup]);
    setActiveTab('groups');
    
    // Notify all members about the new group via P2P
    try {
      // Connect to group members (include myself in the group)
      const activeService = getActiveSignalingService();
      await webrtcService.connectToGroup(groupId, memberPeerIds, activeService, currentUser.peerId);
      
      // Send group invitation message to all members
      // Include all members (selected peers + creator) in the invitation
      const allMemberPeerIds = [...memberPeerIds, currentUser.peerId];
      const invitationMessage = {
        type: 'group-invitation',
        groupId,
        groupName,
        memberPeerIds: allMemberPeerIds, // Include all members including creator
        memberCount: newGroup.memberCount,
        createdBy: currentUser.peerId,
        creatorUsername: currentUser.username,
        timestamp: Date.now()
      };
      
      // Send to each member via direct data channel
      for (const peerId of memberPeerIds) {
        try {
          // Get data channel directly
          const dataChannel = webrtcService.dataChannels.get(peerId);
          if (dataChannel && dataChannel.readyState === 'open') {
            dataChannel.send(JSON.stringify(invitationMessage));
          } else {
            // Try to send after connection establishes
            setTimeout(() => {
              const dc = webrtcService.dataChannels.get(peerId);
              if (dc && dc.readyState === 'open') {
                dc.send(JSON.stringify(invitationMessage));
              }
            }, 1000);
          }
        } catch (error) {
          console.warn(`⚠️ Could not send invitation to ${peerId}:`, error);
        }
      }
    } catch (error) {
      console.error('Error setting up group:', error);
    }
    
    // Auto-select the new group
    await handleSelectGroup(newGroup, false);
    
    showNotification(`Nhóm "${groupName}" đã được tạo!`, 'success');
  };

  const handleSelectGroup = async (group, openAsPopup = false) => {
    if (openAsPopup) {
      openGroupChatPopup(group);
    } else {
      setSelectedGroup(group);
      setSelectedPeer(null);
      setUnreadCounts(prev => {
        const newMap = new Map(prev);
        newMap.delete(group.groupId);
        return newMap;
      });
    }

    // Connect to all group members (include myself in the group)
    try {
      const activeService = getActiveSignalingService();
      await webrtcService.connectToGroup(group.groupId, group.memberPeerIds, activeService, currentUser.peerId);
    } catch (error) {
      console.error('Failed to connect to group:', error);
    }
  };

  const openGroupChatPopup = (group) => {
    const existingPopup = groupPopups.find(p => p.groupId === group.groupId);
    
    if (existingPopup) {
      setGroupPopups(prev => prev.map(p => 
        p.groupId === group.groupId ? { ...p, isMinimized: false } : p
      ));
    } else {
      setGroupPopups(prev => [...prev, {
        groupId: group.groupId,
        group: group,
        isMinimized: false
      }]);
    }
    
    // Clear unread count when opening popup
    setUnreadCounts(prev => {
      const newMap = new Map(prev);
      newMap.delete(group.groupId);
      return newMap;
    });
  };

  const closeGroupPopup = (groupId) => {
    setGroupPopups(prev => prev.filter(p => p.groupId !== groupId));
  };

  const minimizeGroupPopup = (groupId) => {
    setGroupPopups(prev => prev.map(p => 
      p.groupId === groupId ? { ...p, isMinimized: !p.isMinimized } : p
    ));
  };

  const maximizeGroupPopup = (groupId) => {
    const popup = groupPopups.find(p => p.groupId === groupId);
    if (popup) {
      setSelectedGroup(popup.group);
      setSelectedPeer(null);
      closeGroupPopup(groupId);
    }
  };

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const openChatPopup = (peerId, username) => {
    const existingPopup = popups.find(p => p.peerId === peerId);
    
    if (existingPopup) {
      setPopups(prev => prev.map(p => 
        p.peerId === peerId ? { ...p, isMinimized: false } : p
      ));
    } else {
      setPopups(prev => [...prev, {
        peerId,
        peer: { peerId, username },
        isMinimized: false
      }]);
    }
    
    // Clear unread count when opening popup
    setUnreadCounts(prev => {
      const newMap = new Map(prev);
      newMap.delete(peerId);
      return newMap;
    });
  };

  const closePopup = (peerId) => {
    setPopups(prev => prev.filter(p => p.peerId !== peerId));
  };

  const minimizePopup = (peerId) => {
    setPopups(prev => prev.map(p => 
      p.peerId === peerId ? { ...p, isMinimized: !p.isMinimized } : p
    ));
  };

  const maximizePopup = (peerId) => {
    const popup = popups.find(p => p.peerId === peerId);
    if (popup) {
      setSelectedPeer(popup.peer);
      closePopup(peerId);
    }
  };

  const sendMessage = async (message, peerId = null) => {
    const targetPeerId = peerId || selectedPeer?.peerId;
    if (!targetPeerId) return;

    try {
      await webrtcService.sendMessage(targetPeerId, message, null, signalingService);
      
      addMessage(targetPeerId, {
        from: currentUser.peerId,
        content: message,
        timestamp: Date.now(),
        type: 'sent'
      });
    } catch (error) {
      console.error('Error sending message:', error);
      showNotification('Failed to send message. Please ensure you are connected to the peer.', 'error');
    }
  };

  const sendFile = async (file, peerId = null) => {
    const targetPeerId = peerId || selectedPeer?.peerId;
    if (!targetPeerId) return;

    try {
      const reader = new FileReader();
      reader.onload = () => {
        addMessage(targetPeerId, {
          from: currentUser.peerId,
          content: file.name,
          timestamp: Date.now(),
          type: 'sent',
          fileData: reader.result,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size
        });
      };
      reader.readAsDataURL(file);
      
      await webrtcService.sendFile(targetPeerId, file, null, signalingService);
    } catch (error) {
      console.error('Error sending file:', error);
      showNotification('Failed to send file. Please ensure you are connected to the peer.', 'error');
    }
  };

  const sendGroupMessage = async (message, groupId = null) => {
    const targetGroupId = groupId || selectedGroup?.groupId;
    if (!targetGroupId) return;

    try {
      await webrtcService.sendGroupMessage(targetGroupId, message, signalingService, currentUser.peerId);
      
      addGroupMessage(targetGroupId, {
        from: currentUser.peerId,
        content: message,
        timestamp: Date.now(),
        type: 'sent'
      });
    } catch (error) {
      console.error('Error sending group message:', error);
      showNotification('Failed to send message to group.', 'error');
    }
  };

  const sendGroupFile = async (file, groupId = null) => {
    const targetGroupId = groupId || selectedGroup?.groupId;
    if (!targetGroupId) return;

    try {
      const reader = new FileReader();
      reader.onload = () => {
        addGroupMessage(targetGroupId, {
          from: currentUser.peerId,
          content: file.name,
          timestamp: Date.now(),
          type: 'sent',
          fileData: reader.result,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size
        });
      };
      reader.readAsDataURL(file);
      
      await webrtcService.sendGroupFile(targetGroupId, file, signalingService);
    } catch (error) {
      console.error('Error sending group file:', error);
      showNotification('Failed to send file to group.', 'error');
    }
  };

  const handleAcceptGroupInvitation = async (invitation) => {
    const newGroup = {
      groupId: invitation.groupId,
      groupName: invitation.groupName,
      memberPeerIds: invitation.memberPeerIds,
      memberCount: invitation.memberPeerIds.length, // Recalculate count from list (includes self)
      createdBy: invitation.createdBy,
      creatorUsername: invitation.creatorUsername,
      createdAt: invitation.timestamp
    };
    
    // Add group to local state
    setGroups(prev => [...prev, newGroup]);
    
    // Remove from pending invitations
    setGroupInvitations(prev => prev.filter(inv => inv.groupId !== invitation.groupId));
    
    // Connect to group members (include myself in the group)
    try {
      const activeService = getActiveSignalingService();
      await webrtcService.connectToGroup(invitation.groupId, invitation.memberPeerIds, activeService, currentUser.peerId);
      showNotification(`Đã tham gia nhóm "${invitation.groupName}"`, 'success');
      
      // Auto switch to groups tab and select the group
      setActiveTab('groups');
      await handleSelectGroup(newGroup, false);

      // Broadcast 'member-joined' to all other members
      const memberJoinedPayload = JSON.stringify({
        groupId: invitation.groupId,
        newMemberPeerIds: [currentUser.peerId]
      });

      // Filter out myself from the list to send to others
      const otherMembers = invitation.memberPeerIds.filter(id => id !== currentUser.peerId);

      for (const peerId of otherMembers) {
        try {
          // Send 'member-joined'
          await webrtcService.sendMessage(peerId, memberJoinedPayload, invitation.groupId, signalingService, currentUser.peerId, 'member-joined');
        } catch (error) {
          console.error(`Failed to notify ${peerId} of joining:`, error);
        }
      }

    } catch (error) {
      console.error('Error connecting to group:', error);
    }
  };

  const handleRejectGroupInvitation = (groupId) => {
    // Remove from pending invitations
    setGroupInvitations(prev => prev.filter(inv => inv.groupId !== groupId));
    
    showNotification('Đã từ chối lời mời', 'info');
  };

  const handleInviteMembers = async (newMemberPeerIds) => {
    if (!selectedGroup) return;
    const groupId = selectedGroup.groupId;
    
    // 1. Calculate future member list (but don't update local state yet)
    // We need to send the FULL list to the new member so they know who to connect to
    const currentMemberIds = selectedGroup.memberPeerIds;
    // Ensure current user is in the list before merging
    if (!currentMemberIds.includes(currentUser.peerId)) {
        currentMemberIds.push(currentUser.peerId);
    }
    const futureMemberPeerIds = [...new Set([...currentMemberIds, ...newMemberPeerIds])];
    
    // 2. Connect to new members first (to send the invite)
    const activeService = getActiveSignalingService();
    await webrtcService.connectToGroup(groupId, newMemberPeerIds, activeService, currentUser.peerId);
    
    // 3. Send invitation to new members
    const invitationMessage = {
        type: 'group-invitation',
        groupId,
        groupName: selectedGroup.groupName,
        memberPeerIds: futureMemberPeerIds,
        memberCount: currentMemberIds.length, // Send CURRENT count (excluding new members) for display
        createdBy: selectedGroup.createdBy,
        creatorUsername: selectedGroup.creatorUsername,
        timestamp: Date.now()
    };
    
    // Send to each new member
    for (const peerId of newMemberPeerIds) {
        try {
             const sendInvite = () => {
                 const dc = webrtcService.dataChannels.get(peerId);
                 if (dc && dc.readyState === 'open') {
                     dc.send(JSON.stringify(invitationMessage));
                 } else {
                     setTimeout(sendInvite, 1000);
                 }
             };
             sendInvite();
        } catch (e) {
            console.error(e);
        }
    }
    
    // Note: We do NOT update local state or notify existing members yet.
    // We wait for the new member to accept and send a 'member-joined' message.
    
    showNotification(`Đã gửi lời mời tới ${newMemberPeerIds.length} người`, 'success');
  };

  const handleBroadcast = async (message, peerIds, groupIds, file = null) => {
      let successCount = 0;
      let errorCount = 0;
    const timestamp = Date.now();
      
    // Send to individual peers
    for (const peerId of peerIds) {
      try {
      if (file) {
          // Send file
          await webrtcService.sendFile(peerId, file, null, signalingService);
          
          // Add to local conversation
        const reader = new FileReader();
        reader.onload = () => {
            addMessage(peerId, {
                from: currentUser.peerId,
                content: file.name,
              timestamp,
                type: 'sent',
                fileData: reader.result,
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size
          });
        };
        reader.readAsDataURL(file);
      } else {
          // Send text message
          await webrtcService.sendMessage(peerId, message, null, signalingService);
          
          // Add to local conversation
          addMessage(peerId, {
            from: currentUser.peerId,
            content: message,
            timestamp,
            type: 'sent'
          });
        }
        
        successCount++;
        } catch (error) {
        console.error(`Failed to send to peer ${peerId}:`, error);
        errorCount++;
        }
    }
      
    // Send to groups
    for (const groupId of groupIds) {
        try {
          if (file) {
          // Send file to group
            await webrtcService.sendGroupFile(groupId, file, signalingService);
          
          // Add to local group conversation
        const reader = new FileReader();
        reader.onload = () => {
            addGroupMessage(groupId, {
              from: currentUser.peerId,
              content: file.name,
              timestamp,
              type: 'sent',
              fileData: reader.result,
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size
          });
        };
        reader.readAsDataURL(file);
      } else {
          // Send text message to group
          await webrtcService.sendGroupMessage(groupId, message, signalingService, currentUser.peerId);
          
          // Add to local group conversation
          addGroupMessage(groupId, {
            from: currentUser.peerId,
            content: message,
            timestamp,
            type: 'sent'
          });
        }
        
        successCount++;
        } catch (error) {
        console.error(`Failed to send to group ${groupId}:`, error);
        errorCount++;
      }
    }

    const contentType = file ? 'file' : 'tin nhắn';
      if (errorCount === 0) {
      showNotification(`Đã gửi ${contentType} tới ${successCount} người nhận`, 'success');
      } else {
      showNotification(`Gửi ${contentType} tới ${successCount} người nhận, ${errorCount} thất bại`, 'warning');
    }
  };

  const addMessage = (peerId, message) => {
    setConversations(prev => {
      const newConversations = new Map(prev);
      const messages = newConversations.get(peerId) || [];
      newConversations.set(peerId, [...messages, message]);
      return newConversations;
    });
  };

  const addGroupMessage = (groupId, message) => {
    setGroupConversations(prev => {
      const newConversations = new Map(prev);
      const messages = newConversations.get(groupId) || [];
      newConversations.set(groupId, [...messages, message]);
      return newConversations;
    });
  };

  const handleLogout = async () => {
    try {
      webrtcService.closeAllConnections();
      const activeService = getActiveSignalingService();
      activeService.disconnect();
      authService.logout();
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Error during logout:', error);
      authService.logout();
      navigate('/login', { replace: true });
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'online': return '#4caf50';
      case 'offline': return '#f44336';
      case 'error': return '#ff9800';
      default: return '#9e9e9e';
    }
  };

  if (!currentUser) {
    return null;
  }

  return (
    <div className="chat-container">
      {/* Sidebar */}
      <div className="chat-sidebar">
        <div className="sidebar-header">
          <div className="user-info">
            <div className="user-avatar">
              {currentUser.username.charAt(0).toUpperCase()}
            </div>
            <div className="user-details">
              <h3>{currentUser.username}</h3>
              <div className="connection-status">
                <span 
                  className="status-dot" 
                  style={{ backgroundColor: getConnectionStatusColor() }}
                />
                <span className="status-text">
                  {connectionStatus === 'online' ? 'Connected' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
          <div className="header-actions">
            <button 
              className="peer-discovery-btn" 
              onClick={() => setShowPeerDiscovery(true)}
              title="Kết nối peer khác (True P2P)"
            >
              <FiWifi />
            </button>
            <button 
              className="broadcast-btn" 
              onClick={() => setShowBroadcast(true)}
              title="Gửi tin nhắn cho nhiều người"
              disabled={onlinePeers.size === 0 && groups.length === 0}
            >
              <FiSend />
            </button>
            <button className="logout-btn" onClick={handleLogout} title="Logout">
              <FiLogOut />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="sidebar-tabs">
          <button
            className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('users');
              setSelectedGroup(null);
            }}
          >
            Direct Chat
          </button>
          <button
            className={`tab-btn ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('groups');
              setSelectedPeer(null);
            }}
          >
            Groups ({groups.length})
          </button>
        </div>

        <div className="sidebar-section">
          {activeTab === 'users' ? (
            <>
              <div className="section-header">
                <FiUsers />
                <h4>Online Users ({onlinePeers.size})</h4>
              </div>
              
              <div className="user-list">
                {Array.from(onlinePeers.entries()).map(([peerId, username]) => (
                  <div
                    key={peerId}
                    className={`user-item ${selectedPeer?.peerId === peerId ? 'selected' : ''}`}
                    onClick={() => initiateConnection(peerId, username, false)}
                    onDoubleClick={() => initiateConnection(peerId, username, true)}
                    title="Click: Mở chat | Double-click: Mở popup"
                  >
                    <div className="user-avatar-small">
                      {username.charAt(0).toUpperCase()}
                    </div>
                    <div className="user-info-small">
                      <div className="username">{username}</div>
                      <div className="user-status">
                        <span className="status-dot-small online"></span>
                        <span>Online</span>
                      </div>
                    </div>
                    {unreadCounts.get(peerId) > 0 && (
                      <div className="unread-badge">
                        {unreadCounts.get(peerId) > 99 ? '99+' : unreadCounts.get(peerId)}
                      </div>
                    )}
                  </div>
                ))}
                
                {onlinePeers.size === 0 && (
                  <div className="empty-list">
                    <p>Không có user nào online</p>
                    <small>Mở app trên máy khác với nickname khác để test</small>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="section-header">
                <FiUsers />
                <h4>Nhóm Tạm Thời</h4>
                <button 
                  className="create-group-btn" 
                  onClick={() => setShowCreateGroup(true)}
                  title="Tạo nhóm mới"
                  disabled={onlinePeers.size === 0}
                >
                  <FiPlus />
                </button>
              </div>
              
              <div className="user-list">
                {groups.map(group => (
                  <div
                    key={group.groupId}
                    className={`user-item ${selectedGroup?.groupId === group.groupId ? 'selected' : ''}`}
                    onClick={() => handleSelectGroup(group, false)}
                    onDoubleClick={() => handleSelectGroup(group, true)}
                    title="Click: Mở chat nhóm | Double-click: Mở popup"
                  >
                    <div className="user-avatar-small" style={{ background: '#31a24c' }}>
                      {group.groupName.charAt(0).toUpperCase()}
                    </div>
                    <div className="user-info-small">
                      <div className="username">{group.groupName}</div>
                      <div className="user-status">
                        <span style={{ fontSize: '12px', color: '#65676b' }}>
                          {group.memberPeerIds.length} thành viên
                        </span>
                      </div>
                    </div>
                    {unreadCounts.get(group.groupId) > 0 && (
                      <div className="unread-badge">
                        {unreadCounts.get(group.groupId) > 99 ? '99+' : unreadCounts.get(group.groupId)}
                      </div>
                    )}
                  </div>
                ))}
                
                {groups.length === 0 && (
                  <div className="empty-list">
                    <p>Chưa có nhóm nào</p>
                    <small>Nhấn nút + để tạo nhóm mới</small>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="chat-main">
        {selectedPeer ? (
          <ChatWindow
            peer={selectedPeer}
            messages={conversations.get(selectedPeer.peerId) || []}
            currentPeerId={currentUser.peerId}
            isConnected={true}
            waitingForAcceptance={false}
            onSendMessage={sendMessage}
            onSendFile={sendFile}
            onBroadcast={null}
            onSendToRecipients={null}
            selectedRecipients={null}
            hasConnectedRecipients={false}
          />
        ) : selectedGroup ? (
          <GroupChatWindow
            group={selectedGroup}
            messages={groupConversations.get(selectedGroup.groupId) || []}
            currentPeerId={currentUser.peerId}
            currentUserId={currentUser.userId}
            allUsers={Array.from(onlinePeers.entries()).map(([peerId, username]) => ({ 
              peerId, 
              username,
              userId: peerId // Use peerId as userId for simplicity
            }))}
            friends={[]}
            connectionStatus={connectionStatus}
            connectedPeersCount={(() => {
              const allPeers = webrtcService.getGroupPeers(selectedGroup.groupId);
              // Exclude current user from count (we only count other peers we're connected to)
              return Array.from(allPeers).filter(peerId => peerId !== currentUser.peerId).length;
            })()}
            onSendMessage={sendGroupMessage}
            onSendFile={sendGroupFile}
            onLeaveGroup={null}
            onInviteMembers={() => setShowInviteModal(true)}
            onBroadcast={null}
            onSendToRecipients={null}
            selectedRecipients={null}
            hasConnectedRecipients={false}
          />
        ) : (
          <div className="no-chat-selected">
            <div className="empty-state">
              <FiUsers size={64} color="#ccc" />
              <h2>Welcome to P2P Chat!</h2>
              <p>Chọn một user hoặc nhóm từ danh sách bên trái để bắt đầu chat</p>
              <div className="features">
                <p>🔒 End-to-end encrypted</p>
                <p>⚡ Real-time P2P messaging</p>
                <p>📎 File sharing support</p>
                <p>👥 Temporary group chat</p>
                <p>🚀 No registration needed</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        onlinePeers={onlinePeers}
        onCreateGroup={handleCreateGroup}
        showNotification={showNotification}
      />

      {/* Chat Popups */}
      <div className="popups-container">
        {popups.map((popup, index) => (
          <div
            key={popup.peerId}
            className="popup-wrapper"
            style={{
              zIndex: 1000 + index,
              pointerEvents: 'none'
            }}
          >
            <ChatPopup
              peer={popup.peer}
              messages={conversations.get(popup.peerId) || []}
              currentPeerId={currentUser.peerId}
              isConnected={true}
              waitingForAcceptance={false}
              onClose={() => closePopup(popup.peerId)}
              onMinimize={() => minimizePopup(popup.peerId)}
              onMaximize={() => maximizePopup(popup.peerId)}
              onSendMessage={(msg) => sendMessage(msg, popup.peerId)}
              onSendFile={(file) => sendFile(file, popup.peerId)}
              onBroadcast={null}
              onSendToRecipients={null}
              selectedRecipients={null}
              hasConnectedRecipients={false}
              isMinimized={popup.isMinimized}
            />
          </div>
        ))}

        {/* Group Chat Popups */}
        {groupPopups.map((popup, index) => (
          <div
            key={popup.groupId}
            className="popup-wrapper"
            style={{
              zIndex: 1000 + popups.length + index,
              pointerEvents: 'none'
            }}
          >
            <GroupChatPopup
              group={popup.group}
              messages={groupConversations.get(popup.groupId) || []}
              currentPeerId={currentUser.peerId}
              allUsers={Array.from(onlinePeers.entries()).map(([peerId, username]) => ({ 
                peerId, 
                username 
              }))}
              connectedPeersCount={(() => {
                const allPeers = webrtcService.getGroupPeers(popup.groupId);
                // Exclude current user from count (we only count other peers we're connected to)
                return Array.from(allPeers).filter(peerId => peerId !== currentUser.peerId).length;
              })()}
              onClose={() => closeGroupPopup(popup.groupId)}
              onMinimize={() => minimizeGroupPopup(popup.groupId)}
              onMaximize={() => maximizeGroupPopup(popup.groupId)}
              onSendMessage={(msg) => sendGroupMessage(msg, popup.groupId)}
              onSendFile={(file) => sendGroupFile(file, popup.groupId)}
              isMinimized={popup.isMinimized}
            />
          </div>
        ))}
      </div>

      {/* Broadcast Modal */}
      <BroadcastModal
        isOpen={showBroadcast}
        onClose={() => setShowBroadcast(false)}
        onlinePeers={onlinePeers}
        groups={groups}
        onSend={handleBroadcast}
        showNotification={showNotification}
      />

      {/* Group Invitation Modal */}
      <GroupInvitationModal
        invitations={groupInvitations}
        onAccept={handleAcceptGroupInvitation}
        onReject={handleRejectGroupInvitation}
      />

      {/* Invite Member Modal */}
      <InviteMemberModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onlinePeers={onlinePeers}
        currentMembers={selectedGroup ? selectedGroup.memberPeerIds : []}
        onInvite={handleInviteMembers}
        showNotification={showNotification}
      />

      {/* Peer Discovery Modal */}
      <PeerDiscoveryModal
        isOpen={showPeerDiscovery}
        onClose={() => {
          setShowPeerDiscovery(false);
        }}
        onConnect={handleConnectToPeer}
        myIP={myIP}
        knownPeers={knownPeers}
        onRemovePeer={handleRemovePeer}
        discoveredPeers={discoveredPeers}
        onStartDiscovery={handleStartDiscovery}
        onStopDiscovery={handleStopDiscovery}
        isDiscovering={isDiscovering}
        onlinePeers={onlinePeers}
      />

      {/* Notification */}
      <Notification 
        message={notification?.message} 
        type={notification?.type} 
        onClose={() => setNotification(null)} 
      />
    </div>
  );
}

export default Chat;
