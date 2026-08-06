/**
 * @param {import('socket.io').Server} io
 */
function registerSignalingHandlers(io) {
  io.on('connection', (socket) => {
    socket.on('webrtc:offer', (data) => {
      const { targetSocketId, offer, fromParticipantId } = data;
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.emit('webrtc:offer', { fromSocketId: socket.id, offer, fromParticipantId });
        log(`WebRTC offer forwarded to ${targetSocketId}`);
      }
    });

    socket.on('webrtc:answer', (data) => {
      const { targetSocketId, answer } = data;
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.emit('webrtc:answer', { fromSocketId: socket.id, answer });
        log(`WebRTC answer forwarded to ${targetSocketId}`);
      }
    });

    socket.on('webrtc:ice-candidate', (data) => {
      const { targetSocketId, candidate } = data;
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.emit('webrtc:ice-candidate', { fromSocketId: socket.id, candidate });
        log(`WebRTC ICE candidate forwarded to ${targetSocketId}`);
      }
    });
  });
}

function log(message) {
  console.log(`[${new Date().toISOString()}] [SignalingHandler] ${message}`);
}

module.exports = { registerSignalingHandlers };