/**
 * VAT Web - Socket.IO client.
 * No IPC: UI subscribes directly via on/off/once callbacks.
 */

import { io } from 'socket.io-client';
import 'shared/constants.js';
import 'shared/events.js';

const VAT_CONSTANTS = window.VAT_CONSTANTS;
const SOCKET_EVENTS = window.SOCKET_EVENTS;

class SocketClient {
  constructor() {
    this.socket = null;
    this.callbacks = new Map();
    this.connected = false;
    this.roomId = null;
    this.participantId = null;
    this._connectResolvers = [];
  }

  /**
   * Connect to the signal server.
   * @param {string} serverUrl
   */
  connect(serverUrl) {
    if (this.socket) this.socket.disconnect();

    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: VAT_CONSTANTS.SIGNAL.RECONNECT_ATTEMPTS,
      reconnectionDelay: VAT_CONSTANTS.SIGNAL.RECONNECT_DELAY,
      reconnectionDelayMax: VAT_CONSTANTS.SIGNAL.RECONNECT_DELAY_MAX,
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this._connectResolvers.forEach((r) => r());
      this._connectResolvers = [];
      this._emit('connected', { socketId: this.socket.id });
    });

    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      this._emit('disconnected', { reason });
    });

    this.socket.on('connect_error', (err) => {
      this._emit('connection-error', { error: err.message });
    });

    const S2C = SOCKET_EVENTS.SERVER_TO_CLIENT;
    const forward = (localName, eventName) => {
      this.socket.on(eventName, (data) => this._emit(localName, data));
    };

    forward('room-joined', S2C.ROOM_JOINED);
    forward('room-closed', S2C.ROOM_CLOSED);
    forward('participant-update', S2C.ROOM_PARTICIPANT_UPDATE);
    forward('participant-disconnected', S2C.ROOM_PARTICIPANT_DISCONNECTED);
    forward('host-changed', S2C.ROOM_HOST_CHANGED);
    forward('kicked', S2C.ROOM_KICKED);
    forward('settings-updated', S2C.ROOM_SETTINGS_UPDATED);
    forward('download-available', S2C.MEDIA_DOWNLOAD_AVAILABLE);
    forward('slow-member-alert', S2C.MEDIA_SLOW_MEMBER_ALERT);
    forward('quality-converting', S2C.MEDIA_QUALITY_CONVERTING);
    forward('quality-ready', S2C.MEDIA_QUALITY_READY);
    forward('all-ready', S2C.MEDIA_ALL_READY);
    forward('play-command', S2C.SYNC_PLAY_COMMAND);
    forward('pause-command', S2C.SYNC_PAUSE_COMMAND);
    forward('seek-command', S2C.SYNC_SEEK_COMMAND);
    forward('sync-all-ready', S2C.SYNC_ALL_READY);
    forward('time-sync-response', S2C.TIME_SYNC_RESPONSE);
    forward('chat-message', S2C.CHAT_MESSAGE_RECEIVE);
    forward('host-return-question', S2C.HOST_RETURN_QUESTION);
    forward('host-return-notification', S2C.HOST_RETURN_NOTIFICATION);
  }

  /** Resolves when the socket is connected. */
  whenConnected() {
    if (this.connected) return Promise.resolve();
    return new Promise((resolve) => this._connectResolvers.push(resolve));
  }

  /**
   * Join a room.
   * @returns {Promise<{success: boolean, roomState?: Object, error?: string}>}
   */
  async joinRoom(data) {
    await this.whenConnected();
    this.roomId = data.roomId;
    this.participantId = data.participantId;
    return new Promise((resolve) => {
      this.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.ROOM_JOIN, data, (response) => resolve(response));
    });
  }

  leaveRoom() {
    if (this.socket && this.roomId) {
      this.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.ROOM_LEAVE, { roomId: this.roomId });
    }
    this.roomId = null;
  }

  acceptDownload(quality) {
    this.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.MEDIA_DOWNLOAD_ACCEPT, {
      roomId: this.roomId,
      quality: quality || 'original',
    });
  }

  reportProgress(percent, partIndex) {
    this.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.MEDIA_PROGRESS_UPDATE, {
      roomId: this.roomId,
      percent,
      partIndex,
    });
  }

  reportPartCompleted(partIndex) {
    this.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.MEDIA_PART_COMPLETED, {
      roomId: this.roomId,
      partIndex,
    });
  }

  requestQuality(quality) {
    this.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.MEDIA_QUALITY_REQUEST, {
      roomId: this.roomId,
      quality,
    });
  }

  sendSyncPlay(position) {
    this.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.SYNC_PLAY, { roomId: this.roomId, position });
  }

  sendSyncPause(position) {
    this.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.SYNC_PAUSE, { roomId: this.roomId, position });
  }

  sendSyncSeek(position) {
    this.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.SYNC_SEEK, { roomId: this.roomId, position });
  }

  reportPosition(position) {
    this.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.SYNC_POSITION_REPORT, { roomId: this.roomId, position });
  }

  reportReady() {
    this.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.SYNC_READY, { roomId: this.roomId });
  }

  requestTimeSync(clientTimestamp) {
    this.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.TIME_SYNC_REQUEST, {
      clientTimestamp,
      clientTime: clientTimestamp,
    });
  }

  sendChatMessage(message, senderId, senderNickname) {
    this.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.CHAT_MESSAGE, {
      roomId: this.roomId,
      message,
      senderId,
      senderNickname,
    });
  }

  on(event, callback) {
    if (!this.callbacks.has(event)) this.callbacks.set(event, []);
    this.callbacks.get(event).push(callback);
  }

  off(event, callback) {
    const list = this.callbacks.get(event);
    if (!list) return;
    const idx = list.indexOf(callback);
    if (idx >= 0) list.splice(idx, 1);
  }

  once(event, callback) {
    const wrapper = (data) => {
      this.off(event, wrapper);
      callback(data);
    };
    this.on(event, wrapper);
  }

  _emit(event, data) {
    (this.callbacks.get(event) || []).forEach((cb) => {
      try { cb(data); } catch (err) { console.error('[SocketClient] Listener error:', err); }
    });
  }

  disconnect() {
    if (this.socket) this.socket.disconnect();
    this.socket = null;
    this.connected = false;
    this.callbacks.clear();
  }
}

export default new SocketClient();