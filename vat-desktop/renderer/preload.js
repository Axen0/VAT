const { contextBridge, ipcRenderer } = require('electron');

const VALID_CHANNELS = [
  // File System
  'file:select-video', 'file:select-audio', 'file:select-directory', 'file:validate-path',
  // Account & Settings
  'account:get', 'account:update-nickname', 'settings:get', 'settings:update',
  // History
  'history:get-downloads', 'history:get-rooms', 'history:add-download', 'history:clear',
  // Room
  'room:get-state', 'room:create', 'room:join', 'room:leave', 
  'room:kick-member', 'room:transfer-host', 'host:return-decision',
  // Media
  'media:load-file', 'media:accept-download', 'media:request-quality', 'media:start-download',
  // Sync
  'sync:play', 'sync:pause', 'sync:seek', 'sync:report-ready',
  // LAN
  'lan:enable', 'lan:disable', 'lan:discover', 'lan:get-local-ip',
  // Chat
  'chat:send', 'chat:get-log',
  // Torrent
  'torrent:seed-file', 'torrent:download-file', 'torrent:pause', 'torrent:resume', 
  'torrent:get-progress', 'torrent:get-stats',
  // FFmpeg
  'ffmpeg:get-media-info', 'ffmpeg:get-qualities', 'ffmpeg:convert-video', 
  'ffmpeg:convert-audio', 'ffmpeg:cancel', 'ffmpeg:queue-status', 
  'ffmpeg:check-compatibility', 'ffmpeg:remux'
];

const VALID_LISTEN_CHANNELS = [
  'connection:status', 'chat:message-receive', 'torrent:progress', 'torrent:alert',
  'torrent:part-completed', 'ffmpeg:progress', 'room:participant-update',
  'room:host-changed', 'sync:play-command', 'sync:pause-command', 'sync:seek-command',
  'sync:all-ready', 'media:download-available', 'media:slow-member-alert',
  'media:quality-ready', 'room:participant-disconnected', 'host:return-question'
];

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel, data) => {
    if (VALID_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
    return Promise.reject(new Error(`Invalid IPC channel: ${channel}`));
  },
  on: (channel, func) => {
    if (VALID_LISTEN_CHANNELS.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  removeListener: (channel, func) => {
    if (VALID_LISTEN_CHANNELS.includes(channel)) {
      ipcRenderer.removeListener(channel, func);
    }
  }
});