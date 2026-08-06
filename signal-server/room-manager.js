const crypto = require('crypto');

/**
 * @typedef {Object} Room
 * @property {string} id
 * @property {string|null} passwordHash
 * @property {string} hostSocketId
 * @property {string} originalHostId
 * @property {string|null} tempHostId
 * @property {number} createdAt
 * @property {number} lastActivityAt
 * @property {number|null} hostDisconnectedAt
 * @property {NodeJS.Timeout|null} hostReturnTimer
 * @property {Object} settings
 * @property {Map<string, Participant>} participants
 * @property {Object|null} media
 * @property {Object} playback
 */

/**
 * @typedef {Object} Participant
 * @property {string} id
 * @property {string} socketId
 * @property {string} nickname
 * @property {'host'|'temp-host'|'member'} role
 * @property {boolean} isOnline
 * @property {number} downloadProgress
 * @property {number} currentPartIndex
 * @property {boolean} readyToPlay
 * @property {number} joinedAt
 */

class RoomManager {
  constructor() {
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
  }

  /**
   * @param {string} hostSocketId
   * @param {string} originalHostId
   * @param {string} nickname
   * @param {Object} settings
   * @param {string|null} passwordHash
   * @returns {string} roomId
   */
  createRoom(hostSocketId, originalHostId, nickname, settings, passwordHash = null) {
    const roomId = crypto.randomBytes(4).toString('hex');
    const now = Date.now();

    const newRoom = {
      id: roomId,
      passwordHash,
      hostSocketId,
      originalHostId,
      tempHostId: null,
      createdAt: now,
      lastActivityAt: now,
      hostDisconnectedAt: null,
      hostReturnTimer: null,
      settings: {
        playbackThreshold: settings.playbackThreshold ?? 30,
        pauseOnMemberDisconnect: settings.pauseOnMemberDisconnect ?? true,
        anyoneCanControl: settings.anyoneCanControl ?? true,
        controlWhitelist: settings.controlWhitelist ?? [],
        settingsEditorWhitelist: settings.settingsEditorWhitelist ?? [],
        maxParticipants: settings.maxParticipants ?? 20,
      },
      participants: new Map(),
      media: null,
      playback: {
        state: 'idle',
        position: 0,
        lastSyncServerTime: now,
      },
    };

    const hostParticipant = {
      id: originalHostId,
      socketId: hostSocketId,
      nickname,
      role: 'host',
      isOnline: true,
      downloadProgress: 100, // Host has the file
      currentPartIndex: 0,
      readyToPlay: false,
      joinedAt: now,
    };

    newRoom.participants.set(originalHostId, hostParticipant);
    this.rooms.set(roomId, newRoom);
    
    this.log(`Room created: ${roomId}`);
    return roomId;
  }

  /**
   * @param {string} roomId
   * @param {Object} participantData
   * @returns {{success: boolean, room?: Room, error?: string}}
   */
  joinRoom(roomId, participantData) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (room.participants.size >= room.settings.maxParticipants) {
      return { success: false, error: 'Room is full' };
    }

    const { id: participantId, socketId, nickname, password } = participantData;
    const existingParticipant = room.participants.get(participantId);

    if (existingParticipant) {
      // Reconnection
      existingParticipant.socketId = socketId;
      existingParticipant.isOnline = true;
      
      // If original host returns
      if (participantId === room.originalHostId) {
        this.cancelHostReturnTimer(room);
        existingParticipant.role = 'host';
        room.hostSocketId = socketId;
        room.tempHostId = null;
        room.hostDisconnectedAt = null;
        this.log(`Original host ${participantId} returned to room ${roomId}`);
      }
    } else {
      // New participant
      const newParticipant = {
        id: participantId,
        socketId,
        nickname,
        role: 'member',
        isOnline: true,
        downloadProgress: 0,
        currentPartIndex: 0,
        readyToPlay: false,
        joinedAt: Date.now(),
      };
      room.participants.set(participantId, newParticipant);
    }

