<span align="center">

# Loqed Homebridge Plugin

</span>

This plugin has been created to allow you to integrate your Loqed Touch smart lock with homebridge including battery levels and a low battery level warning.

Multiple LOQED locks are supported using one platform configuration, a separate
child bridge, and a unique webhook port per lock. Automated tests cover separate webhook receivers; testing
with multiple physical locks is still required.

## Building from source

The plugin entry point is `dist/index.js`, which is generated from the TypeScript
sources. In this directory, run:

```sh
npm install --include=dev
```

The `prepare` script automatically runs the build after installation. If the
dependencies are already installed, or after editing the source, run
`npm run build` explicitly. Development dependencies are required for the build.

For this repository's Docker setup, you can build with the Node.js installation
inside the running Homebridge container:

```sh
docker exec -w /homebridge/node_modules/@marktiddy/homebridge-loqed homebridge_running npm install --include=dev
docker restart homebridge_running
```

The source directory is bind-mounted into the container, so `dist/index.js` must
exist in that directory before Homebridge loads the plugin. The declared Node.js
versions include Node 18.16+ and Node 24.x.

### Homebridge UI configuration

The Docker mount must match the scoped package name:
`/homebridge/node_modules/@marktiddy/homebridge-loqed`. The UI looks for
`config.schema.json` under this path. Mounting the plugin at
`/homebridge/node_modules/homebridge-loqed` allows Homebridge to load it but
prevents the UI from finding the configuration form.

After changing the volume mapping, recreate the Homebridge container (a restart
does not apply changed mounts). From this repository's `DockerCompose` directory:

```sh
docker compose up -d --no-deps homebridge
```

Then refresh the Homebridge UI and open the plugin settings.

Use **Settings** to open the plugin's custom configuration form. Click **Add
lock / Slot toevoegen**, enter the lock details, and click **Save / Opslaan** in
the form. The plugin automatically assigns every lock without a child bridge a
unique bridge username and an available HomeKit port. Leave `webhookPort` empty
to allocate an available webhook port automatically. Existing bridge identities
and configured ports are preserved when editing.

After saving, restart all of Homebridge, pair each new child bridge with Apple
Home, and configure each LOQED bridge's webhook URL with the displayed port.

The separate **JSON Config** editor remains a manual editor: it initially creates
only `platform` and `name`, and does not run the automatic assignment. A complete
JSON template is shown below that editor; when configuring multiple locks there,
each block needs its own `_bridge` as illustrated below.

## Setting up this plugin

