const assert = require('node:assert/strict');
const { test } = require('node:test');
const axios = require('axios');
const { getLoqed } = require('../dist/api');

test('API logs cover status and commands, HTTP failures and network failures without secrets', async t => {
  const original = axios.get;
  t.after(() => { axios.get = original; });
  for (const endpoint of ['lock_status.php', 'lock_command.php']) {
    const data = {
      bolt_state_numeric: 3, battery_percentage: 76,
      nested: { api_token: 'secret-token', key: 'secret-key', secret: 'secret-response' },
      message: 'echo secret-token secret-command',
    };
    for (const failure of [undefined, new axios.AxiosError('secret-token', 'ERR_BAD_RESPONSE', {}, {}, { status: 403, data }),
      new axios.AxiosError('secret-token', 'ECONNREFUSED')]) {
      const entries = [];
      const log = {
        info(message) { entries.push(['info', message]); },
        warn(message) { entries.push(['warn', message]); },
      };
      const url = `https://app.loqed.com/API/${endpoint}?api_token=secret-token&lock_id=test-lock&command_signed_base64=secret-command`;
      axios.get = async requested => {
        assert.equal(requested, url);
        if (failure) throw failure;
        return { status: 200, data };
      };
      if (failure) await assert.rejects(getLoqed(url, log), error => error === failure);
      else assert.equal((await getLoqed(url, log)).status, 200);
      assert.equal(entries.length, 2);
      assert.equal(entries[0][0], 'info');
      assert.equal(entries[1][0], failure ? 'warn' : 'info');
      const output = entries.map(entry => entry[1]).join('\n');
      assert.ok(output.includes(`GET https://app.loqed.com/API/${endpoint}?lock_id=test-lock`));
      assert.doesNotMatch(output, /secret-token|secret-command|secret-response|secret-key/);
      assert.match(entries[1][1], /\(\d+ ms\)/);
      if (!failure || failure.response) {
        assert.match(output, /response: /);
        assert.match(output, /"bolt_state_numeric":3/);
        assert.match(output, /"battery_percentage":76/);
        assert.match(output, /\[REDACTED\]/);
      } else {
        assert.doesNotMatch(output, /response: /);
      }
      assert.ok(output.includes(failure ? (failure.response ? 'HTTP 403' : 'no HTTP response') : 'HTTP 200'));
    }
  }
});
