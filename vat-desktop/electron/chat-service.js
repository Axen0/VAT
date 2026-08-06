const fs = require('fs').promises;
const path = require('path');
const fileManager = require('./file-manager');

class ChatService {
  constructor() {
    this.chatLog = [];
    this.saveInterval = null;
    this.currentRoomId = null;
  }

  sendMessage(roomId, message) {
    this.currentRoomId = roomId;
    
    const chatMessage = {
      id: Date.now().toString(),
      sender: message.sender,
      text: message.text,
      timestamp: Date.now()
    };
    
    this.chatLog.push(chatMessage);
    this._notifyRenderer('chat:message-receive', chatMessage);
    
    // Auto-save every 5 minutes
    if (!this.saveInterval) {
      this.saveInterval = setInterval(() => this.saveChatLog(roomId), 5 * 60 * 1000);
    }
  }

  receiveMessage(message) {
    this.chatLog.push(message);
    this._notifyRenderer('chat:message-receive', message);
  }

  getChatLog() {
    return this.chatLog;
  }

  async saveChatLog(roomId) {
    if (this.chatLog.length === 0) {
      console.log('[ChatService] No messages to save');
      return;
    }
    
    try {
      const roomDir = fileManager.getRoomDir(roomId);
      console.log('[ChatService] Saving chat to:', roomDir);
      
      // Create directory if it doesn't exist
      await fs.mkdir(roomDir, { recursive: true });
      
      const chatPath = path.join(roomDir, 'chat_history.json');
      await fs.writeFile(chatPath, JSON.stringify(this.chatLog, null, 2));
      console.log('[ChatService] Chat log saved successfully to:', chatPath);
    } catch (error) {
      console.error('[ChatService] Failed to save chat log:', error);
    }
  }

  clearLog() {
    this.chatLog = [];
    this.currentRoomId = null;
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
  }

  _notifyRenderer(event, data) {
    const { BrowserWindow } = require('electron');
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      win.webContents.send(event, data);
    });
  }
}

module.exports = new ChatService();