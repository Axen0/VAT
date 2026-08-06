/**
 * VAT Web - UI manager.
 * Login screen and room screen (guest only, no LAN, no Bluetooth,
 * no room creation). All texts in Russian.
 */

import socketClient from './socket-client.js';
import torrentClient from './torrent-client.js';
import syncService from './sync.js';
import chatService from './chat.js';
import BrowserPlayer from './player.js';
import { detectCapabilities, requiresManualOpen } from './file-writer.js';
import 'shared/constants.js';

const VAT_CONSTANTS = window.VAT_CONSTANTS;

class UIManager {
  constructor() {
    this.app = document.getElementById('app');
    this.modalRoot = document.getElementById('modal-root');
    this.player = null;
    this.currentScreen = 'login';
    this.userId = null;
    this.nickname = null;
    this.roomState = null;
    this.participants = new Map();
    this.currentMedia = null;
    this.isDownloading = false;
    this.downloadComplete = false;
    this.pendingQuality = null;
    this.lastProgressReport = 0;

    this._loadUserData();
    this._checkBrowserSupport();
  }

  _loadUserData() {
    this.userId = localStorage.getItem('vat_user_id');
    if (!this.userId) {
      this.userId = this._generateUUID();
      localStorage.setItem('vat_user_id', this.userId);
    }
    this.nickname = localStorage.getItem('vat_nickname') || '';
    if (!this.nickname) {
      this.nickname = 'User_' + this.userId.slice(0, 4);
      localStorage.setItem('vat_nickname', this.nickname);
    }
    // Set current user in chat service
    chatService.setCurrentUser(this.userId, this.nickname);
  }

  _generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  _checkBrowserSupport() {
    if (detectCapabilities().fileSystemAccess) return;
    const warning = document.createElement('div');
    warning.id = 'browser-warning';
    warning.textContent = 'Для полной поддержки используйте Chrome или Edge. В других браузерах файл будет сохранён в папку Загрузки.';
    document.body.insertBefore(warning, document.body.firstChild);
  }

