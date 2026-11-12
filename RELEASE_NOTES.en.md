## Knou calendar v1.6.5 — Popup cleanup, account settings, past items

### What's new
- **More room in the popup.** The top line shows 방통대 · 구글 · Dropbox (KNOU · Google · Dropbox) in one small row, with a green or red dot for login/connection status. Tighter spacing and lower buttons give the upcoming-task list more height.
- **Accounts live in Settings.** Connect, switch, and disconnect Google and Dropbox (optional) under **1. 계정** (Accounts) at the top of Settings.
  - This screen opens after installation.
  - Pressing sync without Google connected also takes you there.
  - KNOU login works as before: the extension opens the browser login page and continues automatically after you log in.
- **Past items.** Click **지난 일정 n건 ▾** (Past n) next to the upcoming list to see finished items, dimmed, in each course card. Choose **최근 2주** (last 2 weeks) or **이번 학기 전부** (whole semester) in Settings → 2. 캘린더.
- **Result messages show once.** Messages like "applied" or "no changes" disappear the next time you open the popup.
- **Save button at the top of Settings.** The title bar stays at the top of the page with **저장** (Save) in it. Unsaved changes are flagged, and closing the page with unsaved changes asks for confirmation.

### How to update
Extract `knou_calendar_chromium.zip` one level above the folder your browser loads, overwrite, and press reload (↻) on the extensions page. Your Google and Dropbox connections and assignment notes are kept. The widget is unchanged (v1.1.2).

### Assets
- `knou_calendar_chromium.zip`: for Chrome, Edge, Whale, and Opera.
- `knou_calendar_firefox.zip`: package for Mozilla signing (Firefox).
- `KnouWidget.js`: the iPad/iPhone Scriptable widget script (v1.1.2).
