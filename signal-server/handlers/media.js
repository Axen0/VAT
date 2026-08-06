const roomManager = require('../room-manager');

/**
 * @param {import('socket.io').Server} io
 */
function registerMediaHandlers(io) {
  io.on('connection', (socket) => {
    socket.on('media:file-ready', (data) => {
      const { roomId, filename, fileSize, type, duration, magnetURI, parts } = data;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      room.media = {
        filename,
        fileSize,
        type,
        duration,
        originalCodec: data.codec || 'unknown',
        magnetURI,
        parts,
        availableQualities: [],
      };

      io.to(roomId).emit('media:download-available', {
        filename,
        fileSize,
        type,
        duration,
        magnetURI,
        parts,
        availableQualities: room.media.availableQualities,
      });
      log(`Media file ready in room ${roomId}: ${filename}`);
    });

    socket.on('media:download-accept', (data) => {
      const { roomId } = data;
      roomManager.updateParticipant(roomId, socket.id, { downloadProgress: 0 });
      log(`Participant accepted download in room ${roomId}`);
    });

    socket.on('media:progress-update', (data) => {
      const { roomId, percent, partIndex } = data;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      roomManager.updateParticipant(roomId, socket.id, { 
        downloadProgress: percent,
        currentPartIndex: partIndex
      });

      // Check for slow member
      const participants = Array.from(room.participants.values()).filter(p => p.isOnline);
      if (participants.length > 1) {
        const avgProgress = participants.reduce((sum, p) => sum + p.downloadProgress, 0) / participants.length;
        const participant = participants.find(p => p.socketId === socket.id);
        
        if (participant && (avgProgress - participant.downloadProgress) > 15 && avgProgress > 80) {
          const host = participants.find(p => p.role === 'host' || p.role === 'temp-host');
          if (host) {
            const hostSocket = io.sockets.sockets.get(host.socketId);
            if (hostSocket) {
              hostSocket.emit('media:slow-member-alert', {
                participantId: participant.id,
                nickname: participant.nickname,
                progress: participant.downloadProgress,
                averageProgress: avgProgress,
              });
            }
          }
        }
      }
    });

    socket.on('media:part-completed', (data) => {
      const { roomId, partIndex } = data;
      log(`Participant completed part ${partIndex} in room ${roomId}`);
      // Logic to unlock next part is handled client-side via torrent piece selection,
      // but server can track it if needed.
    });

    socket.on('media:quality-request', (data) => {
      const { roomId, quality } = data;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const host = Array.from(room.participants.values()).find(p => p.role === 'host' || p.role === 'temp-host');
      if (host) {
        const hostSocket = io.sockets.sockets.get(host.socketId);
        if (hostSocket) {
          const participant = Array.from(room.participants.values()).find(p => p.socketId === socket.id);
          hostSocket.emit('media:quality-request', { 
            quality, 
            requestedBy: participant ? participant.id : 'unknown' 
          });
        }
      }
    });

    socket.on('media:quality-ready', (data) => {
      const { roomId, quality, magnetURI } = data;
      const room = roomManager.getRoom(roomId);
      if (!room || !room.media) return;

      const existingQuality = room.media.availableQualities.find(q => q.label === quality);
      if (existingQuality) {
        existingQuality.status = 'ready';
        existingQuality.magnetURI = magnetURI;
      } else {
        room.media.availableQualities.push({
          label: quality,
          resolution: data.resolution || '',
          magnetURI,
          status: 'ready',
          requestedBy: data.requestedBy || '',
        });
      }

      // Notify the specific requester or all
      io.to(roomId).emit('media:quality-ready', { quality, magnetURI });
      log(`Quality ${quality} ready in room ${roomId}`);
    });
  });
}

function log(message) {
  console.log(`[${new Date().toISOString()}] [MediaHandler] ${message}`);
}

module.exports = { registerMediaHandlers };