const roomManager = require('../room-manager');
const auth = require('./auth');
const timeSync = require('../time-sync');

/**
 * @param {import('socket.io').Server} io
 */
function registerSyncHandlers(io) {
  io.on('connection', (socket) => {
    socket.on('sync:play', (data) => {
      const { roomId, position } = data;
      const room = roomManager.getRoom(roomId);
      if (!room || !auth.checkPermission(room, socket.id, 'control_playback')) return;

      const executeAt = timeSync.getServerTime() + 500;
      room.playback.state = 'playing';
      room.playback.position = position;
      room.playback.lastSyncServerTime = executeAt;

      io.to(roomId).emit('sync:play-command', { position, executeAt });
      log(`Play command issued in room ${roomId} at position ${position}`);
    });

    socket.on('sync:pause', (data) => {
      const { roomId, position } = data;
      const room = roomManager.getRoom(roomId);
      if (!room || !auth.checkPermission(room, socket.id, 'control_playback')) return;

      const executeAt = timeSync.getServerTime() + 500;
      room.playback.state = 'paused';
      room.playback.position = position;
      room.playback.lastSyncServerTime = executeAt;

      io.to(roomId).emit('sync:pause-command', { position, executeAt });
      log(`Pause command issued in room ${roomId} at position ${position}`);
    });

    socket.on('sync:seek', (data) => {
      const { roomId, position } = data;
      const room = roomManager.getRoom(roomId);
      if (!room || !auth.checkPermission(room, socket.id, 'control_playback')) return;

      // Basic seekable check: ensure media is loaded enough (simplified for MVP)
      const executeAt = timeSync.getServerTime() + 500;
      room.playback.position = position;
      room.playback.lastSyncServerTime = executeAt;

      io.to(roomId).emit('sync:seek-command', { position, executeAt });
      log(`Seek command issued in room ${roomId} to position ${position}`);
    });

    socket.on('sync:position-report', (data) => {
      const { roomId, position } = data;
      const room = roomManager.getRoom(roomId);
      if (room) {
        room.playback.position = position;
        room.playback.lastSyncServerTime = timeSync.getServerTime();
      }
    });

    socket.on('sync:ready', (data) => {
      const { roomId } = data;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      roomManager.updateParticipant(roomId, socket.id, { readyToPlay: true });

      const allReady = Array.from(room.participants.values()).every(p => p.isOnline && p.readyToPlay);
      if (allReady) {
        room.playback.state = 'ready';
        io.to(roomId).emit('sync:all-ready', {});
        log(`All participants ready in room ${roomId}`);
      }
    });

    socket.on('time:sync-request', (data, callback) => {
      const { clientTimestamp } = data;
      const response = timeSync.handleTimeSyncRequest(clientTimestamp);
      
      // Safe check: invoke callback only if it is a function
      if (typeof callback === 'function') {
        callback(response);
      }
    });
  });
}

function log(message) {
  console.log(`[${new Date().toISOString()}] [SyncHandler] ${message}`);
}

module.exports = { registerSyncHandlers };