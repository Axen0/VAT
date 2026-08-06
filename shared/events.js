/**
 * shared/events.js
 * 
 * Strict dictionary of all Socket.IO event names used in the VAT system.
 * Prevents typos and ensures consistent event naming across signal-server, 
 * vat-desktop, vat-web, and vat-mobile.
 */

const SOCKET_EVENTS = {
  // ==========================================
  // CLIENT TO SERVER (Section 5.1)
  // ==========================================
  CLIENT_TO_SERVER: {
    // Room management
    ROOM_CREATE: 'room:create',
    ROOM_JOIN: 'room:join',
    ROOM_LEAVE: 'room:leave',
    ROOM_PASSWORD_CHECK: 'room:password-check',
    ROOM_KICK: 'room:kick',
    ROOM_TRANSFER_HOST: 'room:transfer-host',
    HOST_RETURN_REQUEST: 'host:return-request',
    HOST_RETURN_RESPONSE: 'host:return-response',

    // Media management
    MEDIA_FILE_READY: 'media:file-ready',
    MEDIA_DOWNLOAD_ACCEPT: 'media:download-accept',
    MEDIA_PROGRESS_UPDATE: 'media:progress-update',
    MEDIA_PART_COMPLETED: 'media:part-completed',
    MEDIA_QUALITY_REQUEST: 'media:quality-request',
    MEDIA_QUALITY_READY: 'media:quality-ready',

    // Playback synchronization
    SYNC_PLAY: 'sync:play',
    SYNC_PAUSE: 'sync:pause',
    SYNC_SEEK: 'sync:seek',
    SYNC_POSITION_REPORT: 'sync:position-report',
    SYNC_READY: 'sync:ready',
    TIME_SYNC_REQUEST: 'time:sync-request',

    // WebRTC signaling
    WEBRTC_OFFER: 'webrtc:offer',
    WEBRTC_ANSWER: 'webrtc:answer',
    WEBRTC_ICE_CANDIDATE: 'webrtc:ice-candidate',

    // Chat
    CHAT_MESSAGE: 'chat:message',

    // Settings and permissions
    SETTINGS_UPDATE: 'settings:update',
    SETTINGS_PERMISSION: 'settings:permission'
  },

  // ==========================================
  // SERVER TO CLIENT (Section 5.1)
  // ==========================================
  SERVER_TO_CLIENT: {
    // Room management
    ROOM_CREATED: 'room:created',
    ROOM_JOINED: 'room:joined',
    ROOM_LEFT: 'room:left',
    ROOM_CLOSED: 'room:closed',
    ROOM_PARTICIPANT_UPDATE: 'room:participant-update',
    ROOM_PARTICIPANT_DISCONNECTED: 'room:participant-disconnected',
    ROOM_HOST_CHANGED: 'room:host-changed',
    ROOM_KICKED: 'room:kicked',
    ROOM_SETTINGS_UPDATED: 'room:settings-updated',
    HOST_RETURN_QUESTION: 'host:return-question',
    HOST_RETURN_NOTIFICATION: 'host:return-notification',

    // Media management
    MEDIA_DOWNLOAD_AVAILABLE: 'media:download-available',
    MEDIA_SLOW_MEMBER_ALERT: 'media:slow-member-alert',
    MEDIA_QUALITY_CONVERTING: 'media:quality-converting',
    MEDIA_QUALITY_READY: 'media:quality-ready',
    MEDIA_ALL_READY: 'media:all-ready',

    // Playback synchronization
    SYNC_PLAY_COMMAND: 'sync:play-command',
    SYNC_PAUSE_COMMAND: 'sync:pause-command',
    SYNC_SEEK_COMMAND: 'sync:seek-command',
    SYNC_ALL_READY: 'sync:all-ready',
    TIME_SYNC_RESPONSE: 'time:sync-response',

    // WebRTC signaling
    WEBRTC_OFFER: 'webrtc:offer',
    WEBRTC_ANSWER: 'webrtc:answer',
    WEBRTC_ICE_CANDIDATE: 'webrtc:ice-candidate',

    // Chat
    CHAT_MESSAGE_RECEIVE: 'chat:message-receive'
  }
};

// Export for Node.js (CommonJS) and ES Modules compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SOCKET_EVENTS;
} else {
  // Fallback for browser/Vite environments
  window.SOCKET_EVENTS = SOCKET_EVENTS;
}