const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter, once } = require('node:events');
const http = require('node:http');
const net = require('node:net');
const express = require('express');
const { HomebridgeAPI } = require(
  process.env.LOQED_TEST_HOMEBRIDGE_API || 'homebridge/lib/api',
);
const { HomeBridgeLoqedPlatform } = require('../dist/platform');
const { LoqedPlatformAccessory } = require('../dist/platformAccessory');

// No test reads or changes a real LOQED lock.
LoqedPlatformAccessory.prototype.updateLockInfo = async () => {};

function platform(config = {}) {
  const api = new HomebridgeAPI();
  const errors = [];
  const log = {
    debug() {}, info() {}, warn() {},
    error(message) { errors.push(message); },
  };
  const instance = new HomeBridgeLoqedPlatform(log, {
    platform: 'HomebridgeLoqed', name: 'Test door', lockID: 'test-lock',
    bridgeIP: '127.0.0.1', ...config,
  }, api);
  return { instance, api, errors };
}

function receiver(fixture) {
  const { instance, api } = fixture;
  const accessory = new api.platformAccessory(
    instance.config.name, api.hap.uuid.generate(instance.config.lockID),
  );
  accessory.context.device = instance.config;
  return new LoqedPlatformAccessory(instance, accessory);
}

async function availablePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function closeReceiver(fixture, lock) {
  if (!lock.server.listening) return;
  const closed = once(lock.server, 'close');
  fixture.api.emit('shutdown');
  await closed;
}

function post(port, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: '/webhook', method: 'POST',
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
    }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

function battery(lock, api) {
  return lock.batteryService.getCharacteristic(api.hap.Characteristic.BatteryLevel).value;
}

function useFakeListener(t) {
  const original = express.application.listen;
  const ports = [];
  const servers = [];
  express.application.listen = function (port) {
    ports.push(port);
    const server = new EventEmitter();
    server.close = () => { server.closed = true; };
    servers.push(server);
    return server;
  };
  t.after(() => { express.application.listen = original; });
  return { ports, servers };
}

test('two locks receive independent status and battery updates on separate ports', async t => {
  const front = platform({ name: 'Front door', lockID: 'front', webhookPort: await availablePort() });
  const a = receiver(front);
  t.after(() => closeReceiver(front, a));
  await once(a.server, 'listening');
  const back = platform({ name: 'Back door', lockID: 'back', webhookPort: await availablePort() });
  const b = receiver(back);
  t.after(() => closeReceiver(back, b));
  await once(b.server, 'listening');
  assert.notEqual(front.instance.config.webhookPort, back.instance.config.webhookPort);

  assert.equal(await post(front.instance.config.webhookPort, {
    event_type: 'STATE_CHANGED_NIGHT_LOCK', battery_percentage: 76,
  }), 200);
  assert.equal(a.handleLockCurrentStateGet(), 1);
  assert.equal(b.handleLockCurrentStateGet(), 0);
  assert.equal(battery(a, front.api), 76);
  assert.equal(battery(b, back.api), 0);

  await post(back.instance.config.webhookPort, {
    event_type: 'STATE_CHANGED_NIGHT_LOCK', battery_percentage: 42,
  });
  await post(front.instance.config.webhookPort, { event_type: 'STATE_CHANGED_OPEN' });
  assert.equal(a.handleLockCurrentStateGet(), 0);
  assert.equal(b.handleLockCurrentStateGet(), 1);
  assert.equal(battery(a, front.api), 76);
  assert.equal(battery(b, back.api), 42);
  assert.deepEqual(front.errors, []);
  assert.deepEqual(back.errors, []);
});

test('webhooks from another bridge do not change lock state', async t => {
  const fixture = platform({ bridgeIP: '192.0.2.1', webhookPort: await availablePort() });
  const lock = receiver(fixture);
  t.after(() => closeReceiver(fixture, lock));
  await once(lock.server, 'listening');
  await post(fixture.instance.config.webhookPort, {
    event_type: 'STATE_CHANGED_NIGHT_LOCK', battery_percentage: 90,
  });
  assert.equal(lock.handleLockCurrentStateGet(), 0);
  assert.equal(battery(lock, fixture.api), 0);
});

test('a busy port produces a clear error without an unhandled server error', async t => {
  const fixture = platform({ webhookPort: await availablePort() });
  const first = receiver(fixture);
  t.after(() => closeReceiver(fixture, first));
  await once(first.server, 'listening');
  const second = receiver(fixture);
  const [error] = await once(second.server, 'error');
  assert.equal(error.code, 'EADDRINUSE');
  assert.equal(second.server.listening, false);
  assert.match(fixture.errors[0], /Test door.*port.*Configure a different webhookPort/);
});

test('existing configurations default to port 4567 and close on shutdown', t => {
  const { ports, servers } = useFakeListener(t);
  const fixture = platform();
  receiver(fixture);
  assert.deepEqual(ports, [4567]);
  fixture.api.emit('shutdown');
  assert.equal(servers[0].closed, true);
});

test('invalid ports are rejected before creating an accessory or receiver', t => {
  const { ports } = useFakeListener(t);
  for (const webhookPort of [0, -1, 65536, 4567.5, '4568']) {
    const fixture = platform({ webhookPort });
    fixture.instance.discoverDevices(fixture.instance.config);
    assert.equal(fixture.errors.length, 1);
    assert.match(fixture.errors[0], /Invalid webhookPort/);
  }
  assert.deepEqual(ports, []);
});

test('a cached accessory uses the current lock configuration and port', t => {
  const { ports } = useFakeListener(t);
  const fixture = platform({ name: 'Renamed door', webhookPort: 4568 });
  const accessory = new fixture.api.platformAccessory(
    'Old door name', fixture.api.hap.uuid.generate(fixture.instance.config.lockID),
  );
  accessory.context.device = { name: 'Old door name', webhookPort: 4567 };
  fixture.instance.configureAccessory(accessory);
  let updates = 0;
  fixture.api.on('updatePlatformAccessories', accessories => {
    assert.deepEqual(accessories, [accessory]);
    updates++;
  });
  fixture.instance.discoverDevices(fixture.instance.config);
  assert.equal(updates, 1);
  assert.equal(accessory.context.device.name, 'Renamed door');
  assert.deepEqual(ports, [4568]);
  fixture.api.emit('shutdown');
});
