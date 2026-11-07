## Knou calendar v1.4.2 — Simpler Dropbox connection

The Dropbox app key is now built into the extension. You no longer need to create your own Dropbox app: just click [연결] (Connect) in Settings to use the Dropbox export for widgets.

### Changes
- Settings → **4. Dropbox 내보내기** (Dropbox export) now shows only the connection status and the Connect, Export now, and Disconnect buttons.
- The app key field and redirect address for using your own Dropbox app moved to Settings → **5. 고급** (Advanced). A key entered there takes precedence over the built-in key.

### Assets
- `knou_calendar_chromium.zip`: for Chrome, Edge, Whale, and Opera. Extract it and load the `knou_calendar_chromium` folder with "Load unpacked", or overwrite your existing folder and reload the extension.
- `knou_calendar_firefox.zip`: package for Mozilla signing (Firefox).

### Notes
- Your settings and connections (Google and Dropbox) are kept. If you connected with your own app key in 1.4.0–1.4.1, that connection keeps working.
- The extension's Dropbox app is still in development status, so the number of users who can connect is limited.
