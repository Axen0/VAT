const { app, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const VAT_CONSTANTS = require('../../shared/constants');

class FileManager {
  constructor() {
    this.userDataPath = path.join(app.getPath('userData'), 'VAT');
    this.roomsPath = path.join(this.userDataPath, 'rooms');
    
    // Strictly derive filters from shared constants to ensure 100% compliance
    this.videoExtensions = VAT_CONSTANTS.FFMPEG.SUPPORTED_INPUT.filter(ext => 
      ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(ext)
    );
    this.audioExtensions = VAT_CONSTANTS.FFMPEG.SUPPORTED_INPUT.filter(ext => 
      ['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a'].includes(ext)
    );
  }

  async ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
  }

  async selectFile(type) {
    const filters = type === 'audio' 
      ? [{ name: 'Audio', extensions: this.audioExtensions }]
      : [{ name: 'Video', extensions: this.videoExtensions }];

    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters
    });
    
    if (result.canceled || result.filePaths.length === 0) return null;
    
    const filePath = result.filePaths[0];
    const stats = await fs.stat(filePath);
    return {
      path: filePath,
      name: path.basename(filePath),
      size: stats.size
    };
  }

  async selectDirectory() {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  }

  getRoomDir(roomId) {
    return path.join(this.roomsPath, roomId);
  }

  getVideoDir(roomId) {
    return path.join(this.getRoomDir(roomId), 'video');
  }

  getAudioDir(roomId) {
    return path.join(this.getRoomDir(roomId), 'audio');
  }

  async saveChatLog(roomId, messages) {
    const roomDir = this.getRoomDir(roomId);
    await this.ensureDir(roomDir);
    const chatPath = path.join(roomDir, 'chat.json');
    await fs.writeFile(chatPath, JSON.stringify(messages, null, 2), 'utf-8');
  }

  async saveManifest(roomId, data) {
    const roomDir = this.getRoomDir(roomId);
    await this.ensureDir(roomDir);
    const manifestPath = path.join(roomDir, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async readManifest(roomId) {
    const manifestPath = path.join(this.getRoomDir(roomId), 'manifest.json');
    try {
      const data = await fs.readFile(manifestPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  async getFileMeta(filePath) {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      name: path.basename(filePath),
      extension: path.extname(filePath).toLowerCase().slice(1)
    };
  }

  async copyFileToRoomDir(srcPath, roomId, type) {
    // Architectural decision: Host streams directly from the original path 
    // to save disk space and time. No copying occurs.
    return srcPath;
  }

  async validateFilePath(filePath) {
    try {
      await fs.access(filePath, fs.constants.R_OK);
      return true;
    } catch (error) {
      return false;
    }
  }

  getDownloadPath(roomId, filename, userChosenDir) {
    return path.join(userChosenDir || app.getPath('downloads'), filename);
  }
}

module.exports = new FileManager();