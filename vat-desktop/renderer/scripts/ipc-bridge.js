// Wrapper for cleaner IPC calls in UI components
export const IPC = {
  // Account
  getAccount: () => window.electronAPI.invoke('account:get'),
  updateNickname: (nickname) => window.electronAPI.invoke('account:update-nickname', nickname),
  
  // Settings
  getSettings: () => window.electronAPI.invoke('settings:get'),
  updateSettings: (settings) => window.electronAPI.invoke('settings:update', settings),
  
  // History
  getDownloadHistory: () => window.electronAPI.invoke('history:get-downloads'),
  getRoomHistory: () => window.electronAPI.invoke('history:get-rooms'),
  clearHistory: () => window.electronAPI.invoke('history:clear'),
  
  // Room
  createRoom: (data) => window.electronAPI.invoke('room:create', data),
  joinRoom: (data) => window.electronAPI.invoke('room:join', data),
  leaveRoom: () => window.electronAPI.invoke('room:leave'),
  getRoomState: () => window.electronAPI.invoke('room:get-state'),
  updateRoomSettings: (settings) => window.electronAPI.invoke('room:update-settings', settings),
  
  // Media & Torrent
  selectVideo: () => window.electronAPI.invoke('file:select-video'),
  selectAudio: () => window.electronAPI.invoke('file:select-audio'),
  selectDirectory: () => window.electronAPI.invoke('file:select-directory'),
  loadFile: (filePath, roomId) => window.electronAPI.invoke('media:load-file', { filePath, roomId }),
  startDownload: (data) => window.electronAPI.invoke('media:start-download', data),
  getTorrentProgress: (infoHash) => window.electronAPI.invoke('torrent:get-progress', infoHash),
  
  // Sync
  syncPlay: (position) => window.electronAPI.invoke('sync:play', { position }),
  syncPause: (position) => window.electronAPI.invoke('sync:pause', { position }),
  syncSeek: (position) => window.electronAPI.invoke('sync:seek', { position }),
  reportReady: () => window.electronAPI.invoke('sync:report-ready'),
  
  // LAN
  enableLan: () => window.electronAPI.invoke('lan:enable'),
  disableLan: () => window.electronAPI.invoke('lan:disable'),
  getLocalIp: () => window.electronAPI.invoke('lan:get-local-ip'),
  
  // Chat
  sendChat: (roomId, message) => window.electronAPI.invoke('chat:send', { roomId, message }),
  getChatLog: () => window.electronAPI.invoke('chat:get-log'),
  
  // Generic invoke for dynamic channels
  invoke: (channel, data) => window.electronAPI.invoke(channel, data),
  
  // Listeners
  on: (channel, callback) => window.electronAPI.on(channel, callback),
  off: (channel, callback) => window.electronAPI.removeListener(channel, callback)
};