# 개발자 문서

Knou calendar를 직접 빌드하거나, 자신의 구글 OAuth 클라이언트로 바꿔 쓰려는 경우를 위한 문서입니다.

## 폴더 구조

| 경로 | 내용 |
|---|---|
| `src/` | 확장 소스 (manifest 템플릿, 백그라운드, 팝업, 설정 화면) |
| `src/lib/` | 핵심 로직 — `knou.js`(MyKNOU 읽기), `nuxt.js`(Nuxt payload 해석), `schedule.js`(일정 변환·비교), `gauth.js`(구글 인증), `gcal.js`(Calendar API), `sync.js`(동기화 흐름) |
| `src/config.json` | 빌드에 내장할 구글 OAuth 클라이언트 ID |
| `src/chromium_key.txt` | Chromium 확장 ID를 고정하는 **공개키** (비밀 아님) |
| `build.js` | `dist/chromium`, `dist/firefox` 생성 |
| `test/run_test.js` | 저장한 MyKNOU 대시보드 HTML로 파서·일정 변환 점검 |

## 빌드 (Windows, Node.js 18 이상)

```
winget install OpenJS.NodeJS.LTS
cd C:\경로\knou_calendar
node build.js
```

- `dist\chromium` — Chrome·Edge·웨일·오페라용 (확장 ID `akolhboefakmfcodlklbicmaiplebfgp`로 고정)
- `dist\firefox` — Firefox 140 이상용

## 점검

MyKNOU 대시보드(m.knou.ac.kr)를 `Ctrl+S`로 저장한 뒤:

```
node test\run_test.js "C:\경로\저장한_대시보드.html"
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

## 파이어폭스 배포

일반 파이어폭스는 서명되지 않은 확장을 영구 설치할 수 없습니다.

1. `dist\firefox` 폴더 **안의 내용물**을 zip으로 묶습니다. `manifest.json`이 zip 최상위에 있어야 합니다.
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
