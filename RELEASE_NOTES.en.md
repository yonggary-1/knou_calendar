## Knou calendar v1.6.6 — Merged attendance-class assessments, description notes switch

### What's new
- **Attendance-class assessments are merged into the attendance-class event.** When an assessment with a one-day submission period (usually 출석수업 맞춤형평가) falls on the same day as that course's attendance class, no separate event is created; the class event's title ends with `· 맞춤형평가` and its description shows the assessment time. The popup's upcoming list shows it as one line too. If the dates differ, it is still added separately. Midterm and final exams are never merged.
  - In the next sync preview, the old assessment events show up as **delete** and the merged class events as **replace**; applying cleans them up.
- **Choose whether notes go into event descriptions.** Turn off "과제 메모를 일정 설명란에 넣기" (Put assignment notes in event descriptions, on by default) in Settings → 2. 캘린더. The next sync removes only the notes from descriptions. Events are not recreated, so reminders don't fire again, and the notes stay in the editor and the widget.

### How to update
Extract `knou_calendar_chromium.zip` one level above the folder your browser loads, overwrite, and press reload (↻) on the extensions page. The widget is unchanged (v1.1.2).

### Assets
- `knou_calendar_chromium.zip`: for Chrome, Edge, Whale, and Opera.
- `knou_calendar_firefox.zip`: package for Mozilla signing (Firefox).
- `KnouWidget.js`: the iPad/iPhone Scriptable widget script (v1.1.2).
