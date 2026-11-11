## Knou calendar v1.6.0 — Assignment notes and the iPad widget

### New
- **📝 Assignment notes (과제 메모)**: a button at the bottom of the popup opens a full-size editor. Write midterm / final / course notes per course and save; they go to `knou_scope.txt` in Dropbox and show up in the widget right away. It is the same file you edit in the iPad widget or Notepad, and if someone else saved while you were editing, the editor does not overwrite it.
- **Assignment notes in Google Calendar descriptions.** Assessment notes go into that assessment's submission-period event (the exam event for exam-type assessments); course memos go into every event of that course. When only notes change, only descriptions are edited and events are not recreated, so reminders don't fire again.
- **iPad/iPhone widget (KnouWidget v1.0.0)** is placed in Dropbox by the extension. Copy it once from the Files app into the Scriptable folder; see Settings → 4. Dropbox 내보내기 or the README.

### Changed
- The notes template is now `knou_scope.txt`. `knou_scope.json` is no longer created; an existing one is kept.
- When the semester changes, old notes are moved to the `archive` folder and a new template is created.

### Assets
- `knou_calendar_chromium.zip`: for Chrome, Edge, Whale, and Opera. Extract it one level above the folder your browser loads, overwrite, and press reload (↻) on the extensions page.
- `knou_calendar_firefox.zip`: package for Mozilla signing (Firefox).
- `KnouWidget.js`: the iPad/iPhone Scriptable widget script.

### Notes
- Your settings and connections (Google, Dropbox) are kept. The first sync after updating only edits the descriptions of events whose course has notes; no events are recreated.
