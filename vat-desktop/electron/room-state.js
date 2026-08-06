const { EventEmitter } = require('events');

class RoomState extends EventEmitter {
  constructor() {
    super();
    this.reset();
  }

  reset() {
    this.currentRoom = null;
    this.role = null; // 'host' | 'guest'
    this.participants = new Map();
    this.media = null;
    this.playback = {
      state: 'idle',
      position: 0,
      lastSyncServerTime: 0
    };
    this.emit('state-changed', this.toJSON());
  }

  setRoom(roomId, role) {
    this.currentRoom = roomId;
    this.role = role;
    this.emit('state-changed', this.toJSON());
  }

  updateParticipant(participantId, data) {
    this.participants.set(participantId, { ...this.participants.get(participantId), ...data });
    this.emit('participants-updated', Array.from(this.participants.values()));
  }

  removeParticipant(participantId) {
    this.participants.delete(participantId);
    this.emit('participants-updated', Array.from(this.participants.values()));
  }

  setMedia(mediaData) {
    this.media = mediaData;
    this.emit('media-updated', this.media);
  }

  setPlayback(playbackData) {
    this.playback = { ...this.playback, ...playbackData };
    this.emit('playback-updated', this.playback);
  }

  toJSON() {
    return {
      currentRoom: this.currentRoom,
      role: this.role,
      participants: Array.from(this.participants.values()),
      media: this.media,
      playback: this.playback
    };
  }
}

module.exports = new RoomState();