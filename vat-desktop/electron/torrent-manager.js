const WebTorrent = require('webtorrent');
const path = require('path');
const fs = require('fs').promises;
const Store = require('electron-store');
const VAT_CONSTANTS = require('../../shared/constants');

class TorrentManager {
  constructor() {
    this.client = null;
    this.activeTorrents = new Map(); // infoHash -> { torrent, parts, currentPartIndex, progressInterval }
    this.store = new Store();
    this.initializeClient();
  }

  initializeClient() {
    const signalUrl = process.env.SIGNAL_SERVER_URL || 'http://127.0.0.1:3000';
    const trackerUrl = signalUrl.replace(/^http/, 'ws') + '/torrent-tracker';
    const settings = this.store.get('settings') || {};

    this.client = new WebTorrent({
      tracker: {
        announce: [trackerUrl],
      },
      maxConns: 55,
      downloadLimit: (settings.torrentDownloadLimit || 0) * 1024,
      uploadLimit: (settings.torrentUploadLimit || 0) * 1024,
    });

    this.client.on('error', (err) => {
      console.error('[TorrentManager] Global client error:', err);
    });
  }

  calculateParts(fileSize, thresholdPercent) {
    const partsCount = Math.floor(100 / thresholdPercent);
    const remainder = 100 % thresholdPercent;
    const parts = [];

    for (let i = 0; i < partsCount; i++) {
      parts.push({
        index: i,
        startPercent: i * thresholdPercent,
        endPercent: (i + 1) * thresholdPercent,
        startByte: Math.floor(fileSize * i * thresholdPercent / 100),
        endByte: Math.floor(fileSize * (i + 1) * thresholdPercent / 100) - 1,
        status: i === 0 ? 'active' : 'locked',
        pieceStart: 0,
        pieceEnd: 0
      });
    }

    if (remainder > 0) {
      parts.push({
        index: partsCount,
        startPercent: partsCount * thresholdPercent,
        endPercent: 100,
        startByte: Math.floor(fileSize * partsCount * thresholdPercent / 100),
        endByte: fileSize - 1,
        status: 'locked',
        pieceStart: 0,
        pieceEnd: 0
      });
    }

    return parts;
  }

  getPieceRange(torrent, startPercent, endPercent) {
    const fileSize = torrent.length;
    const pieceLength = torrent.pieceLength;
    const totalPieces = torrent.pieces.length;

    const startByte = Math.floor(fileSize * startPercent / 100);
    const endByte = Math.floor(fileSize * endPercent / 100);

    const pieceStart = Math.min(Math.floor(startByte / pieceLength), totalPieces - 1);
    const pieceEnd = Math.min(Math.floor(endByte / pieceLength), totalPieces - 1);

    return { pieceStart, pieceEnd };
  }

  async seedFile(filePath, roomDir) {
    const safePath = path.resolve(filePath).replace(/\\/g, '/');
    
    try {
      const stats = await fs.stat(safePath);
      if (stats.size === 0) {
        throw new Error('File is empty (0 bytes)');
      }
      console.log('[TorrentManager] File validated:', { size: stats.size, path: safePath });
    } catch (error) {
      throw new Error(`File validation failed: ${error.message}. Path: ${safePath}`);
    }

    await fs.mkdir(roomDir, { recursive: true });

    const signalUrl = process.env.SIGNAL_SERVER_URL || 'http://127.0.0.1:3000';
    const trackerUrl = signalUrl.replace(/^http/, 'ws') + '/torrent-tracker';

    return new Promise((resolve, reject) => {
      try {
        console.log('[TorrentManager] Attempting to seed path:', safePath);
        
        const torrent = this.client.seed(safePath, { 
          name: path.basename(safePath),
          announce: [trackerUrl]
        });

        torrent.on('error', (err) => {
          console.error('[TorrentManager] Torrent seed error event:', err);
          reject(err);
        });

        torrent.on('ready', () => {
          console.log('[TorrentManager] Torrent ready, infoHash:', torrent.infoHash);
          this.activeTorrents.set(torrent.infoHash, {
            torrent,
            parts: [],
            currentPartIndex: 0,
            progressInterval: null,
            isSeeding: true
          });

          if (torrent.torrentFile) {
            // CHANGED: Use original filename without extension for the .torrent file
            const originalFileName = path.basename(safePath, path.extname(safePath));
            const torrentFilePath = path.join(roomDir, `${originalFileName}.torrent`);
            const fileBuffer = Buffer.isBuffer(torrent.torrentFile) 
              ? torrent.torrentFile 
              : Buffer.from(torrent.torrentFile);
            
            fs.writeFile(torrentFilePath, fileBuffer).catch(err => {
              console.error('[TorrentManager] Failed to save .torrent file:', err);
            });
          }

          resolve({
            magnetURI: torrent.magnetURI,
            infoHash: torrent.infoHash
          });
        });
      } catch (err) {
        console.error('[TorrentManager] Synchronous seed error:', err);
        reject(err);
      }
    });
  }

