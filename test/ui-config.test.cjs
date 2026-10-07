const assert = require('node:assert/strict');
const { test } = require('node:test');
const net = require('node:net');
const { once } = require('node:events');
const { prepareConfig, isPortFree } = require('../homebridge-ui/prepare-config.cjs');

function lock(name, extra = {}) {
  return { platform: 'HomebridgeLoqed', name, lockID: name, localKeyID: 1, key: 'test-key', token: 'test-token', bridgeIP: '192.0.2.1', ...extra };
}

test('adding a second lock allocates unique bridges and skips reserved and busy ports', async () => {
  const existing = lock('Front', { webhookPort: 4567, _bridge: { username: '0E:01:02:03:04:05', port: 32776, name: 'Existing bridge', debugModeEnabled: true } });
  const other = { platform: 'OtherPlugin', _bridge: { username: '0E:11:12:13:14:15', port: 52000 } };
  const current = { bridge: { username: '0E:21:22:23:24:25', port: 52001 }, platforms: [existing, other] };
  const submitted = [existing, lock('Back')];
  const result = await prepareConfig(submitted, current, async port => ![4568, 52002].includes(port));
  assert.deepEqual(result[0], existing);
  assert.equal(result[1].webhookPort, 4569);
  assert.equal(result[1]._bridge.port, 52003);
  assert.match(result[1]._bridge.username, /^0E(:[0-9A-F]{2}){5}$/);
  assert(![existing._bridge.username, other._bridge.username, current.bridge.username].includes(result[1]._bridge.username));
  assert.equal(submitted[1]._bridge, undefined);
});

test('two existing main-bridge locks are both assigned separate child bridges', async () => {
  const blocks = [lock('Front', { webhookPort: 4567 }), lock('Back', { webhookPort: 4568 })];
  const result = await prepareConfig(blocks, { platforms: blocks }, async () => true);
  assert.notEqual(result[0]._bridge.username, result[1]._bridge.username);
  assert.notEqual(result[0]._bridge.port, result[1]._bridge.port);
  assert.equal(result[0].webhookPort, 4567);
  assert.equal(result[1].webhookPort, 4568);
});

test('reopening and saving existing child bridges preserves their identities and settings', async () => {
  const initial = await prepareConfig([lock('Front'), lock('Back')], {}, async () => true);
  const result = await prepareConfig(initial, { platforms: initial }, async () => { throw Error('Should not allocate existing ports'); });
  assert.deepEqual(result, initial);
});

test('legacy single-lock configurations retain webhook port 4567', async () => {
  const existing = lock('Front');
  const result = await prepareConfig([existing, lock('Back')], { platforms: [existing] }, async () => true);
  assert.equal(result[0].webhookPort, 4567);
  assert.equal(result[1].webhookPort, 4568);
});

test('duplicate lock IDs, ports and bridge identities are rejected', async () => {
  const free = async () => true;
  await assert.rejects(prepareConfig([lock('Front'), lock('Front')], {}, free), /unique lockID/);
  await assert.rejects(prepareConfig([lock('Front', { webhookPort: 4567 }), lock('Back', { webhookPort: 4567 })], {}, free), /port must be unique|ports must be unique/);
  const bridge = { username: '0E:01:02:03:04:05', port: 52000 };
  await assert.rejects(prepareConfig([lock('Front', { _bridge: bridge }), lock('Back', { _bridge: { ...bridge, port: 52001 } })], {}, free), /unique username/);
  await assert.rejects(prepareConfig([lock('Front', { _bridge: bridge })], { platforms: [{ platform: 'Other', _bridge: bridge }] }, free), /already configured/);
});

test('incomplete credentials are rejected before allocation', async () => {
  await assert.rejects(prepareConfig([lock('Front', { token: '' })], {}, async () => true), /Fill in token/);
});

test('port probing detects occupied ports and releases its own probe', async t => {
  const server = net.createServer();
  t.after(() => server.close());
  server.listen(0);
  await once(server, 'listening');
  const port = server.address().port;
  assert.equal(await isPortFree(port), false);
  await new Promise(resolve => server.close(resolve));
  assert.equal(await isPortFree(port), true);
  assert.equal(await isPortFree(port), true);
});

