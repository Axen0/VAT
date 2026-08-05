const crypto = require('crypto');

// Generate a random 4-character string for default nickname
const generateDefaultNickname = () => {
  return `User_${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
};

const storeSchema = {
  account: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        default: crypto.randomUUID()
      },
      nickname: {
        type: 'string',
        default: generateDefaultNickname()
      },
      createdAt: {
        type: 'number',
        default: Date.now()
      }
    },
    additionalProperties: false,
    default: {}
  },
  settings: {
    type: 'object',
    properties: {
      defaultDownloadPath: {
        type: 'string',
        default: ''
      },
      defaultPlaybackThreshold: {
        type: 'number',
        default: 30
      },
      defaultPauseOnDisconnect: {
        type: 'boolean',
        default: true
      },
      torrentUploadLimit: {
        type: 'number',
        default: 0
      },
      torrentDownloadLimit: {
        type: 'number',
        default: 0
      },
      theme: {
        type: 'string',
        default: 'dark',
        enum: ['dark', 'light']
      },
      accentColor: {
        type: 'string',
        default: '#007acc'
      }
    },
    additionalProperties: false,
    default: {}
  },
  downloadHistory: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        roomId: { type: 'string' },
        filename: { type: 'string' },
        filePath: { type: 'string' },
        downloadedAt: { type: 'number' },
        fileSize: { type: 'number' }
      },
      required: ['roomId', 'filename', 'filePath', 'downloadedAt', 'fileSize']
    },
    default: []
  },
  roomHistory: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        roomId: { type: 'string' },
        createdAt: { type: 'number' },
        lastActiveAt: { type: 'number' },
        role: { type: 'string', enum: ['host', 'guest'] },
        mediaFiles: { type: 'array', items: { type: 'string' } },
        chatLogPath: { type: 'string' }
      },
      required: ['roomId', 'createdAt', 'lastActiveAt', 'role', 'mediaFiles', 'chatLogPath']
    },
    default: []
  }
};

module.exports = storeSchema;