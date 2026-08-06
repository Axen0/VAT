import { App, AppState, showToast } from '../app.js';
import { IPC } from '../ipc-bridge.js';
import { HomeScreen } from './home.js'; // Добавлен импорт для исправления ошибки

export const RoomScreen = {
  init() {
    document.getElementById('load-video-btn').addEventListener('click', async () => {
      const result = await IPC.selectVideo();
      if (result && result.path) {
        await this.startDownload(result.path, 'video');
      }
    });

    document.getElementById('load-audio-btn').addEventListener('click', async () => {
      try {
        const result = await IPC.selectAudio();
        if (result && result.path) {
          await this.startDownload(result.path, 'audio');
        }
      } catch (error) {
        console.warn('Audio selection not fully supported yet:', error);
        showToast('Загрузка аудио временно недоступна');
      }
    });

    document.getElementById('ready-to-watch-btn').addEventListener('click', () => {
      this.startPlayback();
    });

    document.getElementById('player-play-pause').addEventListener('click', () => {
      const isPlaying = window.playerComponent.isPlaying();
      if (isPlaying) {
        IPC.syncPause(window.playerComponent.getCurrentTime());
      } else {
        IPC.syncPlay(window.playerComponent.getCurrentTime());
      }
    });

    document.getElementById('player-seek-back').addEventListener('click', () => {
      const newPos = Math.max(0, window.playerComponent.getCurrentTime() - 10);
      IPC.syncSeek(newPos);
    });

    document.getElementById('player-seek-forward').addEventListener('click', () => {
      const newPos = window.playerComponent.getCurrentTime() + 10;
      IPC.syncSeek(newPos);
    });

    document.getElementById('player-seek-slider').addEventListener('change', (e) => {
      const duration = window.playerComponent.getDuration();
      const newPos = (e.target.value / 100) * duration;
      IPC.syncSeek(newPos);
    });

    document.getElementById('player-volume').addEventListener('input', (e) => {
      window.playerComponent.setVolume(e.target.value);
    });

    document.getElementById('player-fullscreen').addEventListener('click', () => {
      const container = document.getElementById('media-player-container');
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        container.requestFullscreen().catch(err => console.error(err));
      }
    });

    document.getElementById('toggle-lan-btn').addEventListener('click', async () => {
      AppState.isLanEnabled = !AppState.isLanEnabled;
      const btn = document.getElementById('toggle-lan-btn');
      
      if (AppState.isLanEnabled) {
        await IPC.enableLan();
        btn.textContent = 'LAN режим: ВКЛ';
        const ipRes = await IPC.getLocalIp();
        if (ipRes.success) {
          document.getElementById('lan-ip-display').textContent = `IP: ${ipRes.ip}`;
        }
      } else {
        await IPC.disableLan();
        btn.textContent = 'LAN режим: ВЫКЛ';
        document.getElementById('lan-ip-display').textContent = '';
      }
    });

    document.getElementById('room-settings-btn').addEventListener('click', () => {
      document.getElementById('settings-modal').classList.remove('hidden');
    });

    document.getElementById('save-room-settings-btn').addEventListener('click', async () => {
      const settings = {
        playbackThreshold: parseInt(document.getElementById('modal-room-threshold').value),
        pauseOnMemberDisconnect: document.getElementById('modal-room-pause-disconnect').checked,
        anyoneCanControl: document.getElementById('modal-room-any-control').checked
      };
      await IPC.updateRoomSettings(settings);
      document.getElementById('settings-modal').classList.add('hidden');
      showToast('Настройки комнаты обновлены');
    });

    document.getElementById('cancel-room-settings-btn').addEventListener('click', () => {
      document.getElementById('settings-modal').classList.add('hidden');
    });

    document.getElementById('leave-room-btn').addEventListener('click', async () => {
      await IPC.leaveRoom();
      AppState.currentRoom = null;
      AppState.mediaState = 'none';
      App.showScreen('screen-home');
      HomeScreen.loadHistory(); // Теперь работает корректно
    });

    document.getElementById('toggle-chat-overlay-btn').addEventListener('click', () => {
      window.chatComponent.toggleOverlay();
    });

    // Copy room code button
    document.getElementById('copy-room-code-btn').addEventListener('click', () => {
      const roomCode = document.getElementById('room-code-display').textContent.replace('Код: ', '');
      if (roomCode) {
        navigator.clipboard.writeText(roomCode).then(() => {
          showToast('Код комнаты скопирован');
        }).catch(err => {
          console.error('Failed to copy:', err);
          showToast('Не удалось скопировать код');
        });
      }
    });
  },

  onEnter() {
    this.updateMediaUI();
    window.chatComponent.clear();
    // Display room code in the room screen
    if (AppState.currentRoom) {
      document.getElementById('room-code-display').textContent = `Код: ${AppState.currentRoom}`;
    }
    this.progressInterval = setInterval(() => this.checkProgress(), 1000);
  },

  updateMediaUI() {
    ['media-no-media-host', 'media-no-media-guest', 'media-downloading', 'media-player-container'].forEach(id => {
      document.getElementById(id).classList.add('hidden');
    });

    if (AppState.mediaState === 'none') {
      if (AppState.myRole === 'host') {
        document.getElementById('media-no-media-host').classList.remove('hidden');
      } else {
        document.getElementById('media-no-media-guest').classList.remove('hidden');
      }
    } else if (AppState.mediaState === 'downloading') {
      document.getElementById('media-downloading').classList.remove('hidden');
    } else if (AppState.mediaState === 'ready') {
      document.getElementById('media-player-container').classList.remove('hidden');
      window.playerComponent.init(document.getElementById('main-video'), document.getElementById('main-audio'));
      
      window.playerComponent.onTimeUpdate((time, duration) => {
        const slider = document.getElementById('player-seek-slider');
        if (!slider.matches(':active')) {
          slider.value = (time / duration) * 100;
        }
      });

      window.playerComponent.onBuffering(() => {
        document.getElementById('sync-status').textContent = 'Буферизация...';
      });
    }
  },

  async startDownload(filePath, type) {
    AppState.mediaState = 'downloading';
    this.updateMediaUI();
    
    try {
      const loadResult = await IPC.loadFile(filePath, AppState.currentRoom);
      if (!loadResult.success) {
        showToast(`Ошибка загрузки: ${loadResult.error}`);
        AppState.mediaState = 'none';
        this.updateMediaUI();
        return;
      }

      AppState.infoHash = loadResult.magnetURI;
      
      const downloadPath = (await IPC.getSettings()).defaultDownloadPath || '';
      await IPC.startDownload({
        magnetURI: loadResult.magnetURI,
        downloadPath: downloadPath,
        parts: loadResult.parts
      });

      document.getElementById('ready-to-watch-btn').disabled = true;
    } catch (error) {
      console.error('Download start error:', error);
      showToast('Ошибка начала загрузки');
    }
  },

  async checkProgress() {
    if (AppState.mediaState !== 'downloading' || !AppState.infoHash) return;

    const progress = await IPC.getTorrentProgress(AppState.infoHash);
    if (progress) {
      document.getElementById('download-progress').textContent = progress.progress.toFixed(1);
      document.getElementById('download-piece').textContent = progress.downloadedPieces || 0;
      document.getElementById('download-total').textContent = progress.totalPieces || 0;
      document.getElementById('download-speed').textContent = (progress.downloadSpeed / 1024 / 1024).toFixed(2);
      document.getElementById('download-peers').textContent = progress.numPeers || 0;
      document.getElementById('download-progress-bar').style.width = `${progress.progress}%`;

      if (progress.progress >= 5) { 
        document.getElementById('ready-to-watch-btn').disabled = false;
      }
    }
  },

  startPlayback() {
    AppState.mediaState = 'ready';
    this.updateMediaUI();
    IPC.reportReady();
    
    if (AppState.myRole === 'host') {
      IPC.syncPlay(0);
    }
  }
};