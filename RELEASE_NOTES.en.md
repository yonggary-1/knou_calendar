## Knou calendar v1.4.0 — Dropbox export for widgets

Synced upcoming tasks can now be saved to Dropbox, so other apps such as an iPad Scriptable widget can show schedules together with assignment and exam scope. If you don't use it, the extension behaves exactly like 1.3.0.

### New
- Added **4. Dropbox 내보내기** (Dropbox export) to Settings. Enter the app key of your own Dropbox app (App folder) and connect.
- Every sync overwrites `knou_agenda.json` in the app folder with the upcoming task list. A [지금 내보내기] (Export now) button saves it immediately.
- A scope template `knou_scope.json` is filled with your courses **only when the file does not exist**. The extension never edits it afterwards, so you can edit it freely in Notepad on Windows or in a widget app.
- When the semester changes, the old scope file is moved to the `archive` folder and a new template is created.

### Assets
- `knou_calendar_chromium.zip`: for Chrome, Edge, Whale, and Opera. Extract it and install with "Load unpacked", or overwrite your existing folder and reload the extension.
- `knou_calendar_firefox.zip`: package for Mozilla signing (Firefox).

### Notes
- Register the address shown in the extension settings under **Redirect URIs** in your Dropbox app settings, or the connection will fail.
- If the Dropbox export fails, the Google Calendar sync still completes. The reason is shown in Settings.
