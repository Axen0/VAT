/**
 * VAT Web - browser media player.
 * Playback from a local object URL (File System Access API).
 * Supports MP4 (H.264) and WebM (VP8/VP9) only.
 */

class BrowserPlayer {
  constructor(videoElement) {
    this.video = videoElement;
    this.playbackUrl = null;
    this.duration = 0;
    this.isReady = false;
    this._listeners = new Map();
    this._setupEventListeners();
  }

  _setupEventListeners() {
    this.video.addEventListener('loadedmetadata', () => {
      this.duration = this.video.duration || 0;
      this.isReady = true;
      this._emit('ready', { duration: this.duration });
    });
    this.video.addEventListener('timeupdate', () => {
      this._emit('timeupdate', { position: this.video.currentTime });
    });
    this.video.addEventListener('play', () => this._emit('play', { position: this.video.currentTime }));
    this.video.addEventListener('pause', () => this._emit('pause', { position: this.video.currentTime }));
    this.video.addEventListener('ended', () => this._emit('ended', {}));
    this.video.addEventListener('waiting', () => this._emit('buffering', {}));
    this.video.addEventListener('playing', () => this._emit('playing', {}));
    this.video.addEventListener('error', () => this._emit('error', { error: this.video.error }));
  }

  /**
   * Check whether the browser can play the given container/codec.
   * @param {string} filename
   * @param {string} codec
   * @returns {boolean}
   */
  checkFormatSupport(filename, codec) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    let mime = '';
    if (ext === 'mp4') mime = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
    else if (ext === 'webm') mime = 'video/webm; codecs="vp8, vorbis"';
    else if (ext === 'mp3') mime = 'audio/mpeg';
    else if (ext === 'aac') mime = 'audio/aac';
    else if (ext === 'ogg') mime = 'audio/ogg; codecs="vorbis"';

    if (!mime) return false;
    const support = this.video.canPlayType(mime);
    return support === 'probably' || support === 'maybe';
  }

  /**
   * Load a local object URL into the player.
   * @param {string} url
   * @returns {Promise<boolean>}
   */
  async load(url) {
    if (this.playbackUrl && this.playbackUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.playbackUrl);
    }
    this.playbackUrl = url;
    this.isReady = false;
    this.video.src = url;
    this.video.load();
    return true;
  }

  async play(position = null) {
    if (position !== null && position !== undefined) this.video.currentTime = position;
    try {
      await this.video.play();
    } catch (err) {
      console.error('[Player] Play failed:', err);
    }
  }

  pause(position = null) {
    if (position !== null && position !== undefined) this.video.currentTime = position;
    this.video.pause();
  }

  seek(position) {
    if (this.isReady && position >= 0 && (position <= this.duration || this.duration === 0)) {
      this.video.currentTime = position;
    }
  }

  getPosition() { return this.video.currentTime || 0; }
  getDuration() { return this.duration || 0; }

  on(event, callback) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(callback);
  }

  _emit(event, data) {
    (this._listeners.get(event) || []).forEach((cb) => {
      try { cb(data); } catch (err) { console.error('[Player] Listener error:', err); }
    });
  }

  destroy() {
    if (this.playbackUrl && this.playbackUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.playbackUrl);
    }
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this._listeners.clear();
  }
}

export default BrowserPlayer;