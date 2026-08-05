/**
 * @param {import('socket.io').Server} io
 */
function registerChatHandlers(io) {
  io.on('connection', (socket) => {
    socket.on('chat:message', (data) => {
      const { roomId, message } = data;
      
      // Basic sanitization (strip HTML tags)
      const sanitizedMessage = message.replace(/<[^>]*>/g, '');
      
      // Find sender info
      // Note: In a real scenario, we'd pass senderId/nickname in data or look up by socket.id
      // For MVP, we assume client sends senderId and senderNickname for simplicity, 
      // or we can look it up. Let's assume client sends it.
      const { senderId, senderNickname } = data;
      const timestamp = Date.now();

      io.to(roomId).emit('chat:message-receive', {
        senderId,
        senderNickname,
        message: sanitizedMessage,
        timestamp,
      });
      
      log(`Chat message in room ${roomId} from ${senderNickname}`);
    });
  });
}

function log(message) {
  console.log(`[${new Date().toISOString()}] [ChatHandler] ${message}`);
}

module.exports = { registerChatHandlers };