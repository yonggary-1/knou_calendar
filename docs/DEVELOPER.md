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
| `test/dropbox_test.js` | 가짜 Dropbox로 내보내기·과제 메모 양식·위젯 배포·편집기 저장/충돌 점검 (네트워크 사용 안 함) |
| `test/scope_test.js` | 확장과 위젯의 과제 메모 해석·저장 규칙이 같은지 위젯 스크립트와 직접 비교 |
| `src/lib/scope.js` | 과제 메모 `knou_scope.txt` 해석·저장 (위젯과 같은 규칙) |
| `src/lib/scopestore.js` | 과제 메모의 브라우저 저장소 (`storage.sync`, 조각 저장) |
| `src/lib/memo.js` | 과제 메모의 원본 결정(Dropbox / 브라우저), 백업, 다시 연결 때 올리기·충돌 |
| `test/memo_test.js` | 브라우저 저장·백업·끊김·다시 연결·충돌 시나리오 점검 |
| `test/harness.js` | 테스트 공용 가짜 저장소(storage.sync 한도 흉내)·가짜 Dropbox |
| `src/editor/` | 과제 메모 편집기 화면 |
| `src/widget/KnouWidget.js` | 아이패드·아이폰 Scriptable 위젯 스크립트 (빌드에 포함, 릴리즈 첨부) |

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

Dropbox·과제 메모 점검:

```
node test\dropbox_test.js
node test\memo_test.js
node test\scope_test.js
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

- **화면**: 팝업 연결 상태의 세 번째 줄(`#dbxRow`)이 Dropbox입니다. 연결 안 됨이면 [연결]·[사용 안 함], 연결됨이면 [연결 해제]가 보입니다. 연결됨이면 주 버튼 이름이 `동기화 확인 & Dropbox 내보내기`가 됩니다. 내보내기는 `markDone`에서 자동으로 실행되므로 별도 버튼은 없습니다.
- **숨김**: [사용 안 함] → `settings.dropboxHidden = true`(`hideDropbox` 메시지). 백그라운드 `status()`의 `dropbox.hidden`은 **연결 안 됨이면서 숨김일 때만** 참입니다. `connectDropbox`가 성공하면 숨김을 풀고 바로 `exportAgenda`를 한 번 부릅니다. 이 처리는 백그라운드에서 하므로 팝업이 닫혀도 끝까지 진행됩니다.

### 내장 Dropbox 앱 (htxa03bfx70wl6i)

