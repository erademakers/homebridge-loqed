<span align="center">

# Loqed Homebridge Plugin

</span>

This plugin has been created to allow you to integrate your Loqed Touch smart lock with homebridge including battery levels and a low battery level warning.

Please note: This plugin has not currently been tested with multiple LOQED devices but is setup to allow this functionality.

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
docker exec -w /homebridge/node_modules/homebridge-loqed homebridge_running npm install --include=dev
docker restart homebridge_running
```

The source directory is bind-mounted into the container, so `dist/index.js` must
exist in that directory before Homebridge loads the plugin. The declared Node.js
versions include Node 18.16+ and Node 24.x.

## Setting up this plugin

When you first add this plugin you will need to go to the [Loqed API Website](https://app.loqed.com), sign in with your Loqed username and password and click 'API' in the top menu.

### Create an API Key

At the bottom of this API page you can add a new API key. You will need to create one per Loqed Touch device you wish to add to Homebridge.

Make a note of the key, token and Local Key ID alongside the Lock ID.

### Create a Bridge Webhook

The webhook from the Loqed bridge allows us to get updates when the lock is unlocked or locked manually or via a service that isn't the Apple Home app.

Back on the API page find 'Outgoing Webhooks via LOQED Bridge' and click 'Add/Delete Webhooks'

On the new page create a new webook with the IP address of your Homebridge Raspberry Pi pointing to port 4567 /webhook. Tick all the boxes for trigger

e.g. http://192.168.4.79:4567/webhook

Finally, make a note of your Loqed device IP address at the top of this page (It is a good idea to give your Loqed Bridge a static API on your home network)

### Configuring Homebridge

Using the information created in the last step go back into Homebridge and click 'Settings' for the Homebridge Loqed plugin and add the details from above for each Loqed device you wish to add. The name field on the settings page is the name you wish the device to appear as by default in Homebridge and the Home app.

### Support

This plugin has been developed as a hobby for personal use but I will try and help where I can and where time allows. You can contact me via [support@marktiddy.co.uk](mailto:support@marktiddy.co.uk) or via [@marktiddy](https://twitter.com/marktiddy) on Twitter/X

Finally, if this plugin has helped you out then [Buy me a Beer](http://buymeacoffee.com/marktiddy)
