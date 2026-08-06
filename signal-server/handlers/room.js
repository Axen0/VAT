const roomManager = require('../room-manager');
const auth = require('./auth');

/**
 * @param {import('socket.io').Server} io
 */
function registerRoomHandlers(io) {
  io.on('connection', (socket) => {
    log(`Client connected: ${socket.id}`);

    socket.on('room:create', async (data, callback) => {
      try {
        const { nickname, password, settings, participantId } = data;
        const passwordHash = password ? await auth.hashPassword(password) : null;
        const roomId = roomManager.createRoom(socket.id, participantId, nickname, settings, passwordHash);
        
        socket.join(roomId);
        const link = `https://${process.env.SIGNAL_SERVER_URL || 'localhost:3000'}/join/${roomId}`;
        
        log(`Room created: ${roomId} by ${participantId}`);
        callback({ success: true, roomId, link });
      } catch (err) {
        log(`Error creating room: ${err.message}`);
        callback({ success: false, error: 'Failed to create room' });
      }
    });

    socket.on('room:join', async (data, callback) => {
      try {
        const { roomId, password, nickname, participantId } = data;
        const isValid = await auth.validateRoomPassword(roomId, password || '');
        if (!isValid) {
          return callback({ success: false, error: 'Invalid password' });
        }

        const result = roomManager.joinRoom(roomId, { id: participantId, socketId: socket.id, nickname, password });
        if (!result.success) {
          return callback({ success: false, error: result.error });
        }

        socket.join(roomId);
        
        // Notify others
        socket.to(roomId).emit('room:participant-update', result.room.participants.get(participantId));
        
        log(`Participant ${participantId} joined room ${roomId}`);
        callback({ success: true, roomState: result.room });
      } catch (err) {
        log(`Error joining room: ${err.message}`);
        callback({ success: false, error: 'Failed to join room' });
      }
    });

    socket.on('room:leave', (data, callback) => {
      const { roomId } = data;
      const { shouldClose } = roomManager.leaveRoom(roomId, socket.id);
      
      if (shouldClose) {
        io.to(roomId).emit('room:closed', { reason: 'Host left and no participants remain' });
      } else {
        socket.to(roomId).emit('room:participant-disconnected', { socketId: socket.id });
      }
      
      socket.leave(roomId);
      if (callback) callback({ success: true });
    });

    socket.on('room:password-check', async (data, callback) => {
      const { roomId, password } = data;
      const isValid = await auth.validateRoomPassword(roomId, password);
      callback({ success: true, isValid });
    });

    socket.on('room:kick', (data) => {
      const { roomId, targetParticipantId } = data;
      const room = roomManager.getRoom(roomId);
      if (!room || !auth.checkPermission(room, socket.id, 'kick_members')) {
        return socket.emit('room:kick-error', { error: 'Permission denied' });
      }

      const target = room.participants.get(targetParticipantId);
      if (target) {
        const targetSocket = io.sockets.sockets.get(target.socketId);
        if (targetSocket) {
          targetSocket.emit('room:kicked', { reason: 'Kicked by host' });
          targetSocket.leave(roomId);
        }
        room.participants.delete(targetParticipantId);
        io.to(roomId).emit('room:participant-disconnected', { participantId: targetParticipantId, nickname: target.nickname });
        log(`Participant ${targetParticipantId} kicked from room ${roomId}`);
      }
    });

    socket.on('room:transfer-host', (data) => {
      const { roomId, targetParticipantId } = data;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const target = room.participants.get(targetParticipantId);
      if (target) {
        roomManager.transferHost(roomId, target.socketId);
        io.to(roomId).emit('room:host-changed', { 
          newHostId: target.id, 
          newHostNickname: target.nickname, 
          isTemp: false 
        });
        log(`Host transferred to ${targetParticipantId} in room ${roomId}`);
      }
    });

    socket.on('host:return-request', (data) => {
      const { roomId } = data;
      const room = roomManager.getRoom(roomId);
      if (!room || !room.tempHostId) return;

      const tempHost = room.participants.get(room.tempHostId);
      if (tempHost) {
        const tempHostSocket = io.sockets.sockets.get(tempHost.socketId);
        if (tempHostSocket) {
          const originalHost = room.participants.get(room.originalHostId);
          tempHostSocket.emit('host:return-question', { 
            originalHostNickname: originalHost ? originalHost.nickname : 'Unknown' 
          });
        }
      }
    });

    socket.on('host:return-response', (data) => {
      const { roomId, accept } = data;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const originalHost = room.participants.get(room.originalHostId);
      if (originalHost) {
        const originalHostSocket = io.sockets.sockets.get(originalHost.socketId);
        if (originalHostSocket) {
          originalHostSocket.emit('host:return-notification', { accepted: accept });
          if (accept) {
            roomManager.transferHost(roomId, originalHost.socketId);
            io.to(roomId).emit('room:host-changed', { 
              newHostId: originalHost.id, 
              newHostNickname: originalHost.nickname, 
              isTemp: false 
            });
          }
        }
      }
    });

    socket.on('disconnect', () => {
      log(`Client disconnected: ${socket.id}`);
      for (const [roomId, room] of roomManager.rooms.entries()) {
        const participant = Array.from(room.participants.values()).find(p => p.socketId === socket.id);
        if (participant) {
          const { newHostId, shouldClose } = roomManager.leaveRoom(roomId, socket.id);
          
          if (shouldClose) {
            io.to(roomId).emit('room:closed', { reason: 'Room closed' });
          } else {
            io.to(roomId).emit('room:participant-disconnected', { 
              participantId: participant.id, 
              nickname: participant.nickname 
            });
            
            if (newHostId) {
              const newHost = room.participants.get(newHostId);
              io.to(roomId).emit('room:host-changed', { 
                newHostId: newHost.id, 
                newHostNickname: newHost.nickname, 
                isTemp: true 
              });
            }

            const currentRoom = roomManager.getRoom(roomId);
            if (currentRoom && currentRoom.settings.pauseOnMemberDisconnect) {
              io.to(roomId).emit('sync:pause-command', { 
                position: currentRoom.playback.position, 
                executeAt: Date.now() + 500 
              });
            }
          }
          break;
        }
      }
    });
  });
}

function log(message) {
  console.log(`[${new Date().toISOString()}] [RoomHandler] ${message}`);
}

module.exports = { registerRoomHandlers };