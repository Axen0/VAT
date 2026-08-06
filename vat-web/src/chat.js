/**
 * VAT Web - chat service.
 * Local history with sanitization and length limits.
 * Messages are added ONLY from the server broadcast (no optimistic add),
 * which prevents duplicates.
 */

import socketClient from './socket-client.js';
import 'shared/constants.js';

const VAT_CONSTANTS = window.VAT_CONSTANTS;

class ChatService {
  constructor() {
    this.messages = [];
    this.myUserId = null;
    this.myNickname = null;
  }

  /**
   * Set current user info for proper message rendering
   * @param {string} userId 
   * @param {string} nickname 
   */
  setCurrentUser(userId, nickname) {
    this.myUserId = userId;
    this.myNickname = nickname;
  }

  /**
   * Send a chat message. The message appears in the local history
   * when the server broadcast echoes it back.
   * @param {string} message
   * @param {string} senderId
   * @param {string} senderNickname
   * @returns {boolean}
   */
  sendMessage(message, senderId, senderNickname) {
    if (!message) return false;
    const cleaned = message.replace(/<[^>]*>/g, '').slice(0, VAT_CONSTANTS.CHAT.MAX_MESSAGE_LENGTH).trim();
    if (!cleaned) return false;

    // Send to server - server will broadcast back to all including sender
    socketClient.sendChatMessage(cleaned, senderId, senderNickname);
    return true;
  }

  /** Handle an incoming message from the server. */
  handleMessage(data) {
    const text = String(data.message || '').replace(/<[^>]*>/g, '');
    if (!text) return;

    // Skip if we already have this exact message (deduplication)
    const duplicate = this.messages.find(m => 
      m.senderId === data.senderId && 
      m.message === text &&
      Math.abs(m.timestamp - (data.timestamp || Date.now())) < 1000
    );
    if (duplicate) return;

    this.addMessage({
      senderId: data.senderId || null,
      // Desktop clients do not send nicknames; fall back to a readable label
      senderNickname: data.senderNickname || 'Хост',
      message: text,
      timestamp: data.timestamp || Date.now(),
    });
  }

  addMessage(message) {
    this.messages.push(message);
    if (this.messages.length > VAT_CONSTANTS.CHAT.MAX_HISTORY) {
      this.messages = this.messages.slice(-VAT_CONSTANTS.CHAT.MAX_HISTORY);
    }
  }

  getMessages() { return this.messages; }
  clear() { this.messages = []; }

  formatTime(timestamp) {
    const d = new Date(timestamp);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
}

export default new ChatService();