/**
 * VAT Web - file writer abstraction.
 * Modes:
 *  - fsaa: File System Access API (Chrome/Edge), random-access writes to disk.
 *  - streamsaver: StreamSaver.js fallback (Firefox/Safari), sequential writes.
 *  - indexeddb: in-memory chunk accumulation with final blob assembly (last resort).
 */

import streamSaver from 'streamsaver';

/**
 * Detect browser capabilities for disk writing.
 * @returns {{fileSystemAccess: boolean, streamSaver: boolean}}
 */
export function detectCapabilities() {
  return {
    fileSystemAccess: typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function',
    streamSaver: typeof streamSaver !== 'undefined' && typeof streamSaver.createWriteStream === 'function',
  };
}

export class FileWriter {
  constructor(mode) {
    this.mode = mode;
    this.filename = '';
    this.totalSize = 0;
    this.bytesWritten = 0;
    this.closed = false;
    this.aborted = false;
    this._playbackUrl = null;

    // fsaa state
    this.handle = null;
    this.writable = null;

    // streamsaver state (sequential flush with out-of-order buffer)
    this.writer = null;
    this.nextOffset = 0;
    this.pending = new Map();

    // indexeddb state
    this.chunks = new Map();
  }

  /**
   * Write a chunk at the given byte offset.
   * @param {Uint8Array|ArrayBuffer} chunk
   * @param {number} offset
   */
  async write(chunk, offset) {
    if (this.closed || this.aborted) throw new Error('FileWriter is not active');
    const data = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);

    if (this.mode === 'fsaa') {
      await this.writable.write({ type: 'write', position: offset, data });
      this.bytesWritten += data.byteLength;
      return;
    }

    if (this.mode === 'streamsaver') {
      this.pending.set(offset, data);
      await this._flushSequential();
      return;
    }

    this.chunks.set(offset, data);
    this.bytesWritten += data.byteLength;
  }

  // Write contiguous chunks to the sequential stream as they become available
  async _flushSequential() {
    while (this.pending.has(this.nextOffset)) {
      const data = this.pending.get(this.nextOffset);
      this.pending.delete(this.nextOffset);
      await this.writer.write(data);
      this.bytesWritten += data.byteLength;
      this.nextOffset += data.byteLength;
    }
  }

  /**
   * Finalize the file and return a playback URL or identifier.
   * @returns {Promise<string>}
   */
  async close() {
    if (this.closed) return this._playbackUrl;
    this.closed = true;

    if (this.mode === 'fsaa') {
      await this.writable.close();
      const file = await this.handle.getFile();
      this._playbackUrl = URL.createObjectURL(file);
      return this._playbackUrl;
    }

    if (this.mode === 'streamsaver') {
      await this._flushSequential();
      await this.writer.close();
      // Browser cannot open a saved file programmatically
      return 'downloads://' + this.filename;
    }

    const offsets = Array.from(this.chunks.keys()).sort((a, b) => a - b);
    const parts = offsets.map((o) => this.chunks.get(o));
    const blob = new Blob(parts);
    this.chunks.clear();
    this._playbackUrl = URL.createObjectURL(blob);
    return this._playbackUrl;
  }

  /** Abort writing and release resources. */
  async abort() {
    this.aborted = true;
    try {
      if (this.mode === 'fsaa' && this.writable) await this.writable.abort();
      if (this.mode === 'streamsaver' && this.writer) await this.writer.abort();
    } catch (err) {
      // ignore abort errors
    }
    this.pending.clear();
    this.chunks.clear();
  }

  /**
   * Read back bytes from disk (used for seeding in fsaa mode).
   * @param {number} offset
   * @param {number} length
   * @returns {Promise<Uint8Array>}
   */
  async read(offset, length) {
    if (this.mode !== 'fsaa') throw new Error('Read not supported in mode: ' + this.mode);
    const file = await this.handle.getFile();
    const slice = file.slice(offset, offset + length);
    return new Uint8Array(await slice.arrayBuffer());
  }
}

/**
 * Create a file writer using the best available technology.
 * @param {string} filename
 * @param {number} size
 * @returns {Promise<FileWriter>}
 */
export async function createFileWriter(filename, size) {
  const caps = detectCapabilities();

  if (caps.fileSystemAccess) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: filename });
      const writable = await handle.createWritable();
      const writer = new FileWriter('fsaa');
      writer.handle = handle;
      writer.writable = writable;
      writer.filename = filename;
      writer.totalSize = size;
      return writer;
    } catch (err) {
      if (err && err.name === 'AbortError') throw new Error('Пользователь отменил сохранение файла');
      console.warn('[FileWriter] FSAA failed, falling back:', err);
    }
  }

  if (caps.streamSaver) {
    const fileStream = streamSaver.createWriteStream(filename, { size });
    const writer = new FileWriter('streamsaver');
    writer.writer = fileStream.getWriter();
    writer.filename = filename;
    writer.totalSize = size;
    return writer;
  }

  const writer = new FileWriter('indexeddb');
  writer.filename = filename;
  writer.totalSize = size;
  return writer;
}

/**
 * Whether the returned URL means the file was saved to Downloads
 * and must be opened manually by the user.
 * @param {string} url
 * @returns {boolean}
 */
export function requiresManualOpen(url) {
  return typeof url === 'string' && url.startsWith('downloads://');
}