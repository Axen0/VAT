const bcrypt = require('bcryptjs');
const roomManager = require('../room-manager');

/**
 * @param {string} roomId
 * @param {string} passwordAttempt
 * @returns {Promise<boolean>}
 */
async function validateRoomPassword(roomId, passwordAttempt) {
  const room = roomManager.getRoom(roomId);
  if (!room) return false;
  if (!room.passwordHash) return true; // No password required

  return await bcrypt.compare(passwordAttempt, room.passwordHash);
}

/**
 * @param {string} password
 * @returns {Promise<string>}
 */
async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

/**
 * @param {Object} room
 * @param {string} socketId
 * @param {'control_playback'|'change_settings'|'kick_members'} permission
 * @returns {boolean}
 */
function checkPermission(room, socketId, permission) {
  let participant = null;
  for (const p of room.participants.values()) {
    if (p.socketId === socketId) {
      participant = p;
      break;
    }
  }

  if (!participant) return false;

  if (participant.role === 'host' || participant.role === 'temp-host') {
    return true;
  }

  if (permission === 'control_playback') {
    return room.settings.anyoneCanControl || room.settings.controlWhitelist.includes(participant.id);
  }

  if (permission === 'change_settings') {
    return room.settings.settingsEditorWhitelist.includes(participant.id);
  }

  if (permission === 'kick_members') {
    return false; // Only host can kick
  }

  return false;
}

module.exports = {
  validateRoomPassword,
  hashPassword,
  checkPermission,
};