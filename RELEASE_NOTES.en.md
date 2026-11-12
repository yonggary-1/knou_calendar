## Knou calendar v1.6.2 — Assignment notes without Dropbox, txt export

### What's new
- **Assignment notes work without Dropbox.** If Dropbox is not connected, notes are saved in this browser and still go into Google Calendar event descriptions. With browser sync on, other PCs on the same Google account see them in Chrome too. The popup's **📝 과제 메모** button is always shown.
- **With Dropbox connected, nothing changes.** `knou_scope.txt` is still the source, and every read and save is now also backed up to the browser.
  - If Dropbox is unreachable, the editor shows the backup and lets you save. It is uploaded automatically once Dropbox is reachable again.
  - If the file was also edited in the widget or Notepad meanwhile, nothing is overwritten and you choose which side to keep.
- Notes written without Dropbox move into `knou_scope.txt` as they are when you connect Dropbox later.
- The editor has a new **txt 내보내기** (Export txt) button. It opens a save dialog and saves what's on screen as `knou_scope_<semester>.txt`.
- The editor shows where notes are saved (Dropbox / this browser / this browser's backup) under its title.

### How to update
Extract `knou_calendar_chromium.zip` one level above the folder your browser loads, overwrite, and press reload (↻) on the extensions page. The widget is unchanged (v1.1.0).

### Assets
- `knou_calendar_chromium.zip`: for Chrome, Edge, Whale, and Opera.
- `knou_calendar_firefox.zip`: package for Mozilla signing (Firefox). From this version it asks for the downloads permission, used by txt export.
- `KnouWidget.js`: the iPad/iPhone Scriptable widget script (v1.1.0).
