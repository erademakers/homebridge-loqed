const { readFile } = require('node:fs/promises');
const { prepareConfig } = require('./prepare-config.cjs');

async function start() {
  const { HomebridgePluginUiServer, RequestError } = await import('@homebridge/plugin-ui-utils');
  class LoqedUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.onRequest('/prepare-config', async blocks => {
      try {
        const currentConfig = JSON.parse(await readFile(this.homebridgeConfigPath, 'utf8'));
        return await prepareConfig(blocks, currentConfig);
      } catch (error) {
        throw new RequestError(error.message);
      }
    });
    this.ready();
  }
}
  new LoqedUiServer();
}
start().catch(error => { console.error(error.message); process.exitCode = 1; });
