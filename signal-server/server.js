const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const roomManager = require('./room-manager');
const { registerRoomHandlers } = require('./handlers/room');
const { registerSignalingHandlers } = require('./handlers/signaling');
const { registerSyncHandlers } = require('./handlers/sync');
const { registerChatHandlers } = require('./handlers/chat');
const { registerMediaHandlers } = require('./handlers/media');

const app = express();
app.use(cors({ origin: '*' }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] [HTTP] ${req.method} ${req.url}`);
  next();
});

const server = http.createServer(app);

// Function-based CORS is the most robust way to allow 'null' origin from file://
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (like file:// or mobile apps)
      if (!origin || origin === 'null') {
        return callback(null, true);
      }
      return callback(null, true);
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Simple WebSocket tracker for WebTorrent
// This is a minimal implementation that forwards WebRTC signaling
const trackerWss = new WebSocketServer({ noServer: true });
const trackerPeers = new Map(); // infoHash -> Set of { socket, peerId }

trackerWss.on('connection', (ws) => {
  let peerId = null;
  const infoHashes = new Set();

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      
      if (msg.action === 'announce') {
        peerId = msg.peer_id;
        const infoHash = msg.info_hash;
        infoHashes.add(infoHash);

        if (!trackerPeers.has(infoHash)) {
          trackerPeers.set(infoHash, new Set());
        }
        const peers = trackerPeers.get(infoHash);
        peers.add({ socket: ws, peerId });

        // Send offers to other peers
        if (msg.offers) {
          const otherPeers = Array.from(peers).filter(p => p.peerId !== peerId);
          msg.offers.forEach((offerData, i) => {
            const targetPeer = otherPeers[i % otherPeers.length];
            if (targetPeer && targetPeer.socket.readyState === 1) {
              targetPeer.socket.send(JSON.stringify({
                action: 'announce',
                offer: offerData.offer,
                offer_id: offerData.offer_id,
                peer_id: peerId,
                info_hash: infoHash
              }));
            }
          });
        }

        // Send answer to specific peer
        if (msg.answer && msg.to_peer_id) {
          const targetPeer = Array.from(peers).find(p => p.peerId === msg.to_peer_id);
          if (targetPeer && targetPeer.socket.readyState === 1) {
            targetPeer.socket.send(JSON.stringify({
              action: 'announce',
              answer: msg.answer,
              offer_id: msg.offer_id,
              peer_id: peerId,
              info_hash: infoHash
            }));
          }
        }

        // Send response back
        ws.send(JSON.stringify({
          action: 'announce',
          info_hash: infoHash,
          interval: 30,
          'min interval': 10
        }));
      }
    } catch (err) {
      console.error('[Tracker] Message parse error:', err);
    }
  });

  ws.on('close', () => {
    infoHashes.forEach(infoHash => {
      const peers = trackerPeers.get(infoHash);
      if (peers) {
        for (const peer of peers) {
          if (peer.socket === ws) {
            peers.delete(peer);
            break;
          }
        }
        if (peers.size === 0) {
          trackerPeers.delete(infoHash);
        }
      }
    });
  });

  ws.on('error', (err) => {
    console.error('[Tracker] WebSocket error:', err);
  });
});

// Handle WebSocket upgrade for tracker
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  if (url.pathname === '/torrent-tracker') {
    trackerWss.handleUpgrade(req, socket, head, (ws) => {
      trackerWss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    rooms: roomManager.rooms.size,
    trackerPeers: Array.from(trackerPeers.values()).reduce((sum, set) => sum + set.size, 0),
    timestamp: Date.now()
  });
});

app.get('/tracker-stats', (req, res) => {
  const stats = {
    torrents: trackerPeers.size,
    peers: Array.from(trackerPeers.values()).reduce((sum, set) => sum + set.size, 0)
  };
  res.json(stats);
});

registerRoomHandlers(io);
registerSignalingHandlers(io);
registerSyncHandlers(io);
registerChatHandlers(io);
registerMediaHandlers(io);

setInterval(() => {
  roomManager.cleanupDeadRooms();
}, 30 * 60 * 1000);

const PORT = process.env.PORT || 3000;

// Listen on all interfaces (0.0.0.0) to allow LAN connections
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] Signal server listening on port ${PORT} (all interfaces)`);
  console.log(`[${new Date().toISOString()}] Tracker WebSocket endpoint: ws://0.0.0.0:${PORT}/torrent-tracker`);
});

module.exports = { app, server, io };