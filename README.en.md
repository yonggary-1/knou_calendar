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

1. Download `knou_calendar_chromium.zip` from [Releases](https://github.com/yonggary-1/knou_calendar/releases) and extract it, e.g. to `C:\Tools\knou_calendar_chromium`.
   - Keep this folder; the extension runs from it.
2. Open `chrome://extensions`. For other browsers use `edge://extensions`, `whale://extensions`, or `opera://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the extracted folder.

### Firefox

`knou_calendar_firefox.zip` is the package for Mozilla signing. See the [developer guide (Korean)](docs/DEVELOPER.md) for how to sign it.

## Usage

1. Log in to MyKNOU (m.knou.ac.kr).
2. Click the extension icon → **동기화 확인** (Check sync).
3. The first time, a Google account picker and consent screen appear.
   - On the "Google hasn't verified this app" warning, choose **Continue** (or **Advanced → Go to Knou calendar**).
   - On the permissions screen, **make sure the calendar item is checked**.
4. Review the preview and click **반영** (Apply).

After that, just use **동기화 확인 → 반영** whenever your schedule changes.

### About the Google connection

- The extension's Google app is currently in **testing mode**. Only Gmail accounts added as test users by the developer can connect. Other accounts get an `access_denied` error. To use it, ask the developer to add you, or create [your own OAuth client](docs/DEVELOPER.md).
- The permission scope is limited to **calendars created by this extension**. It cannot read or change your other calendars.

## Privacy

- Data read from KNOU is stored **only in your browser and your own Google Calendar**. Nothing is sent to any other server.
- Calendar events contain only course names, times, places, and instructor contact details that are already published on the KNOU page.
- The **bug report** file (Settings → 버그 리포트 저장) does not include your name, student ID, email, or course list.

## Troubleshooting

Open Settings (the gear icon in the popup) → **버그 리포트 저장**, and attach the `knou_calendar_<version>_bug_report_<time>.txt` file to an issue.

## Building from source

See the [developer guide (Korean)](docs/DEVELOPER.md).

## License

[MIT](LICENSE)
