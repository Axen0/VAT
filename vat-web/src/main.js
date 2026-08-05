/**
 * VAT Web - entry point.
 * Renders the login screen FIRST so the page is never blank,
 * then registers the service worker and initializes modules.
 */

import socketClient from './socket-client.js';
import torrentClient from './torrent-client.js';
import ui from './ui.js';

/**
 * Determine the signal server URL.
 * The signal server runs on the same host that serves the web app
 * (localhost, LAN IP or domain), port 3000 by default.
 */
function getSignalServerUrl() {
  if (import.meta.env && import.meta.env.VITE_SIGNAL_SERVER) {
    return import.meta.env.VITE_SIGNAL_SERVER;
  }
  return window.location.protocol + '//' + window.location.hostname + ':3000';
}

/** Surface fatal errors on the page instead of a blank screen. */
function installErrorOverlay() {
  window.addEventListener('error', (event) => {
    let banner = document.getElementById('fatal-error');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'fatal-error';
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ff4a4a;color:#fff;padding:10px;font-size:13px;z-index:9999;white-space:pre-wrap;';
      document.body.appendChild(banner);
    }
    banner.textContent = 'Ошибка: ' + (event.message || 'unknown') + '\n' + (event.filename || '') + ':' + (event.lineno || '');
  });
}

async function init() {
  installErrorOverlay();

  // Render the login screen before any heavy initialization
  const roomCode = ui.checkUrlForRoomCode();
  ui.renderLogin(roomCode);

  const signalServerUrl = getSignalServerUrl();

  // Socket connection (async, non-blocking)
  socketClient.connect(signalServerUrl);

  // Torrent client (guarded: UI must survive even if WebTorrent fails)
  try {
    torrentClient.init(signalServerUrl);
  } catch (err) {
    console.error('[VAT Web] Torrent client init failed:', err);
  }

  // Register the service worker (cache + Web Locks keep-alive)
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/service-worker.js');
    } catch (err) {
      console.error('[VAT Web] Service Worker registration failed:', err);
    }
  }

  window.addEventListener('beforeunload', () => {
    if (ui.currentScreen === 'room') {
      socketClient.leaveRoom();
    }
  });
}

init().catch((err) => {
  console.error('[VAT Web] Fatal initialization error:', err);
  document.body.innerHTML =
    '<div style="padding:40px;text-align:center;color:#ff4a4a;">' +
    '<h1>Ошибка инициализации</h1><p>' + err.message + '</p>' +
    '<button onclick="location.reload()" style="padding:10px 20px;margin-top:20px;">Перезагрузить</button></div>';
});