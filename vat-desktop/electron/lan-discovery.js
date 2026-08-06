const mdns = require('multicast-dns')();
const os = require('os');
const net = require('net');

class LanDiscovery {
  constructor() {
    this.isLanMode = false;
    this.currentRoomId = null;
    this.currentPort = 3001;
    this.tcpServer = null;
    this.connections = new Map();

    // Listen for mDNS queries and respond if we are advertising
    mdns.on('query', (query) => {
      if (!this.isLanMode || !this.currentRoomId) return;

      const hasPtrQuery = query.questions.some(q => q.name === '_vat._tcp.local' && q.type === 'PTR');
      if (hasPtrQuery) {
        const localIp = this.getLocalIp();
        // CORRECTED: mdns.respond expects an object with an 'answers' array
        mdns.respond({
          answers: [
            { name: '_vat._tcp.local', type: 'PTR', data: `vat-${this.currentRoomId}._vat._tcp.local` },
            { name: `vat-${this.currentRoomId}._vat._tcp.local`, type: 'SRV', data: { port: this.currentPort, target: localIp } },
            { name: `vat-${this.currentRoomId}._vat._tcp.local`, type: 'TXT', data: `roomId=${this.currentRoomId}&version=1.0` },
            { name: localIp, type: 'A', data: localIp }
          ]
        });
      }
    });
  }

  enableLanMode() {
    this.isLanMode = true;
    console.log('[LanDiscovery] LAN mode enabled');
  }

  disableLanMode() {
    this.isLanMode = false;
    this.currentRoomId = null;
    if (this.tcpServer) {
      this.tcpServer.close();
      this.tcpServer = null;
    }
    console.log('[LanDiscovery] LAN mode disabled');
  }

  isLanModeActive() {
    return this.isLanMode;
  }

  getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  startAdvertising(roomId, port = 3001) {
    if (!this.isLanMode) return;
    
    this.currentRoomId = roomId;
    this.currentPort = port;
    console.log(`[LanDiscovery] Advertising room ${roomId} on port ${port}`);
    
    // Broadcast a query to announce ourselves immediately and trigger responses
    mdns.query({
      questions: [{ name: '_vat._tcp.local', type: 'PTR' }]
    });
  }

  stopAdvertising() {
    this.currentRoomId = null;
  }

  discoverRooms() {
    return new Promise((resolve) => {
      const rooms = new Map();
      const timeout = setTimeout(() => {
        mdns.removeListener('response', onResponse);
        resolve(Array.from(rooms.values()));
      }, 5000);

      const onResponse = (packet) => {
        packet.answers.forEach(answer => {
          if (answer.type === 'SRV' && answer.name && answer.name.includes('_vat._tcp.local')) {
            const roomIdMatch = answer.name.match(/vat-(.*?)\._vat\._tcp\.local/);
            if (roomIdMatch) {
              const roomId = roomIdMatch[1];
              rooms.set(roomId, {
                roomId,
                host: answer.data.target,
                port: answer.data.port,
                ip: answer.data.target
              });
            }
          }
        });
      };

      mdns.on('response', onResponse);
      mdns.query({ questions: [{ name: '_vat._tcp.local', type: 'PTR' }] });
    });
  }

  startDirectServer(port = 3001) {
    if (this.tcpServer) return;

    this.tcpServer = net.createServer((socket) => {
      console.log('[LanDiscovery] New LAN connection');
      socket.on('data', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          // Handle direct LAN messages
        } catch (e) { /* ignore parse errors */ }
      });
    });

    this.tcpServer.listen(port, () => {
      console.log(`[LanDiscovery] Direct LAN server listening on port ${port}`);
    });
  }

  connectToLanHost(ip, port) {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: ip, port }, () => {
        resolve({
          send: (data) => socket.write(JSON.stringify(data)),
          on: (event, cb) => socket.on('data', (d) => cb(JSON.parse(d.toString()))),
          close: () => socket.end()
        });
      });
      socket.on('error', reject);
    });
  }
}

module.exports = new LanDiscovery();