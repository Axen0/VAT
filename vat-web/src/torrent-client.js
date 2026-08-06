/**
 * VAT Web - browser torrent client.
 * Uses the prebuilt standalone WebTorrent browser bundle loaded via script tag
 * to avoid bundler issues with Node.js polyfills.
 * Sequential part downloading via piece selection,
 * disk-backed chunk store (no full file in RAM).
 */

import 'shared/constants.js';
import { createFileWriter } from './file-writer.js';

const VAT_CONSTANTS = window.VAT_CONSTANTS;
const WebTorrent = window.WebTorrent;

/**
 * Build a WebTorrent chunk store class backed by a FileWriter.
 * WebTorrent instantiates it as new Store(pieceLength, { length }).
 * @param {import('./file-writer.js').FileWriter} writer
 */
function createChunkStoreClass(writer) {
  return class VatChunkStore {
    constructor(chunkLength, opts) {
      this.chunkLength = chunkLength;
      this.length = opts.length;
      this.writer = writer;
      this.closed = false;
    }

    put(index, buf, opts, cb) {
      if (typeof opts === 'function') { cb = opts; opts = {}; }
      const offset = index * this.chunkLength + (opts && opts.offset ? opts.offset : 0);
      this.writer.write(buf, offset)
        .then(() => cb(null))
        .catch((err) => cb(err));
    }

    get(index, opts, cb) {
      if (typeof opts === 'function') { cb = opts; opts = {}; }
      const offset = index * this.chunkLength + (opts && opts.offset ? opts.offset : 0);
      const length = opts && opts.length ? opts.length : Math.min(this.chunkLength, this.length - offset);
      this.writer.read(offset, length)
        .then((data) => cb(null, data))
        .catch((err) => cb(err));
    }

    clear(cb) { if (cb) cb(null); }
    close(cb) { this.closed = true; if (cb) cb(null); }
    destroy(cb) { this.closed = true; if (cb) cb(null); }
  };
}

class TorrentClient {
  constructor() {
    this.client = null;
    this.activeTorrents = new Map(); // infoHash -> state
  }

  /**
   * Initialize WebTorrent with the project tracker only (no public trackers).
   * @param {string} signalServerUrl
   */
  init(signalServerUrl) {
    if (!WebTorrent) {
      throw new Error('WebTorrent browser bundle is not available');
    }
    const trackerUrl = signalServerUrl.replace(/^http/, 'ws') + '/torrent-tracker';
    this.client = new WebTorrent({
      tracker: { announce: [trackerUrl] },
      maxConns: 30,
    });
    this.client.on('error', (err) => {
      console.error('[TorrentClient] Client error:', err);
    });
  }

  /**
   * Map percent range to WebTorrent piece range.
   */
  getPieceRange(torrent, startPercent, endPercent) {
    const fileSize = torrent.length;
    const pieceLength = torrent.pieceLength;
    const totalPieces = torrent.pieces.length;
    const startByte = Math.floor(fileSize * startPercent / 100);
    const endByte = Math.floor(fileSize * endPercent / 100);
    return {
      pieceStart: Math.min(Math.floor(startByte / pieceLength), totalPieces - 1),
      pieceEnd: Math.min(Math.floor(endByte / pieceLength), totalPieces - 1),
    };
  }

  /**
   * In WebTorrent a downloaded piece is set to null.
   */
  isPartComplete(torrent, part) {
    for (let i = part.pieceStart; i <= part.pieceEnd; i++) {
      if (torrent.pieces[i] !== null) return false;
    }
    return true;
  }

  /**
   * Strictly one active part at a time: deselect all, select current.
   */
  activatePart(torrent, parts, partIndex) {
    parts.forEach((p) => {
      try { torrent.deselect(p.pieceStart, p.pieceEnd, false); } catch (err) { /* ignore */ }
    });
    const current = parts[partIndex];
    if (current) {
      torrent.select(current.pieceStart, current.pieceEnd, VAT_CONSTANTS.TORRENT.PIECE_PRIORITY_HIGH);
    }
  }