  async downloadFile(magnetURI, downloadPath, parts, onProgress, eventSender) {
    return new Promise((resolve, reject) => {
      let noPeersTimer = null;
      
      try {
        const torrent = this.client.add(magnetURI, { path: path.dirname(downloadPath) });

        torrent.on('error', (err) => {
          if (noPeersTimer) clearTimeout(noPeersTimer);
          if (err.message.includes('ENOSPC') || err.message.includes('no space left')) {
            if (eventSender) {
              eventSender.send('torrent:alert', { infoHash: torrent.infoHash, type: 'disk-full', message: 'Disk is full.' });
            }
            reject(new Error('Disk full'));
          } else {
            reject(err);
          }
        });

        torrent.on('metadata', () => {
          const targetFileName = path.basename(downloadPath);
          if (torrent.files.length > 0 && torrent.files[0].name !== targetFileName) {
            torrent.files[0].rename(targetFileName);
          }

          const enrichedParts = parts.map(part => {
            const range = this.getPieceRange(torrent, part.startPercent, part.endPercent);
            return { ...part, pieceStart: range.pieceStart, pieceEnd: range.pieceEnd };
          });

          this.activeTorrents.set(torrent.infoHash, {
            torrent,
            parts: enrichedParts,
            currentPartIndex: 0,
            progressInterval: null,
            isSeeding: false
          });

          this.activatePart(torrent, enrichedParts, 0);

          torrent.on('piece', (index) => {
            const state = this.activeTorrents.get(torrent.infoHash);
            if (!state) return;

            const currentPart = state.parts[state.currentPartIndex];
            if (currentPart && index >= currentPart.pieceStart && index <= currentPart.pieceEnd) {
              if (this.isPartComplete(torrent, currentPart)) {
                console.log(`[TorrentManager] Part ${state.currentPartIndex} completed.`);
                currentPart.status = 'completed';
                
                if (eventSender) {
                  eventSender.send('torrent:part-completed', { infoHash: torrent.infoHash, partIndex: state.currentPartIndex });
                }

                state.currentPartIndex++;
                if (state.currentPartIndex < state.parts.length) {
                  state.parts[state.currentPartIndex].status = 'active';
                  this.activatePart(torrent, state.parts, state.currentPartIndex);
                } else {
                  clearInterval(state.progressInterval);
                  clearTimeout(noPeersTimer);
                  resolve();
                }
              }
            }
          });

          const interval = setInterval(() => {
            const state = this.activeTorrents.get(torrent.infoHash);
            if (!state) {
              clearInterval(interval);
              return;
            }

            const currentPart = state.parts[state.currentPartIndex];
            let downloadedPieces = 0;
            for (let i = currentPart.pieceStart; i <= currentPart.pieceEnd; i++) {
              if (torrent.pieces[i] === null) downloadedPieces++;
            }
            const totalPiecesInPart = currentPart.pieceEnd - currentPart.pieceStart + 1;
            const partPercent = Math.min(100, Math.round((downloadedPieces / totalPiecesInPart) * 100));

            const progressData = {
              infoHash: torrent.infoHash,
              overallPercent: Math.round(torrent.progress * 100),
              currentPart: state.currentPartIndex,
              partPercent: partPercent,
              downloadSpeed: torrent.downloadSpeed,
              uploadSpeed: torrent.uploadSpeed,
              peers: torrent.numPeers
            };

            if (eventSender) {
              eventSender.send('torrent:progress', progressData);
            }
          }, 1000);

          this.activeTorrents.get(torrent.infoHash).progressInterval = interval;

          noPeersTimer = setTimeout(() => {
            if (torrent.numPeers === 0 && torrent.downloaded === 0) {
              if (eventSender) {
                eventSender.send('torrent:alert', { infoHash: torrent.infoHash, type: 'no-peers', message: 'No peers found for 60s.' });
              }
            }
          }, VAT_CONSTANTS.DOWNLOAD.NO_PEERS_TIMEOUT);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  activatePart(torrent, parts, partIndex) {
    console.log(`[TorrentManager] Activating part ${partIndex}`);
    parts.forEach(p => {
      torrent.deselect(p.pieceStart, p.pieceEnd, false);
    });
    const currentPart = parts[partIndex];
    torrent.select(currentPart.pieceStart, currentPart.pieceEnd, VAT_CONSTANTS.TORRENT.PIECE_PRIORITY_HIGH);
  }

  isPartComplete(torrent, part) {
    for (let i = part.pieceStart; i <= part.pieceEnd; i++) {
      if (torrent.pieces[i] !== null) {
        return false;
      }
    }
    return true;
  }

  pauseDownload(infoHash) {
    const state = this.activeTorrents.get(infoHash);
    if (state && state.torrent) state.torrent.pause();
  }

  resumeDownload(infoHash) {
    const state = this.activeTorrents.get(infoHash);
    if (state && state.torrent) state.torrent.resume();
  }

  getDownloadProgress(infoHash) {
    const state = this.activeTorrents.get(infoHash);
    if (!state || !state.torrent) return null;
    return {
      infoHash,
      percent: Math.round(state.torrent.progress * 100),
      speed: state.torrent.downloadSpeed,
      peers: state.torrent.numPeers,
      currentPart: state.currentPartIndex
    };
  }

  getAvailablePeers(infoHash) {
    const state = this.activeTorrents.get(infoHash);
    if (!state || !state.torrent) return [];
    return state.torrent.wires.map(wire => ({
      remoteAddress: wire.remoteAddress,
      remotePort: wire.remotePort,
      downloadSpeed: wire.downloadSpeed(),
      uploadSpeed: wire.uploadSpeed()
    }));
  }

  getUploadStats() {
    return {
      speed: this.client ? this.client.uploadSpeed : 0,
      uploaded: this.client ? this.client.uploaded : 0
    };
  }

  destroy() {
    this.activeTorrents.forEach(state => {
      if (state.progressInterval) clearInterval(state.progressInterval);
    });
    this.activeTorrents.clear();
    if (this.client) this.client.destroy();
  }
}

module.exports = new TorrentManager();