  /** Parse /join/{roomId} from the URL. */
  checkUrlForRoomCode() {
    const match = window.location.pathname.match(/\/join\/([a-zA-Z0-9]{8})/);
    return match ? match[1] : null;
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text == null ? '' : text);
    return div.innerHTML;
  }

  // =============================================================
  // Login screen
  // =============================================================

  renderLogin(prefillRoomCode) {
    this.currentScreen = 'login';
    this.app.innerHTML = `
      <div class="login-screen">
        <div class="login-card">
          <h1>VAT</h1>
          <p>Совместный просмотр видео и аудио</p>
          <div class="form-group">
            <label for="nickname">Ваш никнейм</label>
            <input type="text" id="nickname" maxlength="20" value="${this._escapeHtml(this.nickname)}">
          </div>
          <div class="form-group">
            <label for="room-code">Код комнаты</label>
            <input type="text" id="room-code" maxlength="8" placeholder="abc12345" value="${this._escapeHtml(prefillRoomCode || '')}">
          </div>
          <div class="form-group">
            <label for="room-password">Пароль (если требуется)</label>
            <input type="password" id="room-password" placeholder="Необязательно">
          </div>
          <button class="btn btn-primary" id="join-btn">Войти в комнату</button>
          <div id="login-error" class="error-message hidden"></div>
        </div>
      </div>
    `;

    const joinBtn = document.getElementById('join-btn');
    const nicknameInput = document.getElementById('nickname');
    const roomCodeInput = document.getElementById('room-code');
    const passwordInput = document.getElementById('room-password');
    const errorDiv = document.getElementById('login-error');

    nicknameInput.addEventListener('input', () => {
      const value = nicknameInput.value.trim();
      if (value) {
        this.nickname = value;
        localStorage.setItem('vat_nickname', value);
        chatService.setCurrentUser(this.userId, value);
      }
    });

    const submit = async () => {
      const nickname = nicknameInput.value.trim();
      const roomCode = roomCodeInput.value.trim().toLowerCase();
      const password = passwordInput.value;

      if (!nickname) return this._showError(errorDiv, 'Введите никнейм');
      if (roomCode.length !== VAT_CONSTANTS.ROOM.ID_LENGTH) {
        return this._showError(errorDiv, 'Код комнаты должен содержать ' + VAT_CONSTANTS.ROOM.ID_LENGTH + ' символов');
      }

      joinBtn.disabled = true;
      joinBtn.textContent = 'Подключение...';
      errorDiv.classList.add('hidden');

      try {
        await this._joinRoom(roomCode, nickname, password);
      } catch (err) {
        this._showError(errorDiv, err.message);
        joinBtn.disabled = false;
        joinBtn.textContent = 'Войти в комнату';
      }
    };

    joinBtn.addEventListener('click', submit);
    [nicknameInput, roomCodeInput, passwordInput].forEach((input) => {
      input.addEventListener('keypress', (e) => { if (e.key === 'Enter') submit(); });
    });

    if (prefillRoomCode) roomCodeInput.focus();
    else nicknameInput.focus();
  }

  _showError(element, message) {
    element.textContent = message;
    element.classList.remove('hidden');
  }

  async _joinRoom(roomId, nickname, password) {
    const response = await socketClient.joinRoom({
      roomId,
      nickname,
      password,
      participantId: this.userId,
    });

    if (!response.success) throw new Error(response.error || 'Не удалось войти в комнату');

    this.roomState = response.roomState;
    this.participants = new Map();
    this.participants.set(this.userId, {
      id: this.userId,
      nickname,
      role: 'member',
      isOnline: true,
      downloadProgress: 0,
    });
    this.renderRoom();
  }

  // =============================================================
  // Room screen
  // =============================================================

  renderRoom() {
    this.currentScreen = 'room';
    this.app.innerHTML = `
      <div class="room-screen">
        <div class="room-header">
          <div style="display:flex;align-items:center;">
            <h2>Комната</h2>
            <span class="room-code" id="room-code-display">${this._escapeHtml(this.roomState.id)}</span>
            <button class="icon-btn" id="copy-link-btn" title="Скопировать ссылку">Копировать</button>
          </div>
          <button class="btn btn-secondary" id="leave-btn">Выйти</button>
        </div>
        <div class="room-content">
          <div class="media-area">
            <video id="video-player" controls></video>
            <div class="download-panel" id="download-panel">
              <div class="download-info">
                <span id="download-filename">Ожидание файла...</span>
                <span id="download-percent"></span>
              </div>
              <div class="download-progress"><div class="download-progress-fill" id="download-progress-fill"></div></div>
              <div class="download-stats">
                <span id="download-speed"></span>
                <span id="download-peers"></span>
                <span id="download-part"></span>
              </div>
              <button class="btn btn-primary hidden" id="download-btn" style="margin-top:10px;">Скачать файл</button>
            </div>
            <div class="controls">
              <div class="controls-row">
                <button class="icon-btn" id="play-btn" title="Play">▶</button>
                <button class="icon-btn" id="pause-btn" title="Pause">⏸</button>
                <div id="progress-bar"><div id="progress-fill"></div></div>
                <span class="time-display" id="time-display">00:00 / 00:00</span>
              </div>
            </div>
          </div>
          <div class="sidebar">
            <div class="sidebar-tabs">
              <button class="tab-btn active" data-tab="participants">Участники</button>
              <button class="tab-btn" data-tab="chat">Чат</button>
            </div>
            <div class="tab-content" id="participants-tab">
              <ul class="participants-list" id="participants-list"></ul>
            </div>
            <div class="tab-content hidden" id="chat-tab">
              <div class="chat-container">
                <div class="chat-messages" id="chat-messages"></div>
                <div class="chat-input-area">
                  <input type="text" id="chat-input" maxlength="${VAT_CONSTANTS.CHAT.MAX_MESSAGE_LENGTH}" placeholder="Сообщение...">
                  <button id="chat-send-btn">Отпр.</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this._setupRoomHandlers();
    this._initializePlayer();
    this._renderParticipants();
  }

  _setupRoomHandlers() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        document.getElementById('participants-tab').classList.toggle('hidden', tab !== 'participants');
        document.getElementById('chat-tab').classList.toggle('hidden', tab !== 'chat');
      });
    });

    document.getElementById('copy-link-btn').addEventListener('click', () => {
      const link = window.location.origin + '/join/' + this.roomState.id;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(link).then(() => this._showStatus('Ссылка скопирована', 'success'));
      }
    });

    document.getElementById('leave-btn').addEventListener('click', () => {
      if (confirm('Выйти из комнаты?')) this._leaveRoom();
    });

    document.getElementById('play-btn').addEventListener('click', () => {
      if (this.player && this.player.isReady) syncService.syncPlay(this.player.getPosition());
    });
    document.getElementById('pause-btn').addEventListener('click', () => {
      if (this.player && this.player.isReady) syncService.syncPause(this.player.getPosition());
    });
    document.getElementById('progress-bar').addEventListener('click', (e) => {
      if (!this.player || !this.player.isReady || !this.player.getDuration()) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      syncService.syncSeek(percent * this.player.getDuration());
    });

    const chatInput = document.getElementById('chat-input');
    const sendChat = () => {
      const msg = chatInput.value.trim();
      if (msg && chatService.sendMessage(msg, this.userId, this.nickname)) {
        chatInput.value = '';
        // Do NOT render here - wait for server broadcast
      }
    };
    document.getElementById('chat-send-btn').addEventListener('click', sendChat);
    chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat(); });

    // Socket events
    socketClient.on('room-closed', (data) => {
      this._showModal('Комната закрыта', data.reason || 'Хост вышел', () => this._leaveRoom());
    });
    socketClient.on('kicked', () => {
      this._showModal('Вас исключили', 'Хост исключил вас из комнаты', () => this._leaveRoom());
    });
    socketClient.on('participant-update', (p) => {
      if (p && p.id) { this.participants.set(p.id, p); this._renderParticipants(); }
    });
    socketClient.on('participant-disconnected', (data) => {
      const p = this.participants.get(data.participantId);
      if (p) { p.isOnline = false; this._renderParticipants(); }
    });
    socketClient.on('host-changed', (data) => {
      this._showStatus(data.isTemp ? 'Временный хост: ' + data.newHostNickname : 'Новый хост: ' + data.newHostNickname, 'warning');
      const host = this.participants.get(data.newHostId);
      if (host) { host.role = data.isTemp ? 'temp-host' : 'host'; host.nickname = data.newHostNickname; }
      else this.participants.set(data.newHostId, { id: data.newHostId, nickname: data.newHostNickname, role: data.isTemp ? 'temp-host' : 'host', isOnline: true, downloadProgress: 100 });
      this._renderParticipants();
    });
    socketClient.on('settings-updated', (settings) => {
      if (this.roomState) this.roomState.settings = settings;
    });
    socketClient.on('chat-message', (data) => {
      chatService.handleMessage(data);
      this._renderChatMessages();
    });
    socketClient.on('download-available', (data) => this._handleDownloadAvailable(data));
    socketClient.on('quality-converting', (data) => {
      this._showStatus('Конвертация ' + data.quality + '...', 'warning');
    });
    socketClient.on('quality-ready', (data) => {
      this._showStatus('Качество ' + data.quality + ' готово', 'success');
      if (this.pendingQuality === data.quality) {
        this.pendingQuality = null;
        this._startDownload(data.magnetURI, this._qualityFilename(data.quality), 0);
      }
    });
    socketClient.on('play-command', (data) => this._executeSyncCommand('play', data));
    socketClient.on('pause-command', (data) => this._executeSyncCommand('pause', data));
    socketClient.on('seek-command', (data) => this._executeSyncCommand('seek', data));
    socketClient.on('disconnected', () => this._showStatus('Переподключение...', 'error'));
  }

  _initializePlayer() {
    const videoElement = document.getElementById('video-player');
    this.player = new BrowserPlayer(videoElement);

    this.player.on('timeupdate', () => {
      this._updateTimeDisplay();
      this._updateProgressBar();
    });
    this.player.on('ready', () => {
      syncService.reportReady();
      syncService.start(() => this.player.getPosition());
    });
    this.player.on('ended', async () => {
      // The object URL snapshot may end before the download completes:
      // refresh the URL from disk and continue.
      if (this.isDownloading) {
        const url = await torrentClient.refreshPlaybackUrl();
        if (url) {
          const pos = this.player.getPosition();
          await this.player.load(url);
          this.player.play(pos);
        }
      }
    });
  }

  _qualityFilename(quality) {
    const base = this.currentMedia ? this.currentMedia.filename.replace(/\.[^.]+$/, '') : 'video';
    return base + '_' + quality + '.mp4';
  }

  _handleDownloadAvailable(data) {
    this.currentMedia = data;
    document.getElementById('download-filename').textContent = data.filename + ' (' + this._formatBytes(data.fileSize) + ')';

    const supported = this.player.checkFormatSupport(data.filename, data.originalCodec);
    const downloadBtn = document.getElementById('download-btn');

    if (!supported) {
      this._showModal(
        'Формат не поддерживается',
        'Ваш браузер не поддерживает формат этого файла. Запросить конвертацию в MP4 у хоста?',
        () => {
          this.pendingQuality = '720p';
          socketClient.requestQuality('720p');
          this._showStatus('Запрос на конвертацию отправлен', 'warning');
        },
        'Запросить конвертацию',
        'Отмена'
      );
      return;
    }

    downloadBtn.classList.remove('hidden');
    downloadBtn.textContent = 'Скачать файл';
    downloadBtn.onclick = () => {
      downloadBtn.classList.add('hidden');
      socketClient.acceptDownload('original');
      this._startDownload(data.magnetURI, data.filename, data.fileSize);
    };
  }

  async _startDownload(magnetURI, filename, fileSize) {
    this.isDownloading = true;
    this.downloadComplete = false;
    this._showStatus('Выберите папку для сохранения файла', 'warning');

    try {
      const url = await torrentClient.downloadFile(
        magnetURI,
        this.currentMedia ? this.currentMedia.parts : [],
        filename,
        fileSize,
        (progress) => this._onDownloadProgress(progress)
      );

      this.isDownloading = false;
      this.downloadComplete = true;

      if (requiresManualOpen(url)) {
        this._showStatus('Файл сохранён в папке Загрузки. Откройте его вручную.', 'warning', 10000);
        return;
      }

      const loaded = await this.player.load(url);
      if (loaded) this._showStatus('Файл готов к воспроизведению', 'success');
    } catch (err) {
      this.isDownloading = false;
      this._showStatus('Ошибка загрузки: ' + err.message, 'error', 10000);
    }
  }

  _onDownloadProgress(progress) {
    if (progress.warning === 'no-peers') {
      this._showStatus(progress.message, 'warning');
      return;
    }
    if (progress.event === 'part-completed') {
      socketClient.reportPartCompleted(progress.partIndex);
      return;
    }

    document.getElementById('download-percent').textContent = progress.overallPercent + '%';
    document.getElementById('download-progress-fill').style.width = progress.overallPercent + '%';
    document.getElementById('download-speed').textContent = this._formatSpeed(progress.downloadSpeed);
    document.getElementById('download-peers').textContent = progress.peers + ' peers';
    if (this.currentMedia && this.currentMedia.parts) {
      document.getElementById('download-part').textContent =
        'Часть ' + Math.min(progress.currentPart + 1, this.currentMedia.parts.length) + '/' + this.currentMedia.parts.length;
    }

    const me = this.participants.get(this.userId);
    if (me) me.downloadProgress = progress.overallPercent;

    const now = Date.now();
    if (now - this.lastProgressReport >= VAT_CONSTANTS.DOWNLOAD.PROGRESS_REPORT_INTERVAL) {
      this.lastProgressReport = now;
      syncService.reportProgress(progress.overallPercent, progress.currentPart);
    }
  }

  _executeSyncCommand(type, data) {
    const delay = Math.max(0, data.executeAt - syncService.getAdjustedTime());
    setTimeout(() => {
      if (!this.player) return;
      if (type === 'play') this.player.play(data.position);
      else if (type === 'pause') this.player.pause(data.position);
      else if (type === 'seek') this.player.seek(data.position);
    }, delay);
  }

  _updateTimeDisplay() {
    const el = document.getElementById('time-display');
    if (el) el.textContent = this._formatTime(this.player.getPosition()) + ' / ' + this._formatTime(this.player.getDuration());
  }

  _updateProgressBar() {
    const el = document.getElementById('progress-fill');
    if (el && this.player.getDuration()) {
      el.style.width = (this.player.getPosition() / this.player.getDuration()) * 100 + '%';
    }
  }

  _renderParticipants() {
    const list = document.getElementById('participants-list');
    if (!list) return;
    const items = Array.from(this.participants.values()).map((p) => {
      const roleBadge = p.role === 'host' ? '<span class="role-badge">Хост</span>'
        : p.role === 'temp-host' ? '<span class="role-badge temp">Вр. хост</span>' : '';
      const you = p.id === this.userId ? ' (вы)' : '';
      return '<li class="participant ' + (p.isOnline ? 'online' : 'offline') + '">' +
        '<span>' + this._escapeHtml(p.nickname) + you + '</span>' + roleBadge +
        '<span class="participant-progress">' + (p.downloadProgress || 0) + '%</span></li>';
    });
    list.innerHTML = items.join('');
  }

  _renderChatMessages() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    container.innerHTML = chatService.getMessages().map((m) => {
      // Determine if this is our own message
      const isMe = m.senderId === this.userId;
      const displayName = isMe ? this.nickname : m.senderNickname;
      return '<div class="chat-message">' +
        '<span class="sender">' + this._escapeHtml(displayName) + ':</span>' +
        '<span>' + this._escapeHtml(m.message) + '</span>' +
        '<span class="time">' + chatService.formatTime(m.timestamp) + '</span></div>';
    }).join('');
    container.scrollTop = container.scrollHeight;
  }

  _leaveRoom() {
    socketClient.leaveRoom();
    syncService.stop();
    torrentClient.destroy();
    if (this.player) this.player.destroy();
    this.player = null;
    this.roomState = null;
    this.currentMedia = null;
    this.participants.clear();
    chatService.clear();
    this.isDownloading = false;
    this.downloadComplete = false;
    this.renderLogin();
  }

  _showStatus(message, type, duration) {
    const existing = document.querySelector('.status-overlay');
    if (existing) existing.remove();
    const status = document.createElement('div');
    status.className = 'status-overlay ' + (type || 'info');
    status.textContent = message;
    document.body.appendChild(status);
    if (duration !== 0) setTimeout(() => status.remove(), duration || 3000);
  }

  _showModal(title, message, onConfirm, confirmText, cancelText) {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML =
      '<div class="modal"><h3>' + this._escapeHtml(title) + '</h3>' +
      '<p>' + this._escapeHtml(message) + '</p>' +
      '<div class="modal-actions">' +
      '<button class="btn btn-secondary" id="modal-cancel">' + this._escapeHtml(cancelText || 'Отмена') + '</button>' +
      '<button class="btn btn-primary" style="width:auto;" id="modal-confirm">' + this._escapeHtml(confirmText || 'OK') + '</button>' +
      '</div></div>';
    this.modalRoot.appendChild(modal);
    modal.querySelector('#modal-cancel').addEventListener('click', () => modal.remove());
    modal.querySelector('#modal-confirm').addEventListener('click', () => {
      modal.remove();
      if (onConfirm) onConfirm();
    });
  }

  _formatBytes(bytes) {
    if (!bytes) return '0 Б';
    const units = ['Б', 'КБ', 'МБ', 'ГБ'];
    let i = 0;
    let value = bytes;
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
    return value.toFixed(1) + ' ' + units[i];
  }

  _formatSpeed(bytesPerSec) {
    if (!bytesPerSec) return '0 Б/с';
    if (bytesPerSec < 1024) return bytesPerSec.toFixed(0) + ' Б/с';
    if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(1) + ' КБ/с';
    return (bytesPerSec / 1024 / 1024).toFixed(2) + ' МБ/с';
  }

  _formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
  }
}

export default new UIManager();