  /**
   * Download a file sequentially and write it to disk.
   * @param {string} magnetURI
   * @param {Array} parts percent-based parts from the server
   * @param {string} filename
   * @param {number} fileSize
   * @param {Function} onProgress progress/warning callback
   * @returns {Promise<string>} playback URL or downloads:// identifier
   */
  async downloadFile(magnetURI, parts, filename, fileSize, onProgress) {
    const writer = await createFileWriter(filename, fileSize);
    const StoreClass = createChunkStoreClass(writer);

    return new Promise((resolve, reject) => {
      let settled = false;
      const state = {
        torrent: null,
        parts: [],
        currentPartIndex: 0,
        writer,
        progressInterval: null,
        noPeersTimer: null,
      };

      const fail = (err) => {
        if (state.progressInterval) clearInterval(state.progressInterval);
        if (state.noPeersTimer) clearTimeout(state.noPeersTimer);
        writer.abort();
        if (!settled) { settled = true; reject(err); }
      };

      let torrent;
      try {
        torrent = this.client.add(magnetURI, { store: StoreClass });
      } catch (err) {
        fail(err);
        return;
      }
      state.torrent = torrent;

      torrent.on('error', (err) => {
        console.error('[TorrentClient] Torrent error:', err);
        fail(err);
      });

      torrent.on('metadata', () => {
        const enriched = parts.map((p) => ({
          ...p,
          ...this.getPieceRange(torrent, p.startPercent, p.endPercent),
        }));
        state.parts = enriched;
        this.activeTorrents.set(torrent.infoHash, state);
        this.activatePart(torrent, enriched, 0);

        torrent.on('piece', (index) => {
          const current = state.parts[state.currentPartIndex];
          if (!current) return;
          if (index < current.pieceStart || index > current.pieceEnd) return;

          if (this.isPartComplete(torrent, current)) {
            current.status = 'completed';
            if (onProgress) onProgress({ event: 'part-completed', partIndex: state.currentPartIndex });

            state.currentPartIndex++;
            if (state.currentPartIndex < state.parts.length) {
              state.parts[state.currentPartIndex].status = 'active';
              this.activatePart(torrent, state.parts, state.currentPartIndex);
            }
          }
        });

        torrent.on('done', async () => {
          if (settled) return;
          settled = true;
          if (state.progressInterval) clearInterval(state.progressInterval);
          if (state.noPeersTimer) clearTimeout(state.noPeersTimer);
          try {
            const url = await writer.close();
            resolve(url);
          } catch (err) {
            reject(err);
          }
        });

        state.progressInterval = setInterval(() => {
          const current = state.parts[state.currentPartIndex];
          let partPercent = 100;
          if (current) {
            let downloaded = 0;
            for (let i = current.pieceStart; i <= current.pieceEnd; i++) {
              if (torrent.pieces[i] === null) downloaded++;
            }
            partPercent = Math.min(100, Math.round((downloaded / (current.pieceEnd - current.pieceStart + 1)) * 100));
          }
          if (onProgress) {
            onProgress({
              infoHash: torrent.infoHash,
              overallPercent: Math.round(torrent.progress * 100),
              currentPart: state.currentPartIndex,
              partPercent,
              downloadSpeed: torrent.downloadSpeed,
              uploadSpeed: torrent.uploadSpeed,
              peers: torrent.numPeers,
            });
          }
        }, 1000);

        state.noPeersTimer = setTimeout(() => {
          if (torrent.numPeers === 0 && torrent.downloaded === 0 && onProgress) {
            onProgress({ warning: 'no-peers', message: 'Нет источников. Ждём хоста...' });
          }
        }, VAT_CONSTANTS.DOWNLOAD.NO_PEERS_TIMEOUT);
      });
    });
  }

  /**
   * Refresh a playback object URL from the on-disk file (fsaa mode only).
   * @returns {Promise<string|null>}
   */
  async refreshPlaybackUrl() {
    for (const state of this.activeTorrents.values()) {
      if (state.writer && state.writer.mode === 'fsaa' && !state.writer.closed) {
        const file = await state.writer.handle.getFile();
        return URL.createObjectURL(file);
      }
    }
    return null;
  }

  /**
   * @param {string} infoHash
   * @returns {number}
   */
  getPeerCount(infoHash) {
    const state = this.activeTorrents.get(infoHash);
    return state && state.torrent ? state.torrent.numPeers : 0;
  }

  /** Destroy client and clean up all torrents. */
  destroy() {
    this.activeTorrents.forEach((state) => {
      if (state.progressInterval) clearInterval(state.progressInterval);
      if (state.noPeersTimer) clearTimeout(state.noPeersTimer);
      if (state.writer) state.writer.abort();
    });
    this.activeTorrents.clear();
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
  }
}

export default new TorrentClient();