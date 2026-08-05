// Media Player Component - handles video/audio playback
export class VideoPlayer {
  constructor() {
    this.videoElement = null;
    this.audioElement = null;
    this.activeElement = null;
    this.timeUpdateCallback = null;
    this.endedCallback = null;
    this.bufferingCallback = null;
  }

  init(videoEl, audioEl) {
    this.videoElement = videoEl;
    this.audioElement = audioEl;

    this.videoElement.addEventListener('timeupdate', () => this._onTimeUpdate());
    this.audioElement.addEventListener('timeupdate', () => this._onTimeUpdate());
    
    this.videoElement.addEventListener('ended', () => this.endedCallback && this.endedCallback());
    this.audioElement.addEventListener('ended', () => this.endedCallback && this.endedCallback());

    this.videoElement.addEventListener('waiting', () => this.bufferingCallback && this.bufferingCallback());
    this.audioElement.addEventListener('waiting', () => this.bufferingCallback && this.bufferingCallback());
  }

  loadFile(filePath, type = 'video') {
    // Electron allows file:// protocol for local files
    const fileUrl = 'file://' + filePath.replace(/\\/g, '/');
    
    if (type === 'video') {
      this.activeElement = this.videoElement;
      this.videoElement.classList.remove('hidden');
      this.audioElement.classList.add('hidden');
      this.audioElement.pause();
    } else {
      this.activeElement = this.audioElement;
      this.audioElement.classList.remove('hidden');
      this.videoElement.classList.add('hidden');
      this.videoElement.pause();
    }

    this.activeElement.src = fileUrl;
    this.activeElement.load();
  }

  play(position = 0) {
    if (this.activeElement) {
      this.activeElement.currentTime = position;
      this.activeElement.play().catch(e => console.error('Play failed:', e));
      document.getElementById('player-play-pause').textContent = '⏸';
    }
  }

  pause() {
    if (this.activeElement) {
      this.activeElement.pause();
      document.getElementById('player-play-pause').textContent = '▶';
    }
  }

  seek(position) {
    if (this.activeElement) {
      this.activeElement.currentTime = position;
    }
  }

  setVolume(volume) {
    if (this.activeElement) {
      this.activeElement.volume = volume;
    }
  }

  isPlaying() {
    return this.activeElement ? !this.activeElement.paused : false;
  }

  getCurrentTime() {
    return this.activeElement ? this.activeElement.currentTime : 0;
  }

  getDuration() {
    return this.activeElement ? this.activeElement.duration : 0;
  }

  onTimeUpdate(callback) {
    this.timeUpdateCallback = callback;
  }

  onEnded(callback) {
    this.endedCallback = callback;
  }

  onBuffering(callback) {
    this.bufferingCallback = callback;
  }

  _onTimeUpdate() {
    if (this.timeUpdateCallback && this.activeElement) {
      this.timeUpdateCallback(this.activeElement.currentTime, this.activeElement.duration);
    }
  }
}