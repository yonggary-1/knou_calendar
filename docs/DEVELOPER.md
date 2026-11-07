# 개발자 문서

Knou calendar를 직접 빌드하거나, 자신의 구글 OAuth 클라이언트로 바꿔 쓰려는 경우를 위한 문서입니다.

## 폴더 구조

| 경로 | 내용 |
|---|---|
| `src/` | 확장 소스 (manifest 템플릿, 백그라운드, 팝업, 설정 화면) |
| `src/lib/` | 핵심 로직 — `knou.js`(MyKNOU 읽기), `nuxt.js`(Nuxt payload 해석), `schedule.js`(일정 변환·비교), `gauth.js`(구글 인증), `gcal.js`(Calendar API), `dropbox.js`(위젯용 Dropbox 내보내기), `sync.js`(동기화 흐름) |
| `src/config.json` | 빌드에 내장할 구글 OAuth 클라이언트 ID |
| `src/chromium_key.txt` | Chromium 확장 ID를 고정하는 **공개키** (비밀 아님) |
| `build.js` | `dist/chromium`, `dist/firefox` 생성 후 `tools/pack.js`로 첨부 zip까지 만듦 |
| `tools/pack.js` | 릴리즈 첨부 zip 두 개 생성 (Node 기본 모듈만 사용) |
| `test/run_test.js` | 저장한 MyKNOU 대시보드 HTML로 파서·일정 변환 점검 |
| `test/dropbox_test.js` | 가짜 Dropbox로 내보내기 흐름 점검 (네트워크 사용 안 함) |

## 빌드 (Windows, Node.js 18 이상)

```
winget install OpenJS.NodeJS.LTS
cd C:\경로\knou_calendar
node build.js
```

- `dist\chromium` — Chrome·Edge·웨일·오페라용 (확장 ID `akolhboefakmfcodlklbicmaiplebfgp`로 고정)
- `dist\firefox` — Firefox 140 이상용
- `dist\knou_calendar_chromium.zip` — 릴리즈 첨부용. 최상위에 `knou_calendar_chromium\` 폴더가 하나 있음
- `dist\knou_calendar_firefox.zip` — 릴리즈 첨부용. `manifest.json`이 최상위 (Mozilla 서명 제출 형식)

> 릴리즈할 때는 두 zip을 손으로 묶지 말고 `node build.js`가 만든 것을 그대로 쓰세요. 손으로 묶다가 구조가 달라진 적이 있습니다(1.4.0).

## 점검

MyKNOU 대시보드(m.knou.ac.kr)를 `Ctrl+S`로 저장한 뒤:

```
node test\run_test.js "C:\경로\저장한_대시보드.html"
```

Dropbox 내보내기 점검:

```
node test\dropbox_test.js
```

> 저장한 대시보드 HTML에는 이름·학번·이메일이 들어 있습니다. **저장소에 올리지 마세요.** (`.gitignore`로 막혀 있습니다)

## 자신의 구글 OAuth 클라이언트 쓰기

1. https://console.cloud.google.com/ 에서 새 프로젝트를 만듭니다. 이름에 밑줄(`_`)은 쓸 수 없습니다.
2. **Google Calendar API**를 사용 설정합니다.
3. **Google 인증 플랫폼 → 시작하기**: 앱 정보, 대상 **외부**, 연락처를 입력합니다.
4. **대상(Audience) → 테스트 사용자**에 사용할 Gmail을 추가합니다. 테스트 단계에서는 여기 등록된 계정만 연결할 수 있습니다(최대 100명).
5. **클라이언트 → 클라이언트 만들기**
   - 유형: **웹 애플리케이션**
   - 승인된 리디렉션 URI:
     - Chromium: `https://akolhboefakmfcodlklbicmaiplebfgp.chromiumapp.org/`
     - Firefox: 확장 설정 → 고급에 표시되는 `https://….extensions.allizom.org/`
6. 발급된 클라이언트 ID를 `src\config.json`에 넣고 다시 빌드합니다.
   ```json
   { "clientId": "1234567890-xxxx.apps.googleusercontent.com" }
   ```
   빌드하지 않고 확장 설정 → **고급**에 직접 입력해도 됩니다. 이 경우 직접 입력한 값이 내장 ID보다 우선합니다.

권한 범위는 기본적으로 `calendar.app.created`입니다. 즉 확장이 직접 만든 캘린더에만 접근하고, 다른 캘린더는 읽지 않습니다.

## Dropbox 내보내기 (위젯용)

`lib/dropbox.js`가 담당합니다. 앱 키는 `src/config.json`의 `dropboxAppKey`로 내장하고(`build.js`가 `KS.env.dropboxAppKey`로 넣음), 설정 → 고급의 `settings.dropboxAppKey`가 있으면 그쪽을 씁니다(`KS.effectiveDropboxKey`). PKCE 방식이라 앱 시크릿은 어디에도 넣지 않습니다.

### 내장 Dropbox 앱 (htxa03bfx70wl6i)

