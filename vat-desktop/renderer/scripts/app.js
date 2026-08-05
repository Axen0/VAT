import { IPC } from './ipc-bridge.js';
import { HomeScreen } from './screens/home.js';
import { RoomScreen } from './screens/room.js';
import { SettingsScreen } from './screens/settings.js';

export const AppState = {
  currentScreen: 'screen-home',
  currentRoom: null,
  myRole: 'guest',
  mediaState: 'none',
  playbackState: 'stopped',
  isLanEnabled: false,
  myNickname: 'Гость'
};

export function showToast(message) {
  const toast = document.getElementById('toast-notification');
  if (!toast) return;
  
  toast.textContent = message;
  toast.classList.remove('hidden');
  
  void toast.offsetWidth; 
  toast.classList.add('visible');

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 1500);
}

export function applyTheme(theme, accentColor) {
  const root = document.documentElement;
  if (theme === 'light') {
    root.classList.add('theme-light');
  } else {
    root.classList.remove('theme-light');
  }
  if (accentColor) {
    root.style.setProperty('--accent-color', accentColor);
    root.style.setProperty('--accent-hover', adjustColor(accentColor, -20));
  }
}

function adjustColor(color, amount) {
  return '#' + color.replace(/^#/, '').replace(/../g, c => ('0' + Math.min(255, Math.max(0, parseInt(c, 16) + amount)).toString(16)).substr(-2));
}

export const App = {
  async init() {
    console.log('App initializing...');
    
    const account = await IPC.getAccount();
    if (account && account.nickname) {
      AppState.myNickname = account.nickname;
    }

    const settings = await IPC.getSettings();
    if (settings) {
      applyTheme(settings.theme || 'dark', settings.accentColor || '#007acc');
    }

    window.playerComponent = new (await import('./components/player.js')).VideoPlayer();
    window.chatComponent = new (await import('./components/chat.js')).ChatComponent();
    window.participantsComponent = new (await import('./components/participants.js')).ParticipantsComponent();

    IPC.on('sync:play-command', (data) => {
      if (AppState.mediaState === 'ready' && window.playerComponent) {
        window.playerComponent.play(data.position);
        document.getElementById('sync-status').textContent = 'Синхронизировано';
      }
    });

    IPC.on('sync:pause-command', () => {
      if (AppState.mediaState === 'ready' && window.playerComponent) {
        window.playerComponent.pause();
        document.getElementById('sync-status').textContent = 'Синхронизировано';
      }
    });

    IPC.on('sync:seek-command', (data) => {
      if (AppState.mediaState === 'ready' && window.playerComponent) {
        window.playerComponent.seek(data.position);
        document.getElementById('sync-status').textContent = 'Синхронизировано';
      }
    });

    IPC.on('room:participant-update', (data) => {
      if (window.participantsComponent) window.participantsComponent.updateList(data);
    });

    IPC.on('chat:message-receive', (data) => {
      if (window.chatComponent) window.chatComponent.addMessage(data);
    });

    IPC.on('media:slow-member-alert', (data) => {
      if (window.participantsComponent) window.participantsComponent.showSlowMemberAlert(data);
    });

    IPC.on('room:participant-disconnected', (data) => {
      if (window.participantsComponent) window.participantsComponent.showDisconnectAlert(data);
    });

    IPC.on('host:return-question', (data) => {
      App.showModal('Запрос управления', `Вернуть управление участнику ${data.nickname}?`, [
        { text: 'Да', action: () => { IPC.invoke('host:return-decision', { roomId: AppState.currentRoom, decision: true }); App.hideModal(); } },
        { text: 'Нет', class: 'danger', action: () => { IPC.invoke('host:return-decision', { roomId: AppState.currentRoom, decision: false }); App.hideModal(); } }
      ]);
    });

    HomeScreen.init();
    RoomScreen.init();
    SettingsScreen.init();

    App.showScreen('screen-home');
  },

  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active');
      AppState.currentScreen = screenId;
    }
  },

  showModal(title, message, buttons) {
    document.getElementById('alert-modal-title').textContent = title;
    document.getElementById('alert-modal-message').textContent = message;
    const actionsContainer = document.getElementById('alert-modal-actions');
    actionsContainer.innerHTML = '';
    
    buttons.forEach(btn => {
      const buttonEl = document.createElement('button');
      buttonEl.textContent = btn.text;
      if (btn.class) buttonEl.classList.add(btn.class);
      buttonEl.onclick = btn.action;
      actionsContainer.appendChild(buttonEl);
    });
    
    document.getElementById('alert-modal').classList.remove('hidden');
  },

  hideModal() {
    document.getElementById('alert-modal').classList.add('hidden');
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());