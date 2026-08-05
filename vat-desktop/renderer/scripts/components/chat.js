import { AppState } from '../app.js';
import { IPC } from '../ipc-bridge.js';

export class ChatComponent {
  constructor() {
    this.messagesContainer = document.getElementById('chat-messages');
    this.input = document.getElementById('chat-input');
    this.sendBtn = document.getElementById('chat-send-btn');
    
    this.overlayContainer = document.getElementById('chat-overlay-messages');
    this.overlayInput = document.getElementById('chat-overlay-input');
    this.overlaySendBtn = document.getElementById('chat-overlay-send-btn');
    this.overlay = document.getElementById('chat-overlay');

    this.setupListeners();
  }

  setupListeners() {
    const sendAction = () => {
      const text = this.input.value.trim();
      if (text && AppState.currentRoom) {
        IPC.sendChat(AppState.currentRoom, text);
        this.input.value = '';
      }
    };

    this.sendBtn.addEventListener('click', sendAction);
    this.input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendAction();
    });

    const overlaySendAction = () => {
      const text = this.overlayInput.value.trim();
      if (text && AppState.currentRoom) {
        IPC.sendChat(AppState.currentRoom, text);
        this.overlayInput.value = '';
      }
    };

    this.overlaySendBtn.addEventListener('click', overlaySendAction);
    this.overlayInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') overlaySendAction();
    });
  }

  addMessage(msg) {
    // Get author from message, fallback to 'Unknown'
    const author = msg.sender || msg.author || 'Unknown';
    
    // Skip messages from 'Unknown'
    if (author === 'Unknown') {
      return;
    }

    const text = msg.text || msg.message || '';
    const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Prevent duplicate rendering
    const lastMsg = this.messagesContainer.lastElementChild;
    if (lastMsg && 
        lastMsg.dataset.author === author && 
        lastMsg.dataset.time === time && 
        lastMsg.dataset.text === this.escapeHtml(text)) {
      return;
    }

    const isMe = author === AppState.myNickname;

    const html = `
      <div class="chat-message ${isMe ? 'me' : ''}" data-time="${time}" data-author="${this.escapeHtml(author)}" data-text="${this.escapeHtml(text)}">
        <span class="author">${this.escapeHtml(author)}</span>
        <span class="time">[${time}]</span>
        <div>${this.escapeHtml(text)}</div>
      </div>
    `;

    this.messagesContainer.insertAdjacentHTML('beforeend', html);
    this.overlayContainer.insertAdjacentHTML('beforeend', html);
    
    this.scrollToBottom();
  }

  scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    this.overlayContainer.scrollTop = this.overlayContainer.scrollHeight;
  }

  toggleOverlay() {
    this.overlay.classList.toggle('hidden');
  }

  clear() {
    this.messagesContainer.innerHTML = '';
    this.overlayContainer.innerHTML = '';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}