[Dropbox App Console](https://www.dropbox.com/developers/apps)에 만든 **Scoped access · App folder** 앱입니다.

- Permissions: `files.content.read`, `files.content.write`
- Redirect URIs (두 개 모두 등록)
  - Chromium 계열: `https://akolhboefakmfcodlklbicmaiplebfgp.chromiumapp.org/` (`chromium_key.txt`로 고정된 ID)
  - Firefox: `https://1d7b9eef5f79d53ebe1a136a2d2775845bb15396.extensions.allizom.org/` (`knou_calendar@yonggary.local`의 SHA-1)
- 개발 단계(Development) 앱이라 연결할 수 있는 사용자 수에 제한이 있습니다. 배포 범위가 넓어지면 Dropbox에 Production 신청이 필요합니다.
- 확장 ID나 Gecko ID를 바꾸면 위 Redirect URI도 함께 바꿔야 합니다.
- 위젯(Scriptable 등)도 **같은 앱 키**로 PKCE 인증을 받아야 같은 앱 폴더의 파일을 읽을 수 있습니다.

### 직접 만든 앱을 쓸 때

같은 방식(Scoped access · App folder, 위 두 권한)으로 앱을 만들고, 설정 → 고급에 표시된 리디렉션 주소를 Redirect URIs에 등록한 뒤 앱 키를 고급에 입력합니다. 이미 연결한 사용자는 연결할 때의 앱 키(`ks_dropbox.appKey`)로 계속 갱신하므로, 키를 바꾸면 **다시 연결**해야 합니다.

### 동작

- **인증**: `identity.launchWebAuthFlow` + PKCE(S256), `token_access_type=offline`. 리디렉션 URI는 구글과 같은 `identity.getRedirectURL()`입니다. 갱신 토큰은 `storage.local`의 `ks_dropbox`, 접근 토큰(약 4시간)은 `storage.session`의 `ks_dbx_token`에 둡니다.
- **호출 시점**: `sync.js`의 `markDone` (반영 완료, 또는 변경 없음). 연결하지 않았으면 아무것도 하지 않습니다. 실패해도 예외를 던지지 않고 `ks_dbx_last`에 기록합니다.
- **권한**: 앱 폴더 범위만 씁니다. Dropbox API는 CORS를 지원하므로 `host_permissions`를 추가하지 않았습니다.
- **경로**: `Dropbox-API-Arg` 헤더는 ASCII만 허용하므로 파일 이름은 모두 영문입니다.

### 파일 형식 (`format: 1`)

`knou_agenda.json` — 동기화할 때마다 덮어씀:

```json
{
  "format": 1,
  "generator": "Knou calendar 1.4.0",
  "savedAt": "2026-11-05T05:00:00.000Z",
  "semester": "2026-2",
  "courses": ["행정학개론", "경영학원론"],
  "items": [
    { "course": "행정학개론", "kind": "final", "label": "기말평가", "detail": "과제물",
      "start": "2026-11-10T09:00:00+09:00", "end": "2026-11-20T18:00:00+09:00", "place": "", "due": true }
  ]
}
```

- `kind`: `class`(출석수업), `mid`, `final`, `formative`. `label`은 화면 표시용(`중간평가`, `기말평가`, `기말시험` 등)입니다.
- `due: true`면 `end`가 마감 시각, `false`면 `start`~`end`가 수업·시험 시간입니다. 시각은 모두 `+09:00`입니다.
- 형성평가는 `course`가 `형성평가`입니다.

`knou_scope.json` — 없을 때만 만들고 이후로는 사용자가 편집:

```json
{
  "format": 1,
  "semester": "2026-2",
  "note": "…",
  "items": [
    { "course": "행정학개론", "kind": "기말평가", "scope": "" },
    { "course": "컴퓨터의이해", "kind": "", "scope": "" }
  ]
}
```

- 과목마다 그 학기 평가(중간·기말)별로 한 칸, 평가 정보가 없는 과목은 `kind`가 빈 칸 하나입니다.
- 이미 있으면 `semester`만 확인합니다. 값이 지금 학기와 다를 때만 `/archive/knou_scope_<학기>.json`으로 옮기고 새로 만듭니다. 값이 없거나 같으면 손대지 않습니다.

## 파이어폭스 배포

일반 파이어폭스는 서명되지 않은 확장을 영구 설치할 수 없습니다.

1. `node build.js`가 만든 `dist\knou_calendar_firefox.zip`을 씁니다. `manifest.json`이 zip 최상위에 있습니다.
2. https://addons.mozilla.org/developers/ → **Submit a New Add-on** → **On your own**을 선택하고 zip을 업로드합니다.
3. 서명된 `.xpi`를 받아 설치합니다.

## 동작 요약

1. MyKNOU 대시보드 HTML의 `__NUXT_DATA__`(Nuxt SSR payload)를 해석해 수강 과목을 읽습니다.
   - 실패하면 열린 방통대 탭에서 읽고, 그것도 안 되면 화면 DOM을 읽습니다.
2. 과목별로 출석수업·중간평가·기말평가 일정 묶음을 만들고, 내용 해시를 `extendedProperties.private`에 저장합니다.
3. 전용 캘린더의 기존 일정과 묶음 단위로 비교해 추가·교체·삭제 계획을 만듭니다.
   - 교체는 새 일정을 먼저 넣고 옛 일정을 지우는 순서로 합니다.
   - 지난 학기 일정은 건드리지 않습니다.
4. 미리보기에서 사용자가 확인하면 반영하고, 팝업의 "남은 일정"을 갱신합니다.
5. Dropbox를 연결했으면 남은 일정을 `knou_agenda.json`으로 내보내고, `knou_scope.json`이 없으면 양식을 만듭니다.
