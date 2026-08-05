// Participants Component - manages the list of room participants
import { App, AppState } from '../app.js';
import { IPC } from '../ipc-bridge.js';

export class ParticipantsComponent {
  constructor() {
    this.listContainer = document.getElementById('participants-list');
  }

  updateList(participants) {
    this.listContainer.innerHTML = '';
    
    (participants || []).forEach(p => {
      const div = document.createElement('div');
      div.className = 'participant-item';
      
      const isHost = p.role === 'host';
      const isMe = p.nickname === AppState.myNickname;
      const progress = p.downloadProgress || 0;
      
      div.innerHTML = `
        <div class="participant-info">
          <span>${this.escapeHtml(p.nickname)} ${isMe ? '(Вы)' : ''}</span>
          <span class="participant-role">${isHost ? 'Хост' : 'Гость'} | Готовность: ${p.ready ? '✅' : '❌'}</span>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
        </div>
        ${isHost && !isMe ? `
          <div style="display: flex; gap: 5px;">
            <button class="icon-btn small-btn" title="Исключить" onclick="alert('Функция исключения в разработке')">✕</button>
          </div>
        ` : ''}
      `;
      
      this.listContainer.appendChild(div);
    });
  }

  showSlowMemberAlert(participant) {
    App.showModal('Медленный участник', `Участник ${participant.nickname} имеет прогресс загрузки всего ${participant.progress}%.`, [
      { text: 'Начать без него', action: () => App.hideModal() },
      { text: 'Ждать', action: () => App.hideModal() },
      { text: 'Исключить', class: 'danger', action: () => App.hideModal() }
    ]);
  }

  showDisconnectAlert(participant) {
    App.showModal('Участник отключился', `${participant.nickname} потерял соединение.`, [
      { text: 'Продолжить', action: () => App.hideModal() },
      { text: 'Ждать переподключения', action: () => App.hideModal() }
    ]);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}