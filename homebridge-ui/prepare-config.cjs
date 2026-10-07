const { randomBytes } = require('node:crypto');
const net = require('node:net');

async function isPortFree(port) {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.once('error', error => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') resolve(false);
      else reject(error);
    });
    server.listen(port, () => server.close(() => resolve(true)));
  });
}

async function prepareConfig(blocks, currentConfig, portFree = isPortFree) {
  if (!Array.isArray(blocks)) throw new Error('Expected an array of lock configurations.');
  const result = structuredClone(blocks);
  const otherBlocks = [...(currentConfig.platforms || []), ...(currentConfig.accessories || [])]
    .filter(block => block.platform !== 'HomebridgeLoqed');
  const ports = new Set();
  const usernames = new Set();
  for (const block of [currentConfig.bridge || {}, ...otherBlocks.map(b => b._bridge || {})]) {
    if (block.port) ports.add(block.port);
    if (block.username) usernames.add(block.username.toUpperCase());
  }
  // Keep ports reserved by saved locks, including locks being removed in this edit.
  for (const block of currentConfig.platforms || []) {
    if (block._bridge?.port) ports.add(block._bridge.port);
    if (block.webhookPort) ports.add(block.webhookPort);
    if (block._bridge?.username) usernames.add(block._bridge.username.toUpperCase());
    if (block.platform === 'config' && block.port) ports.add(block.port);
  }
  const submittedPorts = new Set();
  const submittedUsernames = new Set();
  const lockIDs = new Set();
  for (const block of result) {
    for (const field of ['name', 'lockID', 'key', 'token', 'bridgeIP']) {
      if (typeof block[field] !== 'string' || !block[field].trim()) {
        throw new Error(`Fill in ${field} for each lock.`);
      }
    }
    if (!Number.isInteger(block.localKeyID) || block.localKeyID < 0) {
      throw new Error(`Enter the actual Local Key ID for ${block.name}.`);
    }
    if (lockIDs.has(block.lockID)) throw new Error('Each lock must have a unique lockID.');
    lockIDs.add(block.lockID);
    block.platform = 'HomebridgeLoqed';
    const saved = (currentConfig.platforms || []).find(p => p.platform === 'HomebridgeLoqed' && p.lockID === block.lockID);
    if (saved && saved.webhookPort === undefined && block.webhookPort === undefined) block.webhookPort = 4567;
    for (const port of [block.webhookPort, block._bridge?.port]) {
      if (port === undefined) continue;
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid port for ${block.name}.`);
      if (submittedPorts.has(port)) throw new Error('Each webhook and HomeKit port must be unique.');
      if (otherBlocks.some(b => b._bridge?.port === port || b.webhookPort === port) || currentConfig.bridge?.port === port) {
        throw new Error(`Port ${port} is already configured for another bridge.`);
      }
      submittedPorts.add(port);
      ports.add(port);
    }
    if (block._bridge?.username) {
      const username = block._bridge.username.toUpperCase();
      if (submittedUsernames.has(username) || otherBlocks.some(b => b._bridge?.username?.toUpperCase() === username) || currentConfig.bridge?.username?.toUpperCase() === username) {
        throw new Error('Each child bridge must have a unique username.');
      }
      submittedUsernames.add(username);
      usernames.add(username);
    }
  }
  async function allocatePort(start) {
    for (let port = start; port <= 65535; port++) {
      if (!ports.has(port) && await portFree(port)) { ports.add(port); return port; }
    }
    throw new Error('No available port found.');
  }
  for (const block of result) {
    if (block.webhookPort === undefined) block.webhookPort = await allocatePort(4567);
    block._bridge ||= {};
    if (!block._bridge.username) {
      let username;
      do { username = ['0E', ...Array.from(randomBytes(5), b => b.toString(16).padStart(2, '0').toUpperCase())].join(':'); }
      while (usernames.has(username));
      usernames.add(username);
      block._bridge.username = username;
    }
    if (block._bridge.port === undefined) block._bridge.port = await allocatePort(52000);
    if (!block._bridge.name) block._bridge.name = `Loqed ${block.name}`;
  }
  return result;
}

module.exports = { prepareConfig, isPortFree };
