## Knou calendar v1.3.0 — First public release

A browser extension that automatically copies attendance class, midterm/final, and formative assessment schedules from KNOU's MyKNOU into a dedicated Google Calendar.

### Features
- Reads your course schedules from the MyKNOU dashboard and adds them to a "방통대 학사일정" calendar in Google Calendar.
- Converts attendance class locations to official names that Google Maps can find. You can also override them manually.
- Detects campus/schedule changes and dropped courses, and replaces or removes only the affected courses after you review a preview.
- The popup shows upcoming tasks per course with D-day counters and links to the matching KNOU pages.
- Guides you when your KNOU session expires or a Google connection is needed, and resumes once resolved.

### Assets
- `knou_calendar_chromium.zip`: for Chrome, Edge, Whale, and Opera. Extract it and install with "Load unpacked".
- `knou_calendar_firefox.zip`: package for Mozilla signing (Firefox).

### Notes
- The Google app is in testing mode, so **only Gmail accounts registered by the developer** can connect.
- On first connection, **check the calendar item** on the permissions screen.
- Sync is triggered from the popup button. Automatic periodic sync is not available yet.
