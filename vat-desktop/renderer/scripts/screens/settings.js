import { App, AppState, showToast, applyTheme } from '../app.js';
import { IPC } from '../ipc-bridge.js';

export const SettingsScreen = {
  async init() {
    const settings = await IPC.getSettings();
    if (settings) {
      document.getElementById('setting-download-path').value = settings.defaultDownloadPath || 'Не выбрано';
      document.getElementById('setting-default-threshold').value = settings.defaultPlaybackThreshold || 30;
      document.getElementById('setting-upload-limit').value = settings.torrentUploadLimit || 0;
      document.getElementById('setting-download-limit').value = settings.torrentDownloadLimit || 0;
      
      document.getElementById('setting-theme').value = settings.theme || 'dark';
      document.getElementById('setting-accent-color').value = settings.accentColor || '#007acc';
      document.getElementById('accent-color-hex').textContent = settings.accentColor || '#007acc';
    }

    // Обновление hex при изменении цвета
    document.getElementById('setting-accent-color').addEventListener('input', (e) => {
      document.getElementById('accent-color-hex').textContent = e.target.value;
    });

    // Кнопка "Применить" для акцентного цвета
    document.getElementById('apply-accent-color-btn').addEventListener('click', async () => {
      const theme = document.getElementById('setting-theme').value;
      const accentColor = document.getElementById('setting-accent-color').value;
      
      // Применяем тему и цвет
      applyTheme(theme, accentColor);
      
      // Сохраняем только тему и цвет
      const currentSettings = await IPC.getSettings();
      await IPC.updateSettings({
        ...currentSettings,
        theme: theme,
        accentColor: accentColor
      });
      
      showToast('Цвет и тема применены');
    });

    // Смена темы через выпадающий список
    document.getElementById('setting-theme').addEventListener('change', (e) => {
      const accentColor = document.getElementById('setting-accent-color').value;
      applyTheme(e.target.value, accentColor);
    });

    document.getElementById('save-settings-btn').addEventListener('click', async () => {
      const newSettings = {
        defaultDownloadPath: document.getElementById('setting-download-path').value === 'Не выбрано' ? '' : document.getElementById('setting-download-path').value,
        defaultPlaybackThreshold: parseInt(document.getElementById('setting-default-threshold').value),
        defaultPauseOnDisconnect: true,
        torrentUploadLimit: parseInt(document.getElementById('setting-upload-limit').value),
        torrentDownloadLimit: parseInt(document.getElementById('setting-download-limit').value),
        theme: document.getElementById('setting-theme').value,
        accentColor: document.getElementById('setting-accent-color').value
      };
      
      await IPC.updateSettings(newSettings);
      showToast('Настройки сохранены');
    });

    document.getElementById('clear-history-btn').addEventListener('click', async () => {
      if (confirm('Очистить всю историю загрузок и комнат?')) {
        await IPC.clearHistory();
        this.loadHistory();
        showToast('История очищена');
      }
    });

    document.getElementById('back-to-home-btn').addEventListener('click', () => {
      App.showScreen('screen-home');
    });

    // Выбор папки загрузки
    document.getElementById('setting-choose-path-btn').addEventListener('click', async () => {
      const result = await IPC.selectDirectory();
      // selectDirectory может возвращать объект с полем path или строку
      const path = result?.path || result;
      if (path) {
        document.getElementById('setting-download-path').value = path;
      }
    });

    this.loadHistory();
  },

  async loadHistory() {
    const history = await IPC.getDownloadHistory();
    const tbody = document.getElementById('download-history-body');
    tbody.innerHTML = '';

    (history || []).forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.filename || 'Unknown'}</td>
        <td>${item.fileSize ? (item.fileSize / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'}</td>
        <td>${item.downloadedAt ? new Date(item.downloadedAt).toLocaleDateString() : 'N/A'}</td>
        <td>${item.status || 'Completed'}</td>
      `;
      tbody.appendChild(tr);
    });
  }
};