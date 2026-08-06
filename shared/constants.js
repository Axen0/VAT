/**
 * shared/constants.js
 * 
 * Centralized configuration and constants shared across all VAT projects.
 * Ensures consistency in timeouts, thresholds, and protocol versions.
 */

const VAT_CONSTANTS = {
  // Protocol versioning (Section 16)
  PROTOCOL_VERSION: '1.0',

  // Room settings (Section 15)
  ROOM: {
    ID_LENGTH: 8,
    MAX_PARTICIPANTS: 20,
    HOST_RETURN_TIMEOUT: 30 * 60 * 1000, // 30 minutes in ms
    PASSWORD_MIN_LENGTH: 4,
    PASSWORD_MAX_LENGTH: 32,
  },

  // Download and sequential loading settings (Section 6 & 15)
  DOWNLOAD: {
    DEFAULT_THRESHOLD: 30, // Percentage to start playback
    MIN_THRESHOLD: 5,
    MAX_THRESHOLD: 100,
    PROGRESS_REPORT_INTERVAL: 10000, // ms between progress updates to server
    SLOW_MEMBER_GAP: 15, // Percentage lag for alert
    SLOW_MEMBER_MIN_AVG: 80, // Minimum average progress to trigger slow member alert
    NO_PEERS_TIMEOUT: 60000, // ms waiting for peers before warning
    CHUNK_BUFFER_SIZE: 4 * 1024 * 1024, // 4MB buffer before writing to disk
  },

  // Playback synchronization settings (Section 7 & 15)
  SYNC: {
    COMMAND_DELAY: 500, // ms buffer for executing sync commands
    TIME_SYNC_INTERVAL: 30000, // ms between time synchronization requests
    HIGH_LATENCY_WARNING: 200, // ms roundtrip time to show UI warning
    BUFFER_STALL_TIMEOUT: 10000, // ms of buffering before showing stall notification
  },

  // WebTorrent settings (Section 6 & 15)
  TORRENT: {
    PIECE_PRIORITY_HIGH: 7, // WebTorrent priority for active sequential part
    PIECE_PRIORITY_OFF: 0, // WebTorrent priority for locked/inactive parts
    ANNOUNCE_INTERVAL: 30000, // ms between tracker announces
  },

  // FFmpeg transcoding settings (Section 9 & 15)
  FFMPEG: {
    MAX_CONCURRENT_JOBS: 1,
    DEFAULT_CRF: 23, // H.264 quality balance
    DEFAULT_PRESET: 'medium', // Encoding speed/quality balance
    AUDIO_BITRATE: '128k',
    SUPPORTED_INPUT: [
      'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm',
      'mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a'
    ],
    BROWSER_COMPATIBLE: [
      'mp4', 'webm', 'mp3', 'aac', 'ogg'
    ],
    // Degradation rules based on original resolution (Section 9.1)
    QUALITY_PROFILES: {
      '2160p': ['original', '1080p', '720p'],
      '1080p': ['original', '720p'],
      '720p': ['original', '480p'],
      '480p': ['original', '360p'],
      '360p': ['original']
    }
  },

  // Local Area Network settings (Section 11 & 15)
  LAN: {
    MDNS_SERVICE: '_vat._tcp.local',
    DEFAULT_PORT: 57832,
    DISCOVERY_TIMEOUT: 5000, // ms for device discovery
  },

  // Bluetooth settings (Section 12 & 15)
  BLUETOOTH: {
    SERVICE_UUID: '00001101-0000-1000-8000-00805f9b34fb', // SPP for Classic Bluetooth
    LARGE_FILE_WARNING: 50 * 1024 * 1024, // 50MB threshold for warning
    CHUNK_SIZE: 512 * 1024, // 512KB chunk size for BT transfer
  },

  // Signal server connection settings (Section 15)
  SIGNAL: {
    RECONNECT_ATTEMPTS: 10,
    RECONNECT_DELAY: 1000, // ms base delay
    RECONNECT_DELAY_MAX: 30000, // ms maximum delay
  },

  // Chat settings (Section 15 & 18)
  CHAT: {
    MAX_MESSAGE_LENGTH: 1000, // characters
    MAX_HISTORY: 1000, // messages stored on host
  }
};

// Export for Node.js (CommonJS) and ES Modules compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VAT_CONSTANTS;
} else {
  // Fallback for browser/Vite environments
  window.VAT_CONSTANTS = VAT_CONSTANTS;
}