import { App, AppState, showToast } from '../app.js';
import { IPC } from '../ipc-bridge.js';
import { RoomScreen } from './room.js';

export const HomeScreen = {
  init() {
    const nicknameInput = document.getElementById('nickname-input');
    const saveNicknameBtn = document.getElementById('save-nickname-btn');
    
    if (nicknameInput) nicknameInput.value = AppState.myNickname;
    
    saveNicknameBtn.addEventListener('click', async () => {
      const nick = nicknameInput.value.trim();
      if (nick) {
        await IPC.updateNickname(nick);
        AppState.myNickname = nick;
        showToast('Никнейм сохранен');
      }
    });

    // Показ формы создания комнаты
    document.getElementById('show-create-room-btn').addEventListener('click', () => {
      // Скрываем кнопки "Создать комнату" и "Настройки"
      document.getElementById('home-actions').classList.add('hidden');
      // Показываем форму создания комнаты
      document.getElementById('create-room-form').classList.remove('hidden');
      document.getElementById('room-link-container').classList.add('hidden');
    });

    // Отмена создания комнаты
    document.getElementById('cancel-create-room-btn').addEventListener('click', () => {
      // Скрываем форму
      document.getElementById('create-room-form').classList.add('hidden');
      // Показываем кнопки обратно
      document.getElementById('home-actions').classList.remove('hidden');
    });

    // Подтверждение создания комнаты
    document.getElementById('confirm-create-room-btn').addEventListener('click', async () => {
      const settings = {
        playbackThreshold: parseInt(document.getElementById('room-threshold').value) || 30,
        pauseOnMemberDisconnect: document.getElementById('room-pause-disconnect').checked,
        anyoneCanControl: !document.getElementById('room-host-only-control').checked,
        controlWhitelist: [],
        settingsEditorWhitelist: [],
        maxParticipants: 20
      };

      const result = await IPC.createRoom({ 
        password: document.getElementById('room-password').value || null, 
        settings 
      });

      if (result.success) {
        showToast('Комната создана');
        AppState.currentRoom = result.roomId;
        AppState.myRole = 'host';
        document.getElementById('room-link-input').value = result.link || `vat://${result.roomId}`;
        document.getElementById('room-link-container').classList.remove('hidden');
        
        setTimeout(() => {
          App.showScreen('screen-room');
          RoomScreen.onEnter();
        }, 1000);
      } else {
        showToast(`Ошибка: ${result.error}`);
      }
    });

    document.getElementById('copy-link-btn').addEventListener('click', () => {
      const input = document.getElementById('room-link-input');
      input.select();
      document.execCommand('copy');
      showToast('Ссылка скопирована');
    });

    document.getElementById('btn-open-settings').addEventListener('click', () => {
      App.showScreen('screen-settings');
    });

    document.getElementById('join-room-btn').addEventListener('click', async () => {
      const roomId = document.getElementById('join-room-input').value.trim();
      if (!roomId) return;

      const passwordInput = document.getElementById('join-password-input');
      const password = passwordInput.value.trim() || null;
      
      const result = await IPC.joinRoom({ roomId, password });
      
      if (result.success) {
        AppState.currentRoom = roomId;
        AppState.myRole = 'guest';
        passwordInput.value = ''; 
        passwordInput.classList.add('hidden');
        App.showScreen('screen-room');
        RoomScreen.onEnter();
      } else {
        if (result.error && result.error.toLowerCase().includes('password')) {
          passwordInput.classList.remove('hidden');
          passwordInput.focus();
        } else {
          showToast(`Ошибка подключения: ${result.error}`);
        }
      }
    });

    this.loadHistory();
  },

  async loadHistory() {
    const history = await IPC.getRoomHistory();
    const list = document.getElementById('room-history-list');
    list.innerHTML = '';
    
    (history || []).slice(0, 5).forEach(room => {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.textContent = `Комната: ${room.roomId} (${new Date(room.date).toLocaleDateString()})`;
      li.addEventListener('click', () => {
        document.getElementById('join-room-input').value = room.roomId;
        document.getElementById('join-room-btn').click();
      });
      list.appendChild(li);
    });
  }
};