test('the actual custom UI server starts and prepares configuration without writing it', async t => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { fork } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loqed-ui-test-'));
  const configPath = path.join(dir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({ platforms: [] }));
  const original = fs.readFileSync(configPath, 'utf8');
  const child = fork(path.join(__dirname, '../homebridge-ui/server.js'), [], {
    env: { ...process.env, HOMEBRIDGE_CONFIG_PATH: configPath }, silent: true,
  });
  t.after(() => { child.kill(); fs.rmSync(dir, { recursive: true, force: true }); });
  child.stdout.resume();
  child.stderr.resume();
  function message() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(Error('UI server timed out')); }, 5000);
      function cleanup() { clearTimeout(timer); child.off('message', success); child.off('exit', failure); }
      function success(data) { cleanup(); resolve(data); }
      function failure(code) { cleanup(); reject(Error(`UI server exited: ${code}`)); }
      child.once('message', success);
      child.once('exit', failure);
    });
  }
  assert.equal((await message()).action, 'ready');
  const response = message();
  child.send({ action: 'request', requestId: 'test', path: '/prepare-config', body: [lock('Front'), lock('Back')] });
  const { payload } = await response;
  assert.equal(payload.success, true);
  assert.notEqual(payload.data[0]._bridge.username, payload.data[1]._bridge.username);
  assert.notEqual(payload.data[0]._bridge.port, payload.data[1]._bridge.port);
  assert.notEqual(payload.data[0].webhookPort, payload.data[1].webhookPort);
  assert.equal(fs.readFileSync(configPath, 'utf8'), original);
});

test('the settings form adds a second lock and saves the generated bridges', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const path = require('node:path');
  function element() {
    return { children: [], listeners: {}, append(...children) { this.children.push(...children); },
      replaceChildren() { this.children = []; }, addEventListener(name, listener) { this.listeners[name] = listener; }, reportValidity() { return true; } };
  }
  const ids = Object.fromEntries(['locks-form', 'locks', 'status', 'add-lock', 'save-locks'].map(id => [id, element()]));
  const existing = lock('Front', { webhookPort: 4567, _bridge: { username: '0E:01:02:03:04:05', port: 32776, name: 'Front bridge' } });
  const current = { platforms: [existing] };
  let staged, saved = false;
  const hb = {
    disableSaveButton() {}, fixScrollHeight() {},
    async getPluginConfig() { return structuredClone([existing]); },
    async getPluginConfigSchema() { return require('../config.schema.json'); },
    async request(route, blocks) { assert.equal(route, '/prepare-config'); return prepareConfig(blocks, current, async () => true); },
    async updatePluginConfig(blocks) { staged = blocks; },
    async savePluginConfig() { assert(staged); saved = true; },
  };
  const script = fs.readFileSync(path.join(__dirname, '../homebridge-ui/public/settings.js'), 'utf8');
  await vm.runInNewContext(script, { window: { homebridge: hb }, document: { getElementById: id => ids[id], createElement: element } });
  assert.equal(ids['locks'].children.length, 1);
  ids['add-lock'].listeners.click();
  assert.equal(ids['locks'].children.length, 2);
  const fields = ids['locks'].children[1].children.flatMap(row => row.children || []).filter(node => node.id);
  const details = lock('Back');
  for (const field of fields) {
    const name = field.id.replace('lock-1-', '');
    if (name === 'webhookPort') continue;
    field.value = String(details[name]);
    field.listeners.input();
  }
  await ids['locks-form'].listeners.submit({ preventDefault() {} });
  assert.equal(saved, true);
  assert.deepEqual(staged[0], existing);
  assert(staged[1]._bridge);
  assert.notEqual(staged[0]._bridge.username, staged[1]._bridge.username);
  assert.notEqual(staged[0].webhookPort, staged[1].webhookPort);
  assert.equal(ids['save-locks'].disabled, false);
});
