/**
 * @returns {number} Current server timestamp in ms
 */
function getServerTime() {
  return Date.now();
}

/**
 * @param {number} clientTimestamp
 * @returns {{serverTime: number, clientTimestamp: number}}
 */
function handleTimeSyncRequest(clientTimestamp) {
  return {
    serverTime: getServerTime(),
    clientTimestamp,
  };
}

module.exports = {
  getServerTime,
  handleTimeSyncRequest,
};