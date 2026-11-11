## Knou calendar v1.6.1 — 위젯 v1.1.0

확장 기능은 1.6.0과 같고, 함께 배포하는 아이패드·아이폰 위젯 스크립트만 **KnouWidget v1.1.0**으로 바뀌었습니다.

### 위젯 v1.1.0
- 확장이 넣은 과제 메모(notes)를 우선 사용합니다. 위젯이나 메모장에서 고친 뒤 아직 PC에서 동기화하지 않았다면 Dropbox의 `knou_scope.txt`를 직접 읽어 최신 내용을 보여 줍니다.
- **위젯 자동 업데이트**: Scriptable 앱에서 KnouWidget을 실행할 때, 확장이 Dropbox에 올려 둔 더 높은 버전이 있으면 스스로 바꿉니다. 메뉴의 [업데이트 확인]으로 직접 확인할 수도 있습니다.

### 업데이트 방법
1. 확장을 1.6.1로 바꾸고 한 번 동기화합니다. 확장이 Dropbox에 위젯 v1.1.0을 올립니다.
2. 위젯 v1.0.0에는 자동 업데이트가 없으므로 **이번 한 번만** 다시 복사합니다. 파일 앱 → Dropbox › Apps › KnouWidget → `KnouWidget.js`를 복사해 iCloud Drive › Scriptable에 붙여넣고 덮어쓰세요.
3. 다음 버전부터는 Scriptable에서 KnouWidget을 실행하면 자동으로 바뀝니다.

### 첨부 파일
- `knou_calendar_chromium.zip`: Chrome·Edge·웨일·오페라용입니다. 크롬이 읽는 폴더의 한 단계 위에 압축을 풀어 덮어쓴 뒤, 확장 관리 화면에서 새로고침(↻)하면 됩니다.
- `knou_calendar_firefox.zip`: Firefox용 Mozilla 서명 제출 파일입니다.
- `KnouWidget.js`: 아이패드·아이폰 Scriptable 위젯 스크립트(v1.1.0)입니다.
