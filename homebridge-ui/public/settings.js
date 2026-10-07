(async () => {
  const hb = window.homebridge;
  const form = document.getElementById('locks-form');
  const container = document.getElementById('locks');
  const status = document.getElementById('status');
  const add = document.getElementById('add-lock');
  const save = document.getElementById('save-locks');
  hb.disableSaveButton();
  add.disabled = save.disabled = true;
  let blocks;
  let schema;
  function render() {
    container.replaceChildren();
    blocks.forEach((block, index) => {
      const card = document.createElement('fieldset');
      card.className = 'card p-3 mb-3';
      const legend = document.createElement('legend');
      legend.textContent = block.name || `Lock ${index + 1}`;
      card.append(legend);
      for (const [field, definition] of Object.entries(schema.schema.properties)) {
        if (field === '_bridge' || field === 'platform') continue;
        const row = document.createElement('div');
        row.className = 'mb-3';
        const label = document.createElement('label');
        const id = `lock-${index}-${field}`;
        label.htmlFor = id;
        label.className = 'form-label';
        label.textContent = definition.title || field;
        const input = document.createElement('input');
        input.id = id;
        input.className = 'form-control';
        input.type = ['key', 'token'].includes(field) ? 'password' : ['number', 'integer'].includes(definition.type) ? 'number' : 'text';
        input.autocomplete = ['key', 'token'].includes(field) ? 'new-password' : 'off';
        input.value = block[field] ?? '';
        input.required = field !== 'webhookPort';
        if (input.type === 'number') { input.step = '1'; input.min = field === 'webhookPort' ? '1' : '0'; }
        if (field === 'webhookPort') { input.max = '65535'; input.placeholder = 'Automatic / Automatisch'; }
        input.addEventListener('input', () => {
          if (input.value === '' && field === 'webhookPort') delete block[field];
          else block[field] = input.type === 'number' ? Number(input.value) : input.value;
          if (field === 'name') legend.textContent = input.value || `Lock ${index + 1}`;
        });
        row.append(label, input);
        card.append(row);
      }
      if (block._bridge) {
        const info = document.createElement('p');
        info.className = 'small';
        info.textContent = `Child bridge: ${block._bridge.name || block.name} — HomeKit port ${block._bridge.port}. Webhook URL: http://<homebridge-ip>:${block.webhookPort}/webhook`;
        card.append(info);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-outline-danger align-self-start';
      remove.textContent = 'Remove lock / Slot verwijderen';
      remove.addEventListener('click', () => { blocks.splice(index, 1); render(); });
      card.append(remove);
      container.append(card);
    });
    hb.fixScrollHeight();
  }
  add.addEventListener('click', () => {
    blocks.push({ platform: 'HomebridgeLoqed', name: `Lock ${blocks.length + 1}` });
    render();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    add.disabled = save.disabled = true;
    status.textContent = 'Preparing child bridges…';
    try {
      const prepared = await hb.request('/prepare-config', blocks);
      await hb.updatePluginConfig(prepared);
      await hb.savePluginConfig();
      blocks = prepared;
      render();
      status.textContent = 'Saved. Restart all of Homebridge to load the new configuration, then pair any new child bridge with Apple Home. Set each LOQED webhook URL to the displayed port.';
    } catch (error) {
      status.textContent = error.message || 'Unable to save the configuration.';
    } finally { add.disabled = save.disabled = false; }
  });
  try {
    [blocks, schema] = await Promise.all([hb.getPluginConfig(), hb.getPluginConfigSchema()]);
    if (!blocks.length) blocks.push({ platform: 'HomebridgeLoqed', name: 'Lock 1' });
    render();
    add.disabled = save.disabled = false;
  } catch (error) { status.textContent = error.message || 'Unable to load the configuration.'; }
})();
