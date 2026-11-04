## Knou calendar v1.4.1 — 1.4.0 보완

1.4.0의 Dropbox 내보내기는 그대로 두고, 배포 파일과 안정성을 보완했습니다.

### 고친 점
- **Chromium 설치 파일 구조**를 1.3.0과 같게 되돌렸습니다. 압축을 풀면 `knou_calendar_chromium` 폴더가 생기고, 그 폴더를 "압축해제된 확장 프로그램 로드"로 고르면 됩니다.
- Dropbox 연결 창과 구글 로그인 창이 동시에 열릴 때 생기던 오류를 막고, 무엇을 해야 하는지 안내합니다.
- Dropbox 응답이 멈추면 30초 뒤 동기화를 먼저 완료로 처리합니다. 캘린더 동기화가 "반영 중"에 머무는 일이 없습니다.

### 첨부 파일
- `knou_calendar_chromium.zip`: Chrome·Edge·웨일·오페라용입니다. 압축을 풀고 `knou_calendar_chromium` 폴더를 "압축해제된 확장 프로그램 로드"로 설치합니다. 기존 위치에 덮어쓴 뒤 확장 관리 화면에서 새로고침해도 됩니다.
- `knou_calendar_firefox.zip`: Firefox용 Mozilla 서명 제출 파일입니다.

### 알아둘 점
- 설정과 연결 상태(구글·Dropbox)는 그대로 유지됩니다.
- Firefox에서 Dropbox를 쓰려면, Dropbox 앱의 Redirect URIs에 **Firefox 설정 화면에 표시되는 주소**를 추가로 등록해야 합니다. Chromium 계열과 주소가 다릅니다.
