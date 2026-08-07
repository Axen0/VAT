const { io } = require('socket.io-client');
const { BrowserWindow } = require('electron');
const VAT_CONSTANTS = require('../../shared/constants');
const SOCKET_EVENTS = require('../../shared/events');

class SocketClient {
  constructor() {
    this.socket = null;
    // Fix: Ensure proper URL format without trailing slashes
    // Try multiple sources for the signal server URL
    let serverUrl = process.env.SIGNAL_SERVER_URL || 'http://127.0.0.1:3000';
    
    if (!serverUrl || serverUrl === '') {
      serverUrl = 'http://127.0.0.1:3000';
    }
    
    serverUrl = serverUrl.replace(/\/$/, ''); // Remove trailing slash if present
    this.serverUrl = serverUrl;
    this.currentRoomId = null;
    this.currentNickname = null;
    this.currentParticipantId = null;
    this.currentPassword = null;
    console.log(`[SocketClient] Signal server URL: ${this.serverUrl}`);
  }

  connect(nickname, participantId) {
    if (this.socket && this.socket.connected) {
      console.log('[SocketClient] Already connected, returning existing socket');
      return this.socket;
    }

    this.currentNickname = nickname;
    this.currentParticipantId = participantId;

    console.log(`[SocketClient] Connecting to ${this.serverUrl}...`);

    this.socket = io(this.serverUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: VAT_CONSTANTS.SIGNAL.RECONNECT_ATTEMPTS,
      reconnectionDelay: VAT_CONSTANTS.SIGNAL.RECONNECT_DELAY,
      reconnectionDelayMax: VAT_CONSTANTS.SIGNAL.RECONNECT_DELAY_MAX,
      forceNew: true,
      timeout: 10000, // Connection timeout in ms
      autoConnect: true
    });

    this.socket.on('connect', () => {
      console.log(`[SocketClient] Connected: ${this.socket.id}`);
      this._notifyRenderer('connection:status', { status: 'connected', id: this.socket.id });
      
      if (this.currentRoomId) {
        this.joinRoom(this.currentRoomId, this.currentPassword);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`[SocketClient] Disconnected: ${reason}`);
      this._notifyRenderer('connection:status', { status: 'disconnected', reason });
    });

    this.socket.on('connect_error', (error) => {
      console.error(`[SocketClient] Connection error:`, error.message, error.type);
      // Notify renderer about connection failure
      this._notifyRenderer('connection:error', { error: error.message });
    });

    this.socket.on('connect_timeout', () => {
      console.error(`[SocketClient] Connection timeout to ${this.serverUrl}`);
      this._notifyRenderer('connection:error', { error: 'Connection timeout. Is signal server running?' });
    });

    const serverEvents = Object.values(SOCKET_EVENTS.SERVER_TO_CLIENT);
    serverEvents.forEach(event => {
      this.socket.on(event, (data) => {
        this._notifyRenderer(event, data);
      });
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.currentRoomId = null;
    }
  }

  isConnected() {
    return this.socket && this.socket.connected;
  }

  emit(event, data, callback) {
    if (this.isConnected()) {
      this.socket.emit(event, data, callback);
    }
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
      return () => this.socket.off(event, callback);
    }
  }

  once(event, callback) {
    if (this.socket) {
      this.socket.once(event, callback);
    }
  }

  createRoom(password, settings) {
    return new Promise((resolve, reject) => {
      const payload = { 
        nickname: this.currentNickname, 
        participantId: this.currentParticipantId, 
        password, 
        settings 
      };
      
      this.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.ROOM_CREATE, payload, (response) => {
        if (response && response.success) {
          this.currentRoomId = response.roomId;
          this.currentPassword = password;
          resolve(response);
        } else {
          reject(new Error(response ? response.error : 'Failed to create room'));
        }
      });
    });
  }

  joinRoom(roomId, password) {
    return new Promise((resolve, reject) => {
      this.currentRoomId = roomId;
      this.currentPassword = password;
      
      const payload = { 
        roomId, 
        nickname: this.currentNickname, 
        participantId: this.currentParticipantId, 
        password 
      };
      
      this.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.ROOM_JOIN, payload, (response) => {
        if (response && response.success) {
          resolve(response);
        } else {
          reject(new Error(response ? response.error : 'Failed to join room'));
        }
      });
    });
  }

  leaveRoom(roomId) {
    this.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.ROOM_LEAVE, { roomId });
    this.currentRoomId = null;
  }

  _notifyRenderer(event, data) {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      win.webContents.send(event, data);
    });
  }

  getSocket() {
    return this.socket;
  }
}

module.exports = new SocketClient();