## Knou calendar v1.6.7 — Widget v1.2.0

The extension behaves the same as 1.6.6. Only the bundled iPad/iPhone widget script changed, to **KnouWidget v1.2.0**.

### ⚠️ Widget Parameter values changed
| View | Before | v1.2.0 |
| --- | --- | --- |
| Course grid | empty or `a` | empty |
| Soonest-deadline summary | `b` | `0` |
| Picked course(s) large | `1`, `1,2` | unchanged |

**`a` and `b` are gone. Edit any widget set to `b` and change its Parameter to `0`; change `a` to empty.** Otherwise it shows a "no matching course" notice. Size words still work (e.g. `크게`, `0 작게`, `1,2 아주 크게`).

### Widget v1.2.0
- **When you pick a course to view large, notes fill the card.** The font size stays the same, and overflow is cut with "…". Tap to see everything on the course screen.
- **Fixed the course grid being cut off at the top and bottom.** The formative-assessment line and "N more courses" now share one line, with tighter spacing.
- **A copy button on the course screen** (과제 내용 복사) copies that course's notes.

### How to update
1. Update the extension to 1.6.7 (extract the Chromium zip over the same place and press reload ↻ on the extensions page) and sync once. The extension uploads widget v1.2.0 to Dropbox.
2. Run KnouWidget once in Scriptable on your iPad; widget v1.1.0 or later replaces itself with v1.2.0.
3. Change your widget Parameters as in the table above.

### Assets
- `knou_calendar_chromium.zip`: for Chrome, Edge, Whale, and Opera.
- `knou_calendar_firefox.zip`: package for Mozilla signing (Firefox).
- `KnouWidget.js`: the iPad/iPhone Scriptable widget script (v1.2.0).