    room.lastActivityAt = Date.now();
    return { success: true, room };
  }

  /**
   * @param {string} roomId
   * @param {string} socketId
   * @returns {{newHostId: string|null, shouldClose: boolean, room?: Room}}
   */
  leaveRoom(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return { newHostId: null, shouldClose: true };

    let disconnectedParticipant = null;
    for (const [id, participant] of room.participants.entries()) {
      if (participant.socketId === socketId) {
        disconnectedParticipant = participant;
        participant.isOnline = false;
        break;
      }
    }

    if (!disconnectedParticipant) {
      return { newHostId: null, shouldClose: room.participants.size === 0, room };
    }

    this.log(`Participant ${disconnectedParticipant.id} disconnected from room ${roomId}`);

    const isHost = disconnectedParticipant.role === 'host' || disconnectedParticipant.role === 'temp-host';
    let newHostId = null;
    let shouldClose = false;

    if (isHost) {
      // Check if anyone has 100% progress to start the 30-min timer
      const hasFullFile = Array.from(room.participants.values()).some(
        p => p.id !== disconnectedParticipant.id && p.downloadProgress >= 100
      );

      if (hasFullFile) {
        newHostId = this.selectTempHost(roomId);
        if (newHostId) {
          const tempHost = room.participants.get(newHostId);
          if (tempHost) {
            tempHost.role = 'temp-host';
            room.hostSocketId = tempHost.socketId;
            room.tempHostId = newHostId;
            room.hostDisconnectedAt = Date.now();
            
            // Start 30-min timer
            room.hostReturnTimer = setTimeout(() => {
              this.finalizeTempHost(roomId);
            }, 30 * 60 * 1000);
            
            this.log(`Temp host ${newHostId} selected, 30-min timer started for room ${roomId}`);
          }
        }
      } else {
        this.log(`No participant has 100% file. Timer NOT started for room ${roomId}. Waiting for original host.`);
      }
    }

    // Clean up if empty
    if (room.participants.size <= 1) {
      shouldClose = true;
      this.closeRoom(roomId);
    }

    return { newHostId, shouldClose, room };
  }

  /**
   * @param {string} roomId
   * @returns {Room|null}
   */
  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  /**
   * @param {string} roomId
   * @param {string} socketId
   * @param {Object} data
   */
  updateParticipant(roomId, socketId, data) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const participant of room.participants.values()) {
      if (participant.socketId === socketId) {
        Object.assign(participant, data);
        room.lastActivityAt = Date.now();
        break;
      }
    }
  }

  /**
   * @param {string} roomId
   * @param {string} newHostSocketId
   */
  transferHost(roomId, newHostSocketId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    this.cancelHostReturnTimer(room);

    for (const participant of room.participants.values()) {
      if (participant.role === 'host' || participant.role === 'temp-host') {
        participant.role = 'member';
      }
      if (participant.socketId === newHostSocketId) {
        participant.role = 'host';
        room.hostSocketId = newHostSocketId;
        room.originalHostId = participant.id; // Update original host to the new one
        room.tempHostId = null;
        room.hostDisconnectedAt = null;
      }
    }
    this.log(`Host transferred to ${newHostSocketId} in room ${roomId}`);
  }

  /**
   * @param {string} roomId
   */
  closeRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      this.cancelHostReturnTimer(room);
      this.rooms.delete(roomId);
      this.log(`Room ${roomId} closed and removed`);
    }
  }

  /**
   * @param {string} roomId
   * @returns {string|null}
   */
  selectTempHost(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    let bestCandidate = null;
    let maxProgress = -1;
    let earliestJoin = Infinity;

    for (const participant of room.participants.values()) {
      if (participant.id === room.originalHostId || !participant.isOnline) continue;

      if (participant.downloadProgress > maxProgress) {
        maxProgress = participant.downloadProgress;
        bestCandidate = participant;
        earliestJoin = participant.joinedAt;
      } else if (participant.downloadProgress === maxProgress && participant.joinedAt < earliestJoin) {
        bestCandidate = participant;
        earliestJoin = participant.joinedAt;
      }
    }

    return bestCandidate ? bestCandidate.id : null;
  }

  /**
   * @param {string} roomId
   */
  finalizeTempHost(roomId) {
    const room = this.rooms.get(roomId);
    if (!room || !room.tempHostId) return;

    const tempHost = room.participants.get(room.tempHostId);
    if (tempHost) {
      tempHost.role = 'host';
      room.originalHostId = tempHost.id;
      room.tempHostId = null;
      room.hostDisconnectedAt = null;
      this.log(`Temp host ${room.tempHostId} finalized as permanent host in room ${roomId}`);
    }
  }

  /**
   * @param {Room} room
   */
  cancelHostReturnTimer(room) {
    if (room.hostReturnTimer) {
      clearTimeout(room.hostReturnTimer);
      room.hostReturnTimer = null;
      this.log(`Host return timer cancelled for room ${room.id}`);
    }
  }

  /**
   * Cleanup dead rooms (no participants for > 1 hour)
   */
  cleanupDeadRooms() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.participants.size === 0 && (now - room.lastActivityAt) > oneHour) {
        this.closeRoom(roomId);
      }
    }
  }

  /**
   * @param {string} message
   */
  log(message) {
    console.log(`[${new Date().toISOString()}] [RoomManager] ${message}`);
  }
}

module.exports = new RoomManager();