When you first add this plugin you will need to go to the [Loqed API Website](https://app.loqed.com), sign in with your Loqed username and password and click 'API' in the top menu.

### Create an API Key

At the bottom of this API page you can add a new API key. You will need to create one per Loqed Touch device you wish to add to Homebridge.

Make a note of the key, token and Local Key ID alongside the Lock ID.

### Create a Bridge Webhook

The webhook from the Loqed bridge allows us to get updates when the lock is unlocked or locked manually or via a service that isn't the Apple Home app.

Back on the API page find 'Outgoing Webhooks via LOQED Bridge' and click 'Add/Delete Webhooks'

On the new page create a new webhook with the IP address of your Homebridge host
pointing to the configured `webhookPort` and `/webhook`. The default port is 4567.
Tick all the boxes for trigger

e.g. http://192.168.4.79:4567/webhook

Finally, make a note of your Loqed device IP address at the top of this page (It is a good idea to give your Loqed Bridge a static API on your home network)

### Configuring Homebridge

Using the information created in the last step go back into Homebridge and click 'Settings' for the Homebridge Loqed plugin and add the details from above for each Loqed device you wish to add. The name field on the settings page is the name you wish the device to appear as by default in Homebridge and the Home app.

### Configuration parameters

Sign in at [app.loqed.com](https://app.loqed.com), open the API section, and
view the API key you added for your lock. Its details contain the values for
`lockID`, `localKeyID`, `key`, and `token`. Copy these values into the
corresponding Homebridge configuration fields.

| Parameter | Meaning |
|---|---|
| `platform` | Always `"HomebridgeLoqed"`. This identifies the plugin to Homebridge. |
| `name` | The name of the lock in Homebridge and the Apple Home app, for example `"Front door"`. |
| `lockID` | The unique ID of your LOQED lock. Copy it from the LOQED API settings. |
| `localKeyID` | The numeric ID of the API key you created. Use the actual value from LOQED; `1` in the examples is only a placeholder. |
| `key` | The secret key associated with your LOQED API key. The plugin uses it to sign lock commands. |
| `token` | The API token used to retrieve the lock status and send commands. |
| `bridgeIP` | The local IP address of this lock's **LOQED bridge**. The plugin uses it to verify the source of webhook updates. Assign the bridge a fixed IP address where possible. |
| `webhookPort` | The port on **Homebridge** that receives webhook updates for this lock. Defaults to `4567`; use a unique port for each lock. |

With `"webhookPort": 4567`, configure the outgoing webhook on the corresponding
LOQED bridge with this URL:

```text
http://<homebridge-ip>:4567/webhook
```

The hostname or IP in this URL belongs to **Homebridge**, whereas `bridgeIP`
belongs to the **LOQED bridge**. For each lock, use its own lock ID, API key
information, and bridge IP. The port in the webhook URL must match that lock's
`webhookPort`.

### Multiple locks

The custom **Settings** form adds a separate `HomebridgeLoqed` platform entry
for each lock and automatically fills in missing child bridge settings.
When editing JSON manually, add a separate entry for each lock yourself.
Each entry needs its own lock ID, API credentials, bridge IP, and **unique
`webhookPort`**. Each lock also needs its own **child bridge** (`_bridge`) with a
unique `username` and HomeKit `port`: Homebridge allows this dynamic platform only
once per bridge. Putting both entries on the main bridge causes a "configured
multiple times" error. Webhook ports must remain unique even across child bridges
or Docker containers that use host networking.

For example, these two entries can be added to Homebridge's `platforms` array:

```json
[
  {
    "platform": "HomebridgeLoqed",
    "name": "Front door",
    "lockID": "FRONT_DOOR_LOCK_ID",
    "localKeyID": 1,
    "key": "FRONT_DOOR_KEY",
    "token": "FRONT_DOOR_TOKEN",
    "bridgeIP": "192.168.4.80",
    "webhookPort": 4567,
    "_bridge": {
      "username": "0E:37:D7:8B:D9:89",
      "port": 32776,
      "name": "Loqed Front door"
    }
  },
  {
    "platform": "HomebridgeLoqed",
    "name": "Back door",
    "lockID": "BACK_DOOR_LOCK_ID",
    "localKeyID": 1,
    "key": "BACK_DOOR_KEY",
    "token": "BACK_DOOR_TOKEN",
    "bridgeIP": "192.168.4.81",
    "webhookPort": 4568,
    "_bridge": {
      "username": "0E:37:D7:8B:D9:90",
      "port": 32777,
      "name": "Loqed Back door"
    }
  }
]
```

The `_bridge.port` is the HomeKit port; it is different from `webhookPort`.
Choose unused HomeKit ports and unique bridge usernames for your installation.
After saving, restart all of Homebridge so every platform entry is loaded, then
pair each child bridge with Apple Home using its Homebridge UI QR code.

Configure the outgoing webhook on each LOQED bridge to match its port:

- Front door: `http://192.168.4.79:4567/webhook`
- Back door: `http://192.168.4.79:4568/webhook`

Replace the example IPs and credentials with your own values. Existing single-lock
configurations without `webhookPort` continue to use port 4567. Restart Homebridge
after changing the configuration. If a port is already in use, the plugin logs an
error identifying the lock and port; choose an available port and update the
bridge webhook URL accordingly.

### Tests

Run `npm test` to build and exercise the webhook receivers with simulated locks.
The tests do not contact LOQED or send commands to a physical lock.

### Support

This plugin has been developed as a hobby for personal use but I will try and help where I can and where time allows. You can contact me via [support@marktiddy.co.uk](mailto:support@marktiddy.co.uk) or via [@marktiddy](https://twitter.com/marktiddy) on Twitter/X

Finally, if this plugin has helped you out then [Buy me a Beer](http://buymeacoffee.com/marktiddy)
