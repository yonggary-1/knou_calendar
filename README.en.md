English | [한국어](README.md)

# Knou calendar

A browser extension that automatically copies **attendance classes, midterm, final, and formative assessment schedules** from MyKNOU (Korea National Open University) into a dedicated Google Calendar. When a class location or schedule changes, only the changed parts are updated. It was built so that KNOU students can see when, where, and what they need to do in one calendar and one extension popup.

> This is an **unofficial, personal tool** and is not affiliated with KNOU.

## Features

- **Automatic registration**: reads your course schedules from the MyKNOU dashboard and adds them to a "방통대 학사일정" calendar in Google Calendar.
  - Attendance classes: class time and place. The place is converted to an official name that Google Maps can find, e.g. `한국방송통신대학교 서울남부학습센터`.
  - Assignment-type assessments: submission period (all-day event), a deadline event, and reminders.
  - Exam-type assessments: exam time. It is added at the next sync once the date is announced.
  - Formative assessment: study period and deadline.
- **Change tracking**: detects campus changes, schedule changes, and dropped courses, and replaces or removes only the affected course's events. You review a preview before anything is applied.
- **Assignment notes**: write per-course assignment topics and exam scope; they go into Google Calendar event descriptions. Works without Dropbox (saved in the browser), and you can export them to a txt file.
- **Widget (optional)**: with Dropbox connected, the notes become `knou_scope.txt` in Dropbox so you can also edit them in the iPad widget or Notepad. Every sync exports upcoming tasks and notes for the widget and puts the widget script (KnouWidget) in Dropbox.
- **Upcoming tasks**: the extension popup lists remaining tasks per course with a D-day counter, and each item links to the matching KNOU page.
- **Safety**
  - Events you created yourself and events from past semesters are never touched.
  - If no course could be read, it asks for confirmation before deleting anything.
  - If your KNOU session expires, it resumes automatically after you log in again.

## Requirements

- **Chromium-based browsers 116+**: Chrome, Edge, Whale, Opera (Windows, macOS, Linux desktop)
- **Firefox 140+**
- A MyKNOU (m.knou.ac.kr) account and a Google account
- Mobile browsers are not supported. Events you sync appear in the Google Calendar app on your phone as usual.

## Installation

### Chrome · Edge · Whale · Opera

