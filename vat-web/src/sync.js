/**
 * VAT Web - playback synchronization service.
 * Mirrors the desktop sync-service logic: time offset via round trip,
 * periodic sync, position reporting.
 */

import socketClient from './socket-client.js';
import 'shared/constants.js';

const VAT_CONSTANTS = window.VAT_CONSTANTS;

class SyncService {
  constructor() {
    this.timeOffset = 0;
    this.syncInterval = null;
    this.reportInterval = null;
  }

  /** Request server time and compute the offset. */
  syncTime() {
    return new Promise((resolve) => {
      const requestTime = Date.now();
      socketClient.once('time-sync-response', (data) => {
        const responseTime = Date.now();
        const roundTripTime = responseTime - requestTime;
        this.timeOffset = data.serverTime - (requestTime + roundTripTime / 2);
        if (roundTripTime > VAT_CONSTANTS.SYNC.HIGH_LATENCY_WARNING) {
          console.warn('[Sync] High latency:', roundTripTime, 'ms');
        }
        resolve(this.timeOffset);
      });
      socketClient.requestTimeSync(requestTime);
    });
  }

  /** Local time adjusted to server time. */
  getAdjustedTime() {
    return Date.now() + this.timeOffset;
  }

  syncPlay(position) { socketClient.sendSyncPlay(position); }
  syncPause(position) { socketClient.sendSyncPause(position); }
  syncSeek(position) { socketClient.sendSyncSeek(position); }
  reportReady() { socketClient.reportReady(); }
  reportProgress(percent, partIndex) { socketClient.reportProgress(percent, partIndex); }
  reportPosition(position) { socketClient.reportPosition(position); }

  /**
   * Start periodic time sync and position reporting.
   * @param {Function} getPositionFn
   */
  start(getPositionFn) {
    this.stop();
    this.syncTime();
    this.syncInterval = setInterval(() => this.syncTime(), VAT_CONSTANTS.SYNC.TIME_SYNC_INTERVAL);
    this.reportInterval = setInterval(() => {
      if (getPositionFn) this.reportPosition(getPositionFn());
    }, 5000);
  }

  stop() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    if (this.reportInterval) clearInterval(this.reportInterval);
    this.syncInterval = null;
    this.reportInterval = null;
    this.timeOffset = 0;
  }
}

export default new SyncService();