## Knou calendar v1.6.1 — Widget v1.1.0

The extension behaves the same as 1.6.0. Only the bundled iPad/iPhone widget script changed, to **KnouWidget v1.1.0**.

### Widget v1.1.0
- Uses the assignment notes (`notes`) written by the extension first. If you edited notes in the widget or Notepad and haven't synced on the PC yet, it reads `knou_scope.txt` from Dropbox directly to show the latest content.
- **Widget self-update**: when you run KnouWidget in the Scriptable app and the extension has uploaded a higher version to Dropbox, the widget replaces itself. You can also check from the menu with [업데이트 확인] (Check for updates).

### How to update
1. Update the extension to 1.6.1 and sync once. The extension uploads widget v1.1.0 to Dropbox.
2. Widget v1.0.0 cannot update itself, so copy it **one more time**: Files app → Dropbox › Apps › KnouWidget → copy `KnouWidget.js` and paste it into iCloud Drive › Scriptable, replacing the old one.
3. From the next version on, running KnouWidget in Scriptable updates it automatically.

### Assets
- `knou_calendar_chromium.zip`: for Chrome, Edge, Whale, and Opera. Extract it one level above the folder your browser loads, overwrite, and press reload (↻) on the extensions page.
- `knou_calendar_firefox.zip`: package for Mozilla signing (Firefox).
- `KnouWidget.js`: the iPad/iPhone Scriptable widget script (v1.1.0).
