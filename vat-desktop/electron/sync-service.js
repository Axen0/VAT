const socketClient = require('./socket-client');
const SOCKET_EVENTS = require('../../shared/events');

class SyncService {
  constructor() {
    this.timeOffset = 0;
    this.positionReportInterval = null;
    this.syncInterval = null;
  }

  async syncTime() {
    return new Promise((resolve) => {
      const requestTime = Date.now();
      
      socketClient.once(SOCKET_EVENTS.SERVER_TO_CLIENT.TIME_SYNC_RESPONSE, (data) => {
        const responseTime = Date.now();
        const roundTripTime = responseTime - requestTime;
        this.timeOffset = data.serverTime - (requestTime + roundTripTime / 2);
        console.log(`[SyncService] Time synced. Offset: ${this.timeOffset}ms`);
        resolve(this.timeOffset);
      });

      socketClient.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.TIME_SYNC_REQUEST, { clientTime: requestTime });
    });
  }

  getAdjustedTime() {
    return Date.now() + this.timeOffset;
  }

  syncPlay(position) {
    socketClient.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.SYNC_PLAY, {
      position,
      clientTime: this.getAdjustedTime()
    });
    this.startPositionReporting();
  }

  syncPause(position) {
    socketClient.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.SYNC_PAUSE, {
      position,
      clientTime: this.getAdjustedTime()
    });
    this.stopPositionReporting();
  }

  syncSeek(position) {
    socketClient.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.SYNC_SEEK, {
      position,
      clientTime: this.getAdjustedTime()
    });
  }

  reportReady() {
    socketClient.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.SYNC_READY);
  }

  reportProgress(percent, partIndex) {
    socketClient.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.MEDIA_PROGRESS_UPDATE, {
      percent,
      partIndex,
      clientTime: this.getAdjustedTime()
    });
  }

  startPositionReporting() {
    this.stopPositionReporting();
    this.positionReportInterval = setInterval(() => {
      // Renderer will call reportPosition explicitly, or we can trigger an event here
      // For now, this method just keeps the interval alive if needed by specific logic
    }, 5000);

    // Start periodic time sync every 30 seconds
    this.syncInterval = setInterval(() => {
      this.syncTime();
    }, 30000);
  }

  stopPositionReporting() {
    if (this.positionReportInterval) {
      clearInterval(this.positionReportInterval);
      this.positionReportInterval = null;
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  startRoomSync() {
    this.syncTime();
    this.startPositionReporting();
  }

  stopRoomSync() {
    this.stopPositionReporting();
    this.timeOffset = 0;
  }
}

module.exports = new SyncService();