[Dropbox App Console](https://www.dropbox.com/developers/apps)에 만든 **Scoped access · App folder** 앱입니다.

- Permissions: `files.content.read`, `files.content.write`
- 앱 이름은 `KnouWidget`이고, 파일은 사용자 Dropbox의 `Apps\KnouWidget\`에 생깁니다.
- Redirect URIs (세 개 모두 등록)
  - Chromium 계열: `https://akolhboefakmfcodlklbicmaiplebfgp.chromiumapp.org/` (`chromium_key.txt`로 고정된 ID)
  - Firefox: `https://1d7b9eef5f79d53ebe1a136a2d2775845bb15396.extensions.allizom.org/` (`knou_calendar@yonggary.local`의 SHA-1)
  - 위젯(Scriptable): `scriptable:///run/KnouWidget` (스크립트 이름이 반드시 `KnouWidget`)
- 개발 단계(Development) 앱이라 연결할 수 있는 사용자 수에 제한이 있습니다. 배포 범위가 넓어지면 Dropbox에 Production 신청이 필요합니다.
- 확장 ID나 Gecko ID를 바꾸면 위 Redirect URI도 함께 바꿔야 합니다.
- 위젯(Scriptable 등)도 **같은 앱 키**로 PKCE 인증을 받아야 같은 앱 폴더의 파일을 읽을 수 있습니다.

### 직접 만든 앱을 쓸 때

같은 방식(Scoped access · App folder, 위 두 권한)으로 앱을 만들고, 설정 → 고급에 표시된 리디렉션 주소를 Redirect URIs에 등록한 뒤 앱 키를 고급에 입력합니다. 이미 연결한 사용자는 연결할 때의 앱 키(`ks_dropbox.appKey`)로 계속 갱신하므로, 키를 바꾸면 **다시 연결**해야 합니다.

### 동작

- **인증**: `identity.launchWebAuthFlow` + PKCE(S256), `token_access_type=offline`. 리디렉션 URI는 구글과 같은 `identity.getRedirectURL()`입니다. 갱신 토큰은 `storage.local`의 `ks_dropbox`, 접근 토큰(약 4시간)은 `storage.session`의 `ks_dbx_token`에 둡니다.
- **호출 시점**: `sync.js`의 `markDone`(반영 완료, 또는 변경 없음). **예외는 하나**뿐으로, 과제 메모 편집기에서 저장한 직후입니다(`saveScope` → `exportAgenda`). 이때는 MyKNOU를 다시 읽지 않고 저장된 `ks_agenda`에 새 `notes`만 붙여 내보냅니다. 연결하지 않았으면 아무것도 하지 않습니다. 실패해도 예외를 던지지 않고 `ks_dbx_last`에 기록합니다.
- **내보내기 순서** (`exportAgenda`): ① `knou_scope.txt` 양식 확인(`ensureScopeTxt`) → ② txt를 읽어 `notes` 만들기(`readNotes`, 실패하면 `notes` 없이 진행) → ③ `knou_agenda.json` 덮어쓰기 → ④ 위젯 스크립트 확인(`ensureWidget`, 실패해도 내보내기는 성공).
- **rev 읽기**: `get_metadata`로 rev를 먼저 받고 `download`에 `path: "rev:<rev>"`를 넘겨, 내용과 rev가 어긋나지 않게 합니다(브라우저에서는 `Dropbox-API-Result` 헤더를 읽을 수 없는 경우가 있어서).
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

- 1.6.0부터 과제 메모를 해석한 필드가 붙습니다. `format`은 1 그대로이며, 메모를 못 읽었으면 세 필드 모두 뺍니다.

```json
{
  "notes": {
    "인간과사회": { "mid": "", "final": "교재 3장의 …\nA4 3쪽 내외, …", "memo": "교재 2026 개정판 사용" }
  },
  "notesRev": "<knou_scope.txt의 Dropbox rev>",
  "notesSavedAt": "2026-11-11T05:00:00.000Z"
}
```

### 과제 메모 `knou_scope.txt` (1.6.0~)

해석과 저장은 `lib/scope.js`가 맡습니다. **위젯 `KnouWidget.js`의 `parseScopeTxt` / `memoOf` / `scopeToTxt`와 글자 하나까지 같아야 합니다.** 한쪽만 고치면 확장과 위젯이 번갈아 저장할 때 파일이 흔들리므로 반드시 둘 다 고치세요. `test/scope_test.js`가 위젯 스크립트에서 세 함수를 직접 꺼내 결과를 비교합니다.

- **읽기**: BOM 제거, `\r?\n`로 나눔. 공백을 모두 지운 값이 과목명(공백 지운 값)과 같은 줄이 과목 제목입니다. `^(중간평가|기말평가|기말시험|중간|기말)\s*[:：]\s*(.*)$`가 평가 표시이고, `중간…`이면 중간평가, 나머지는 기말평가입니다. 표시부터 다음 표시나 다음 과목 전까지가 내용입니다. 과목 제목 바로 아래, 표시 앞의 줄은 과목 메모이고, 첫 과목 위의 줄은 머리말입니다. 같은 과목·같은 종류가 두 번 나오면 빈 줄 하나를 사이에 두고 이어 붙입니다.
- **저장 모양**: 머리말 → 빈 줄 → 과목마다 `과목명` / 과목 메모(있을 때만) / `중간평가: …` / `기말평가: …` / 빈 줄. 내용이 비어도 평가 줄은 남깁니다. LF, UTF-8, BOM 없음입니다.
- **양식**: 파일이 없을 때만 `<학기>학기 과제 메모 — 첫 과목명 위에 적은 내용은 위젯에 나오지 않습니다.` 머리말과 빈 평가 줄로 만듭니다.
- **학기 전환**: 머리말 **첫 줄 맨 앞의 `YYYY-N학기`**가 지금 학기와 다를 때만 `/archive/knou_scope_<학기>.txt`로 옮기고 새 양식을 만듭니다. 머리말이 없거나 학기를 못 읽으면 손대지 않습니다.
- **편집기** (`editor/editor.html`): 팝업 [📝 과제 메모](1.6.2부터 항상 보임)로 엽니다. Dropbox 모드일 때: 열 때마다 `scopeLoad`로 최신 내용과 rev를 받고, `scopeSave`는 `mode: update(rev)`(파일이 없으면 `add`)로만 저장합니다. 409 `conflict`이면 덮어쓰지 않습니다. 이때 내가 바꾼 칸만 txt 모양으로 보여 주고 클립보드에 복사한 뒤, "새 내용 불러오고 내 변경 다시 채우기"를 고르면 **내가 바꾼 칸만** 새 내용 위에 다시 채웁니다.
- 옛 `knou_scope.json`은 만들지 않고 지우지도 않습니다. txt가 없고 브라우저 메모도 없을 때 편집기의 시작값으로만 씁니다.

### 과제 메모의 브라우저 저장 (1.6.2~)

`lib/memo.js`가 원본을 정하고, `lib/scopestore.js`가 `storage.sync`에 씁니다.

| mode | 조건 | 원본 | 저장 |
| --- | --- | --- | --- |
| `local` | Dropbox 연결 안 함 | 브라우저 | 브라우저 (`dirty: true`) |
| `dropbox` | 연결됨, 읽기 성공 | `knou_scope.txt` | Dropbox(rev 확인) 후 브라우저에 백업(`dirty: false`, `baseRev` = 새 rev) |
| `backup` | 연결됨, 읽기 실패(네트워크·인증) | 브라우저 백업 | 브라우저 (`dirty: true`, `baseRev` 유지) |

- **기록**: `ks_scope_meta` = `{ v: 1, n, semester, savedAt, dirty, baseRev }`, 내용은 `ks_scope_0`…`ks_scope_<n-1>`(조각마다 UTF-8 6,000바이트 이하, JSON 이스케이프 몫 포함). 조각을 먼저 쓰고 meta를 나중에 씁니다. 조각이 하나라도 빠지면 `get()`은 null(깨진 내용을 쓰지 않음). 용량 초과는 `SCOPE_QUOTA` 오류. `storage.sync`가 없는 환경에서는 `storage.local`.
- **백업 갱신**: Dropbox에서 읽을 때마다(`readNotes`, 편집기 열기) 내용·rev가 다르면 백업합니다. 단 `dirty`이면 덮어쓰지 않습니다.
- **다시 연결** (`reconcile`, Dropbox에서 읽은 직후): `dirty`이고 ① txt 내용이 같으면 깨끗한 백업으로, ② txt가 없거나 rev가 `baseRev`와 같으면 브라우저 내용을 `update(rev)`로 올림, ③ 그 밖에는 `ks_scope_conflict`를 남기고 아무것도 덮어쓰지 않습니다. 편집기가 충돌을 보여 주고 `scopeResolve { choice: 'dropbox' | 'local' }`로 정합니다. 버리는 브라우저 내용은 `storage.local`의 `ks_scope_discarded`에 보관합니다. 충돌을 고르지 않고 Dropbox 쪽에 저장해도 같은 곳에 보관합니다.
- **로컬 저장 충돌**: 열 때 받은 `savedAt`(`version`)과 지금 기록의 `savedAt`이 다르면(다른 창·다른 PC가 먼저 저장) 저장하지 않습니다.
- **학기 전환**: 기록의 `semester`가 지금 학기와 다르면 `storage.local`의 `ks_scope_archive_<학기>`로 옮기고 지웁니다.
- **txt 생성**: `ensureScopeTxt`는 txt가 없으면 이번 학기 브라우저 기록으로 만듭니다(없으면 빈 양식). 학기 전환으로 새로 만들 때는 항상 빈 양식입니다.
- **캘린더 설명란** (`memo.notesForCalendar`): 연결됨 → Dropbox(15초 제한), 못 읽거나 연결 안 함 → 브라우저 기록, 그것도 없으면 `ks_notes` 캐시.
- **txt 내보내기** (편집기): `KS.scope.scopeToTxt`로 화면 내용을 만들어 Chromium은 `showSaveFilePicker`, Firefox는 `downloads.download({ saveAs: true })`(빌드가 Firefox manifest에만 `downloads` 권한을 넣음), 둘 다 없으면 `<a download>`로 저장합니다. 파일 이름 `knou_scope_<학기>.txt`, LF.

### 캘린더 설명란 (1.6.0 결정)

`schedule.build(knou, settings, notes)`가 일정 설명란 맨 위에 메모를 넣습니다. 형식은 `📝 기말평가` / `📌 과목 메모` 머리줄 + 내용, 빈 줄, `────────`, 원래 설명입니다.

| 메모 | 들어가는 일정 |
| --- | --- |
| 평가 내용(중간·기말) | 그 평가의 **제출기간** 일정(시험형은 시험 일정). **마감 일정에는 넣지 않음** — 단, 제출기간 일정이 없을 때(`showPeriod` 끔, 하루짜리 기간)는 내용이 사라지지 않게 마감 일정에 넣음 |
| 과목 메모 | 그 과목의 모든 일정(출석수업·중간·기말, 마감 포함) |

- 설명란이 약 8,000자를 넘으면 메모를 자르고 `… (전체는 위젯·편집기에서)`를 붙입니다.
- **메모만 바뀐 경우**: 일정마다 `ks_base`(메모를 넣기 전 모양의 해시)를 저장합니다. `ks_base`는 같고 `ks_hash`만 다르면 `diff`가 `update`로 분류해, 일정을 다시 만들지 않고 `PATCH`로 설명란과 해시만 고칩니다(팝업에 "메모" 칩으로 표시). 1.5.0 일정에는 `ks_base`가 없으므로 `ks_hash`를 base로 봅니다. 그래서 업데이트 직후에도 교체가 일어나지 않습니다.
- 동기화 때 메모는 Dropbox에서 새로 읽습니다(15초 제한). 못 읽으면 마지막으로 읽은 `ks_notes`를 씁니다. 못 읽을 때마다 메모를 빼면 설명란이 매번 바뀌기 때문입니다.

### 위젯 스크립트 배포

- 원본은 `src/widget/KnouWidget.js`입니다. 첫 줄 `// KnouWidget v<버전> —`과 `const WIDGET_VERSION = "<버전>";`이 같아야 하며, 다르면 `node build.js`가 멈춥니다.
- 빌드하면 확장 안(`widget/KnouWidget.js`)과 릴리즈 첨부용 `dist/KnouWidget.js`에 함께 들어갑니다. 첨부 파일 이름은 고정이라 `https://github.com/yonggary-1/knou_calendar/releases/latest/download/KnouWidget.js`가 늘 최신을 가리킵니다.
- 내보낼 때 앱 폴더의 `/KnouWidget.js`가 없거나 버전이 다를 때만 올립니다. 마지막으로 확인한 rev·버전을 `ks_widget`에 두어, rev가 같으면 내려받지도 않습니다.
- 위젯을 새 버전으로 바꾸려면 `src/widget/KnouWidget.js`만 교체하고 확장을 릴리즈하면 됩니다.
- 위젯 v1.1.0부터는 **자동 업데이트**가 됩니다. 앱에서 실행될 때 Dropbox의 `/KnouWidget.js`가 **더 높은 버전**일 때만 자기 파일(`module.filename`)을 바꿉니다. 받은 파일은 첫 줄 버전과 `WIDGET_VERSION`이 같은지, 10KB 이상인지, `Script.complete();`로 끝나는지로 확인합니다. 확장의 `ensureWidget`은 "버전이 다르면" 올리지만, 위젯은 "더 높으면"만 바꾸므로 낮은 버전으로 되돌아가지 않습니다. 새 위젯을 낼 때 첫 줄·`WIDGET_VERSION`과 함께 **파일 끝의 `Script.complete();`를 지우지 마세요.**
- 위젯 v1.1.0은 `knou_agenda.json`의 `notes`를 우선 씁니다. `get_metadata`로 txt의 rev만 확인해서 `notesRev`와 같으면 notes를 쓰고, 다르면 txt를 직접 읽습니다. 그래서 확장은 `notesRev`에 **notes를 만든 바로 그 txt의 rev**를 넣어야 합니다(`readNotes`가 rev와 내용을 함께 읽는 이유).

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
5. Dropbox를 연결했으면 `knou_scope.txt` 양식을 확인하고, 과제 메모를 `notes`로 붙여 `knou_agenda.json`을 내보낸 뒤, 위젯 스크립트 버전을 확인합니다. 과제 메모는 3단계의 일정 설명란에도 들어갑니다(동기화 때 Dropbox에서 읽고, 못 읽거나 연결하지 않았으면 브라우저 저장본).