1. Download `knou_calendar_chromium.zip` from [Releases](https://github.com/yonggary-1/knou_calendar/releases) and extract it anywhere. For example, extracting to `C:\Tools` creates a `C:\Tools\knou_calendar_chromium` folder.
   - Keep this folder; the extension runs from it.
2. Open `chrome://extensions`. For other browsers use `edge://extensions`, `whale://extensions`, or `opera://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the `knou_calendar_chromium` folder. To update, extract over the same place and press reload (↻) on the extensions page.

### Firefox

`knou_calendar_firefox.zip` is the package for Mozilla signing. See the [developer guide (Korean)](docs/DEVELOPER.md) for how to sign it.

## Usage

1. Settings opens after installation. In **1. 계정** (Accounts), click **연결** (Connect) for Google. You can do this later; pressing sync without Google connected opens this screen again.
   - On the "Google hasn't verified this app" warning, choose **Continue** (or **Advanced → Go to Knou calendar**).
   - On the permissions screen, **make sure the calendar item is checked**.
2. Log in to MyKNOU (m.knou.ac.kr). If you press sync while logged out, the extension opens the login page and continues automatically after you log in.
3. Click the extension icon → **동기화 확인** (Check sync), review the preview, and click **반영** (Apply).

After that, just use **동기화 확인 → 반영** whenever your schedule changes.

### Popup

- The dots before **방통대 · 구글 · Dropbox** on the top line show login/connection status: green means OK, red means not (KNOU not checked yet; Dropbox not connected or export failed). Hover for details such as the account. If you don't use Dropbox, you can hide it from the popup in Settings.
- Result messages (applied, no changes, cancelled, …) are shown once. They disappear the next time you open the popup; the last sync time stays under the sync button.
- **지난 일정 n건 ▾** (Past n) to the right of **남은 일정** (Upcoming) adds past items, dimmed, to each course card. Choose the range in Settings → 2. 캘린더 → **팝업에서 펼칠 지난 일정**: **최근 2주** (last 2 weeks, default) or **이번 학기 전부** (whole semester).

### Settings

- **1. 계정** (Accounts): Google (connect / switch account / disconnect) and Dropbox (optional). Connecting and disconnecting here apply immediately.
- Everything else applies when you click **저장** (Save) at the top of the page, or press `Ctrl+S`. Unsaved changes are flagged next to the button, and closing the page with unsaved changes asks for confirmation.

### About the Google connection

- The extension's Google app is currently in **testing mode**. Only Gmail accounts added as test users by the developer can connect. Other accounts get an `access_denied` error. To use it, ask the developer to add you, or create [your own OAuth client](docs/DEVELOPER.md).
- The permission scope is limited to **calendars created by this extension**. It cannot read or change your other calendars.

### Dropbox export and widget (optional)

Use this only if you want the iPad/iPhone widget (KnouWidget) to show schedules together with your assignment notes. Nothing changes if you don't set it up.

1. Click **연결** (Connect) for Dropbox (optional) in Settings → **1. 계정** (Accounts).
2. Click **Allow** in the Dropbox window. The Dropbox app key is built into the extension, so there is nothing to enter.

Once connected, the popup button becomes **동기화 확인 & Dropbox 내보내기** (Check sync & export to Dropbox). That one button syncs the calendar and exports. If an export fails, the Dropbox dot on the popup's top line turns red; press the button again to retry. If you don't use Dropbox, check **연결하지 않을 때 팝업에서 Dropbox 숨기기** (Hide Dropbox in the popup when not connected) in Settings → 1. 계정.

The files live in `Apps › KnouWidget` in your Dropbox (with the Dropbox desktop app on Windows: `%USERPROFILE%\Dropbox\Apps\KnouWidget\`).

| File | Contents | Who edits it |
| --- | --- | --- |
| `knou_scope.txt` | **Assignment notes** — per-course midterm/final notes and a course memo | You (popup 📝 과제 메모, the widget, Notepad). The extension only creates it when missing (from notes saved in the browser, if any) |
| `knou_agenda.json` | The popup's upcoming tasks + `notes` parsed from the assignment notes | The extension (on every sync and whenever you save notes) |
| `KnouWidget.js` | The widget script | The extension (only when missing or a different version) |

### Assignment notes

Click **📝 과제 메모** at the bottom of the popup to open a full-size editor. For each course, type plain text into **중간평가 / 기말평가 / 과목 메모** (midterm / final / course memo) and click **저장** (Save) or press `Ctrl+S`. Dropbox is not required.

| State | Where notes are saved (shown under the editor title) |
| --- | --- |
| Dropbox not connected | **This browser** — if browser sync is on, other PCs signed in to the same Google account see them in Chrome too |
| Dropbox connected | **`knou_scope.txt` in Dropbox** — every read and save is also backed up to this browser |
| Connected but Dropbox unreachable right now | Shows **this browser's backup**; saving stores it in the browser. When Dropbox is reachable again (next sync or when you reopen the editor), it is uploaded automatically |

- Notes written without Dropbox move into `knou_scope.txt` as they are when you connect Dropbox later.
- If you edited in the browser while Dropbox was unreachable and the file was also edited in the widget or Notepad meanwhile, nothing is overwritten; the editor asks you to choose **Dropbox 내용 쓰기** (use Dropbox) or **브라우저 내용으로 Dropbox 덮어쓰기** (overwrite Dropbox with the browser's). The browser copy is kept aside even if you pick Dropbox.
- The browser can hold about 100 KB (about 30,000 Korean characters). Connect Dropbox for longer notes.
- **txt 내보내기** (Export txt) opens a save dialog and saves what's on screen (including unsaved changes) as `knou_scope_<semester>.txt`, in the same format as `knou_scope.txt`.

- The widget picks up a save immediately. Google Calendar descriptions are updated **at the next sync**:
  - **Assessment notes** go into that assessment's **submission-period** event (the exam event for exam-type assessments), not the deadline event. If there is no submission-period event (turned off in Settings, or a one-day period), they go into the deadline event instead.
  - **Course memos** go into every event of that course, including attendance classes.
  - When only notes change, only the descriptions are edited; events are not recreated, so reminders don't fire again.
- You can also edit the same file in the widget or in Notepad. If someone else saved while you were editing, the editor does not overwrite it; **새 내용 불러오고 내 변경 다시 채우기** (Reload and re-apply my changes) keeps both.
- Format when editing by hand: a course line must match the MyKNOU course name (spaces are ignored). Lines above the first course (the header) are not shown in the widget.

  ```
  2026-2학기 과제 메모 — 첫 과목명 위에 적은 내용은 위젯에 나오지 않습니다.

  인간과사회
  교재 2026 개정판 사용            ← course memo (right under the course name)
  중간평가:
  기말평가: 교재 3장의 사회 계층 이론으로 사례 분석
  A4 3쪽 내외, 참고문헌 2개 이상    ← multiple lines are fine
  ```

- When the semester changes, the old file is moved to `archive\knou_scope_<semester>.txt` and a new template is created. The semester is read from **`2026-2학기` at the start of the header's first line**. If you remove the header, the extension treats the file as yours and leaves it alone.
- `knou_scope.json` (used up to 1.5.0) is no longer created. An existing file is kept, and the editor starts from it when `knou_scope.txt` does not exist yet.

### Installing the iPad/iPhone widget (once)

1. Install **Scriptable** from the App Store and open it once.
2. Connect Dropbox as above and sync once. The extension puts `KnouWidget.js` in `Apps › KnouWidget`.
3. In the **Files** app → **Dropbox** → **Apps › KnouWidget**, long-press `KnouWidget.js` and choose **Copy**.
4. Paste it into **iCloud Drive › Scriptable**. Keep the name `KnouWidget.js` (case-sensitive).
5. Run **KnouWidget** once in Scriptable to connect Dropbox, then add a Scriptable widget to your home screen and choose KnouWidget as its script.

Other apps cannot write into the Scriptable folder, so steps 3–4 must be done by hand. From widget v1.1.0 on, running KnouWidget in Scriptable **updates it automatically** to the newer version the extension uploaded, so you only copy it once (if you were on v1.0.0, copy v1.1.0 one more time). The widget script is also available from [Releases](https://github.com/yonggary-1/knou_calendar/releases/latest/download/KnouWidget.js).

The extension's Dropbox app is still in **development** status, which limits how many users can connect. If the connection is refused, you can put the key of [your own Dropbox app](docs/DEVELOPER.md) into Settings → Advanced.

## Privacy

- Data read from KNOU is stored **only in your browser and your own Google Calendar**, plus your own Dropbox app folder if you turn on the Dropbox export. Nothing is sent to any other server.
- Assignment notes are kept in the browser's extension sync storage (`storage.sync`). If browser sync is on, the browser vendor's sync (e.g. Google) carries them to your other PCs.
- The Dropbox app-folder permission only reaches that one folder; the extension cannot read your other Dropbox files.
- Calendar events contain only course names, times, places, and instructor contact details that are already published on the KNOU page.
- The **bug report** file (Settings → 버그 리포트 저장) does not include your name, student ID, email, or course list.

## Troubleshooting

Open Settings (the gear icon in the popup) → **버그 리포트 저장**, and attach the `knou_calendar_<version>_bug_report_<time>.txt` file to an issue.

## Building from source

See the [developer guide (Korean)](docs/DEVELOPER.md).

## License

[MIT](LICENSE)
