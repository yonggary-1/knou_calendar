## Knou calendar v1.4.1 — Fixes for 1.4.0

The Dropbox export from 1.4.0 is unchanged. This release fixes packaging and stability.

### Fixes
- The **Chromium package layout** is back to the 1.3.0 form. Extracting it creates a `knou_calendar_chromium` folder; select that folder with "Load unpacked".
- Opening the Dropbox connection window while a Google sign-in window is open no longer fails with an error. You now get a message telling you what to do.
- If Dropbox stops responding, the sync is marked complete after 30 seconds, so the calendar sync no longer gets stuck at "applying".

### Assets
- `knou_calendar_chromium.zip`: for Chrome, Edge, Whale, and Opera. Extract it and install the `knou_calendar_chromium` folder with "Load unpacked", or overwrite your existing folder and reload the extension.
- `knou_calendar_firefox.zip`: package for Mozilla signing (Firefox).

### Notes
- Your settings and connections (Google, Dropbox) are kept.
- To use Dropbox on Firefox, also register **the address shown in the Firefox settings page** under Redirect URIs in your Dropbox app. It differs from the Chromium address.
