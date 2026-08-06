const { ipcMain } = require('electron');
const Store = require('electron-store');
const storeSchema = require('./electron-store-schema');
const fileManager = require('./file-manager');
const roomState = require('./room-state');
const socketClient = require('./socket-client');
const torrentManager = require('./torrent-manager');
const ffmpegService = require('./ffmpeg-service');
const syncService = require('./sync-service');
const lanDiscovery = require('./lan-discovery');
const chatService = require('./chat-service');
const SOCKET_EVENTS = require('../../shared/events');

const store = new Store({ schema: storeSchema });

function registerIpcHandlers() {
  console.log('[IPC] Registering handlers...');

  // --- File System ---
  ipcMain.handle('file:select-video', async () => await fileManager.selectFile('video'));
  ipcMain.handle('file:select-audio', async () => await fileManager.selectFile('audio'));
  ipcMain.handle('file:select-directory', async () => await fileManager.selectDirectory());
  ipcMain.handle('file:validate-path', async (event, filePath) => await fileManager.validateFilePath(filePath));

  // --- Account & Settings ---
  ipcMain.handle('account:get', () => store.get('account'));
  ipcMain.handle('account:update-nickname', (event, nickname) => store.set('account.nickname', nickname));
  ipcMain.handle('settings:get', () => store.get('settings'));
  ipcMain.handle('settings:update', (event, settings) => store.set('settings', settings));

  // --- History ---
  ipcMain.handle('history:get-downloads', () => store.get('downloadHistory'));
  ipcMain.handle('history:get-rooms', () => store.get('roomHistory'));
  ipcMain.handle('history:add-download', (event, record) => {
    const history = store.get('downloadHistory') || [];
    history.push(record);
    store.set('downloadHistory', history);
  });
  ipcMain.handle('history:clear', () => {
    store.set('downloadHistory', []);
    store.set('roomHistory', []);
  });

  // --- Room Actions ---
  ipcMain.handle('room:get-state', () => roomState.toJSON());

  ipcMain.handle('room:create', async (event, { password, settings }) => {
    try {
      const account = store.get('account');
      socketClient.connect(account.nickname, account.id);
      
      const response = await socketClient.createRoom(password, settings);
      
      roomState.setRoom(response.roomId, 'host');
      syncService.startRoomSync();
      return { success: true, roomId: response.roomId, link: response.link };
    } catch (error) {
      console.error('[IPC] Room creation failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('room:join', async (event, { roomId, password }) => {
    try {
      const account = store.get('account');
      socketClient.connect(account.nickname, account.id);
      
      await socketClient.joinRoom(roomId, password);
      
      roomState.setRoom(roomId, 'guest');
      syncService.startRoomSync();
      return { success: true, roomId };
    } catch (error) {
      console.error('[IPC] Room join failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('room:leave', async () => {
    const state = roomState.toJSON();
    if (state.currentRoom) {
      await chatService.saveChatLog(state.currentRoom);
      chatService.clearLog();
      socketClient.leaveRoom(state.currentRoom);
      socketClient.disconnect();
      roomState.reset();
      syncService.stopRoomSync();
      lanDiscovery.stopAdvertising();
    }
    return { success: true };
  });

  ipcMain.handle('room:update-settings', (event, settings) => {
    const state = roomState.toJSON();
    if (state.currentRoom) {
      socketClient.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.ROOM_UPDATE_SETTINGS, { 
        roomId: state.currentRoom, 
        settings 
      });
      return { success: true };
    }
    return { success: false, error: 'No active room' };
  });

  ipcMain.handle('room:kick-member', (event, { roomId, participantId }) => {
    socketClient.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.ROOM_KICK, { roomId, participantId });
    return { success: true };
  });

  ipcMain.handle('room:transfer-host', (event, { roomId, newHostId }) => {
    socketClient.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.ROOM_TRANSFER_HOST, { roomId, newHostId });
    return { success: true };
  });

  ipcMain.handle('host:return-decision', (event, { roomId, decision }) => {
    socketClient.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.HOST_RETURN_RESPONSE, { roomId, decision });
    return { success: true };
  });

  // --- Media Actions ---
  ipcMain.handle('media:load-file', async (event, { filePath, roomId }) => {
    try {
      const mediaInfo = await ffmpegService.getMediaInfo(filePath);
      
      if (!mediaInfo.isBrowserCompatible) {
        return { 
          success: false, 
          error: 'File is not browser compatible', 
          suggestedAction: 'convert',
          mediaInfo 
        };
      }

      const roomDir = fileManager.getRoomDir(roomId);
      const seedResult = await torrentManager.seedFile(filePath, roomDir);

      const settings = store.get('settings') || {};
      const threshold = settings.defaultPlaybackThreshold || 30;
      const parts = torrentManager.calculateParts(mediaInfo.fileSize, threshold);

      socketClient.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.MEDIA_FILE_READY, {
        roomId,
        fileName: require('path').basename(filePath),
        magnetURI: seedResult.magnetURI,
        parts,
        mediaInfo
      });

      return { 
        success: true, 
        magnetURI: seedResult.magnetURI, 
        parts, 
        mediaInfo 
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('media:accept-download', (event, { roomId }) => {
    socketClient.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.MEDIA_DOWNLOAD_ACCEPT, { roomId });
    return { success: true };
  });

  ipcMain.handle('media:request-quality', (event, { roomId, quality }) => {
    socketClient.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.MEDIA_QUALITY_REQUEST, { roomId, quality });
    return { success: true };
  });

  ipcMain.handle('media:start-download', async (event, { magnetURI, downloadPath, parts }) => {
    try {
      await torrentManager.downloadFile(magnetURI, downloadPath, parts, null, event.sender);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // --- Sync Actions ---
  ipcMain.handle('sync:play', (event, { position }) => {
    syncService.syncPlay(position);
    return { success: true };
  });

  ipcMain.handle('sync:pause', (event, { position }) => {
    syncService.syncPause(position);
    return { success: true };
  });

  ipcMain.handle('sync:seek', (event, { position }) => {
    syncService.syncSeek(position);
    return { success: true };
  });

  ipcMain.handle('sync:report-ready', () => {
    syncService.reportReady();
    return { success: true };
  });

  // --- LAN Actions ---
  ipcMain.handle('lan:enable', () => {
    lanDiscovery.enableLanMode();
    lanDiscovery.startDirectServer();
    return { success: true };
  });

  ipcMain.handle('lan:disable', () => {
    lanDiscovery.disableLanMode();
    return { success: true };
  });

  ipcMain.handle('lan:discover', async () => {
    const rooms = await lanDiscovery.discoverRooms();
    return { success: true, rooms };
  });

  ipcMain.handle('lan:get-local-ip', () => {
    return { success: true, ip: lanDiscovery.getLocalIp() };
  });

  // --- Chat Actions ---
  ipcMain.handle('chat:send', (event, { roomId, message }) => {
    const account = store.get('account');
    chatService.sendMessage(roomId, { sender: account.nickname, text: message });
    socketClient.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.CHAT_MESSAGE, { roomId, message });
    return { success: true };
  });

  ipcMain.handle('chat:get-log', () => {
    return { success: true, log: chatService.getChatLog() };
  });

  // --- Torrent Actions ---
  ipcMain.handle('torrent:seed-file', async (event, { filePath, roomId }) => {
    try {
      const roomDir = fileManager.getRoomDir(roomId);
      const result = await torrentManager.seedFile(filePath, roomDir);
      return { success: true, magnetURI: result.magnetURI, infoHash: result.infoHash };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('torrent:download-file', async (event, { magnetURI, downloadPath, parts }) => {
    try {
      await torrentManager.downloadFile(magnetURI, downloadPath, parts, null, event.sender);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('torrent:pause', (event, infoHash) => {
    torrentManager.pauseDownload(infoHash);
    return { success: true };
  });

  ipcMain.handle('torrent:resume', (event, infoHash) => {
    torrentManager.resumeDownload(infoHash);
    return { success: true };
  });

  ipcMain.handle('torrent:get-progress', (event, infoHash) => {
    return torrentManager.getDownloadProgress(infoHash);
  });

  ipcMain.handle('torrent:get-stats', () => {
    return torrentManager.getUploadStats();
  });

  // --- FFmpeg Actions ---
  ipcMain.handle('ffmpeg:get-media-info', async (event, filePath) => {
    try {
      const info = await ffmpegService.getMediaInfo(filePath);
      return { success: true, info };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ffmpeg:get-qualities', async (event, originalResolution) => {
    try {
      const qualities = ffmpegService.getAvailableQualities(originalResolution);
      return { success: true, qualities };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ffmpeg:convert-video', async (event, { inputPath, outputPath, targetResolution, roomDir }) => {
    try {
      const result = await ffmpegService.convertVideo(inputPath, outputPath, targetResolution, event.sender, roomDir);
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ffmpeg:convert-audio', async (event, { inputPath, outputPath, bitrate }) => {
    try {
      const result = await ffmpegService.convertAudio(inputPath, outputPath, bitrate, event.sender);
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ffmpeg:cancel', (event, jobId) => {
    const cancelled = ffmpegService.cancelConversion(jobId);
    return { success: true, cancelled };
  });

  ipcMain.handle('ffmpeg:queue-status', () => {
    return { success: true, status: ffmpegService.getQueueStatus() };
  });

  ipcMain.handle('ffmpeg:check-compatibility', async (event, filePath) => {
    try {
      const result = await ffmpegService.checkBrowserCompatibility(filePath);
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ffmpeg:remux', async (event, { inputPath, outputPath }) => {
    try {
      const result = await ffmpegService.remuxToMp4(inputPath, outputPath, event.sender);
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerIpcHandlers };