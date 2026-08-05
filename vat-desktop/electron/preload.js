const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

const SOCKET_EVENTS = require(path.join(__dirname, '../../shared/events'));

const VALID_SERVER_EVENTS = Object.values(SOCKET_EVENTS.SERVER_TO_CLIENT);

const VALID_IPC_EVENTS = [
  'torrent:progress', 
  'torrent:alert',
  'torrent:part-completed',
  'ffmpeg:progress', 
  'connection:status',
  'chat:message-receive'
];

const validChannels = [...VALID_SERVER_EVENTS, ...VALID_IPC_EVENTS];

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel, data) => {
    const validInvokeChannels = [
      // File System
      'file:select-video', 'file:select-audio', 'file:select-directory', 'file:validate-path',
      // Account
      'account:get', 'account:update-nickname',
      // Settings
      'settings:get', 'settings:update',
      // History
      'history:get-downloads', 'history:get-rooms', 'history:add-download', 'history:clear',
      // Room State & Actions
      'room:get-state', 'room:create', 'room:join', 'room:leave', 'room:update-settings', 
      'room:kick-member', 'room:transfer-host', 'host:return-decision',
      // Media Actions
      'media:load-file', 'media:accept-download', 'media:request-quality', 'media:start-download',
      // Sync Actions
      'sync:play', 'sync:pause', 'sync:seek', 'sync:report-ready',
      // LAN Actions
      'lan:enable', 'lan:disable', 'lan:discover', 'lan:get-local-ip',
      // Chat Actions
      'chat:send', 'chat:get-log',
      // Torrent Actions
      'torrent:seed-file', 'torrent:download-file', 'torrent:pause', 'torrent:resume', 
      'torrent:get-progress', 'torrent:get-stats',
      // FFmpeg Actions
      'ffmpeg:get-media-info', 'ffmpeg:get-qualities', 'ffmpeg:convert-video', 
      'ffmpeg:convert-audio', 'ffmpeg:cancel', 'ffmpeg:queue-status', 
      'ffmpeg:check-compatibility', 'ffmpeg:remux'
    ];
    
    if (validInvokeChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
    return Promise.reject(new Error(`Invalid IPC invoke channel: ${channel}`));
  },
  
  on: (channel, func) => {
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    } else {
      console.warn(`Attempted to listen to invalid IPC channel: ${channel}`);
    }
  },
  
  removeListener: (channel, func) => {
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, func);
    }
  }
});