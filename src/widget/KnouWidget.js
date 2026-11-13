// KnouWidget v1.2.0 — 방통대 과목별 일정 + 과제 내용 (Scriptable)
// 위젯 편집의 Parameter로 화면을 고른다 (스크립트는 이것 하나):
//   비움        : 과목 칸 격자. 칸을 누르면 그 과목 상세 화면(스크롤)
//   0           : 마감이 가까운 순서로 전 과목 요약 (같은 마감은 한 줄로 묶음)
//   1,2 / 과목명 : 고른 과목을 크게 (특대형은 두 과목, 그 밖은 첫 과목). 여러 개를 스택으로 겹쳐 넘겨 본다
//   뒤에 크기 낱말: "크게", "0 작게", "1,2 아주 크게"
//   (v1.1.8까지의 a·b는 없앴다: a → 비움, b → 0)
// Knou calendar 확장이 Dropbox 앱 폴더(Apps\KnouWidget)에 저장한 두 파일을 읽는다.
//   /knou_agenda.json : 남은 일정 (확장이 동기화할 때마다 덮어씀)
//   /knou_scope.txt   : 과제 내용·시험 범위 원본 (이 스크립트·확장·메모장·Dropbox 앱으로 편집. 없으면 /knou_scope.json)
//   knou_agenda.json의 notes : 확장이 동기화 때 txt를 해석해 넣은 것. txt 버전(rev)이 notesRev와 같을 때만 씀
//   /KnouWidget.js    : 확장이 올려 두는 이 스크립트. 앱에서 실행할 때 더 높은 버전이면 자기 파일을 교체
// Dropbox 연결은 이 스크립트가 맡는다. 스크립트 이름은 반드시 KnouWidget.

const WIDGET_VERSION = "1.2.0"; // 첫 줄의 "KnouWidget v1.1.x"과 같게 유지 (확장이 새 버전 여부를 판단할 때 씀)
const APP_KEY = "htxa03bfx70wl6i"; // Knou calendar에 내장된 Dropbox 앱 키 (같은 앱 폴더를 쓰려면 같아야 함)
const AGENDA_PATH = "/knou_agenda.json";
const SCOPE_PATH = "/knou_scope.json"; // 예전 형식 (txt가 없을 때만)
const SCOPE_TXT_PATH = "/knou_scope.txt";
const KC_REFRESH = "knou_dbx_refresh";
const KC_TOKEN = "knou_dbx_token";
const REFRESH_MIN = 30; // 위젯 갱신 요청 간격(분). 실제 시점은 iPadOS가 정한다

// ---------------- 색 ----------------
const C = {
  bg: Color.dynamic(new Color("#ffffff"), new Color("#1c1c1e")),
  text: Color.dynamic(new Color("#1c1c1e"), new Color("#f2f2f7")),
  sub: Color.dynamic(new Color("#6e6e73"), new Color("#a1a1a6")),
  line: Color.dynamic(new Color("#e5e5ea"), new Color("#38383a")),
  red: Color.dynamic(new Color("#d70015"), new Color("#ff6961")),
  orange: Color.dynamic(new Color("#c93400"), new Color("#ffb340")),
  blue: Color.dynamic(new Color("#0058b9"), new Color("#64a8ff")),
  chip: Color.dynamic(new Color("#f2f2f7"), new Color("#2c2c2e")),
};

// ---------------- Dropbox ----------------
function randomVerifier(n = 64) {
  const cs = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let s = "";
  for (let i = 0; i < n; i++) s += cs[Math.floor(Math.random() * cs.length)];
  return s;
}

const form = (o) => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");

async function postToken(params) {
  const r = new Request("https://api.dropboxapi.com/oauth2/token");
  r.method = "POST";
  r.headers = { "Content-Type": "application/x-www-form-urlencoded" };
  r.body = form(params);
  const j = await r.loadJSON();
  if (r.response.statusCode !== 200) {
    const e = new Error(j.error_description || j.error || "Dropbox 인증 오류");
    e.code = j.error;
    throw e;
  }
  return j;
}

// Dropbox 앱 설정의 Redirect URIs에 이 주소가 그대로 등록되어 있어야 한다 (끝에 / 없음).
// 스크립트 이름이 KnouWidget 이어야 Scriptable이 허용 결과를 이 스크립트로 돌려준다 (대소문자 구분).
// 파일을 내려받을 때 첫 글자가 대문자로 바뀌거나 밑줄이 바뀌어도 그대로 남도록 밑줄 없는 대문자 시작 이름을 쓴다.
const SCRIPT_NAME = "KnouWidget";
const REDIRECT_URI = `scriptable:///run/${SCRIPT_NAME}`;
const KC_PENDING = "knou_dbx_pending"; // 허용 페이지에 다녀오는 동안 verifier·state 보관

function authorizeUrl(verifier, extra) {
  return "https://www.dropbox.com/oauth2/authorize?" + form({
    client_id: APP_KEY,
    response_type: "code",
    token_access_type: "offline",
    code_challenge: verifier,
    code_challenge_method: "plain",
    ...extra,
  });
}

async function saveTokens(t) {
  if (!t.refresh_token) throw new Error("Dropbox가 갱신 토큰을 주지 않았습니다.");
  Keychain.set(KC_REFRESH, t.refresh_token);
  Keychain.set(KC_TOKEN, JSON.stringify({ token: t.access_token, exp: Date.now() + (t.expires_in || 14400) * 1000 }));
}

// 기본: Safari에서 허용하면 Dropbox가 scriptable:///run/KnouWidget?code=… 로 돌려보내고,
// Scriptable이 이 스크립트를 다시 실행하면서 finishConnect가 코드를 받는다. 복사할 것이 없다.
async function connectDropbox() {
  if (Script.name() !== SCRIPT_NAME) {
    const a = new Alert();
    a.title = "스크립트 이름 확인";
    a.message = `자동 연결은 스크립트 이름이 "${SCRIPT_NAME}"일 때만 됩니다. 지금 이름은 "${Script.name()}"입니다. 이름을 바꾸거나 [코드로 연결]을 쓰세요.`;
    a.addAction("코드로 연결");
    a.addCancelAction("취소");
    if ((await a.presentAlert()) === -1) return false;
    return connectWithCode();
  }
  const intro = new Alert();
  intro.title = "Dropbox 연결";
  intro.message = "Safari에서 Dropbox 허용 페이지가 열립니다. 허용을 누른 뒤 \"Scriptable에서 열기\"를 고르면 연결이 끝납니다.";
  intro.addAction("열기");
  intro.addAction("코드로 연결 (자동 연결이 안 될 때)");
  intro.addCancelAction("취소");
  const i = await intro.presentAlert();
  if (i === -1) return false;
  if (i === 1) return connectWithCode();
  const verifier = randomVerifier();
  const state = randomVerifier(24);
  Keychain.set(KC_PENDING, JSON.stringify({ verifier, state, at: Date.now() }));
  Safari.open(authorizeUrl(verifier, { redirect_uri: REDIRECT_URI, state }));
  return "pending"; // 결과는 Scriptable이 이 스크립트를 다시 실행할 때 받는다
}

// 허용 페이지에서 돌아온 실행: args.queryParameters 에 code(또는 error)와 state가 들어 있다
async function finishConnect(q) {
  const pending = Keychain.contains(KC_PENDING) ? JSON.parse(Keychain.get(KC_PENDING)) : null;
  if (pending) Keychain.remove(KC_PENDING);
  if (q.error) throw new Error(q.error === "access_denied" ? "Dropbox 허용이 취소되었습니다." : `Dropbox 오류: ${q.error_description || q.error}`);
  if (!pending || pending.state !== q.state) throw new Error("연결 요청을 확인하지 못했습니다. 메뉴에서 [Dropbox 다시 연결]을 눌러 주세요.");
  const t = await postToken({ code: q.code, grant_type: "authorization_code", code_verifier: pending.verifier, client_id: APP_KEY, redirect_uri: REDIRECT_URI });
  await saveTokens(t);
}

// 예비: Scriptable 안의 Safari 창에서 허용하고, 화면에 나온 코드를 붙여넣는다 (Redirect URI 불필요)
async function connectWithCode() {
  const verifier = randomVerifier();
  await Safari.openInApp(authorizeUrl(verifier, {}), true);
  const ask = new Alert();
  ask.title = "인증 코드";
  ask.message = "허용 후 Dropbox 화면에 나온 코드를 복사했다면 아래에 들어가 있습니다.";
  ask.addTextField("Dropbox 화면의 코드", Pasteboard.paste() || "");
  ask.addAction("연결");
  ask.addCancelAction("취소");
  if ((await ask.presentAlert()) === -1) return false;
  const code = ask.textFieldValue(0).trim();
  if (!code) return false;
  await saveTokens(await postToken({ code, grant_type: "authorization_code", code_verifier: verifier, client_id: APP_KEY }));
  return true;
}

const isConnected = () => Keychain.contains(KC_REFRESH);

async function accessToken(force = false) {
  if (!force && Keychain.contains(KC_TOKEN)) {
    try {
      const c = JSON.parse(Keychain.get(KC_TOKEN));
      if (c.exp > Date.now() + 60000) return c.token;
    } catch (e) {}
  }
  const t = await postToken({ grant_type: "refresh_token", refresh_token: Keychain.get(KC_REFRESH), client_id: APP_KEY });
  Keychain.set(KC_TOKEN, JSON.stringify({ token: t.access_token, exp: Date.now() + (t.expires_in || 14400) * 1000 }));
  return t.access_token;
}

async function dbx(endpoint, arg, body) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = new Request("https://content.dropboxapi.com/2" + endpoint);
    r.method = "POST";
    r.headers = {
      Authorization: "Bearer " + (await accessToken(attempt > 0)),
      "Dropbox-API-Arg": JSON.stringify(arg),
      "Content-Type": body === undefined ? "text/plain; charset=utf-8" : "application/octet-stream",
    };
    if (body !== undefined) r.body = Data.fromString(body);
    const text = await r.loadString();
    const status = r.response.statusCode;
    if (status === 401 && attempt === 0) continue; // 토큰 만료 → 한 번 갱신
    const h = r.response.headers || {};
    const key = Object.keys(h).find((k) => k.toLowerCase() === "dropbox-api-result");
    let meta = null;
    try { meta = key ? JSON.parse(h[key]) : null; } catch (e) {}
    return { status, text, meta };
  }
}

async function dbxRpc(endpoint, body) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = new Request("https://api.dropboxapi.com/2" + endpoint);
    r.method = "POST";
    r.headers = { Authorization: "Bearer " + (await accessToken(attempt > 0)), "Content-Type": "application/json" };
    r.body = JSON.stringify(body);
    const text = await r.loadString();
    const status = r.response.statusCode;
    if (status === 401 && attempt === 0) continue;
    return { status, text };
  }
}

// 파일 정보 (없으면 null). 내용을 받지 않아 가볍다
async function metadata(path) {
  const { status, text } = await dbxRpc("/files/get_metadata", { path });
  if (status === 409 && /not_found/.test(text)) return null;
  if (status !== 200) throw new Error(`Dropbox 파일 정보 오류 ${status}`);
  return JSON.parse(text);
}

async function readTextWithRev(path) {
  const { status, text, meta } = await dbx("/files/download", { path });
  if (status === 409 && /not_found/.test(text)) return { text: null, rev: null };
  if (status !== 200) throw new Error(`Dropbox 읽기 오류 ${status}`);
  return { text: text.replace(/^\uFEFF/, ""), rev: meta?.rev || null };
}
const readText = async (path) => (await readTextWithRev(path)).text;

// rev가 있으면 그 버전일 때만 덮어씀 (그 사이 다른 곳에서 고쳤으면 conflict), 없으면 새 파일로만 만듦
async function writeTextIfUnchanged(path, text, rev) {
  const mode = rev ? { ".tag": "update", update: rev } : { ".tag": "add" };
  const { status, text: body, meta } = await dbx("/files/upload", { path, mode, autorename: false, mute: true }, text);
  if (status === 409 && /conflict/.test(body)) return { conflict: true };
  if (status !== 200) throw new Error(`Dropbox 저장 오류 ${status}`);
  let rev2 = null;
  try { rev2 = JSON.parse(body).rev; } catch (e) { rev2 = meta?.rev || null; }
  return { ok: true, rev: rev2 };
}

// knou_scope.txt → [{ course, kind, scope }]
//   과목명과 같은 줄 = 과목 제목 (공백 무시하고 비교)
//   "중간평가:" / "기말평가:" (또는 "중간:", "기말:")로 시작하는 줄부터 다음 표시·다음 과목 전까지 = 그 평가의 내용
//   과목 제목 바로 아래, 평가 표시 앞의 줄 = 과목 메모. 첫 과목 제목 위의 줄은 버림
function parseScopeTxt(text, courses) {
  const norm = (t) => String(t).replace(/\s+/g, "");
  const items = [];
  const preamble = [];
  let cur = null, kind = "", buf = [];
  const flush = () => {
    const body = buf.join("\n").replace(/^\s*\n+|\s+$/g, "").trim();
    if (cur && body) items.push({ course: cur, kind, scope: body });
    buf = [];
  };
  for (const raw of String(text || "").split(/\r?\n/)) {
    const t = raw.trim();
    const c = t && courses.find((x) => norm(x) === norm(t));
    if (c) { flush(); cur = c; kind = ""; continue; }
    const m = /^(중간평가|기말평가|기말시험|중간|기말)\s*[:：]\s*(.*)$/.exec(t);
    if (m && cur) { flush(); kind = m[1].startsWith("중간") ? "중간평가" : "기말평가"; buf = [m[2]]; continue; }
    if (cur) buf.push(raw.replace(/\s+$/, ""));
    else preamble.push(raw.replace(/\s+$/, ""));
  }
  flush();
  return { format: "txt", items, preamble: preamble.join("\n").replace(/\s+$/, "") };
}

async function readJSON(path) {
  const { status, text } = await dbx("/files/download", { path });
  if (status === 409 && /not_found/.test(text)) return null;
  if (status !== 200) throw new Error(`Dropbox 읽기 오류 ${status}`);
  return JSON.parse(text.replace(/^﻿/, ""));
}

async function writeJSON(path, obj) {
  const { status } = await dbx("/files/upload", { path, mode: "overwrite", mute: true }, JSON.stringify(obj, null, 2) + "\n");
  if (status !== 200) throw new Error(`Dropbox 저장 오류 ${status}`);
}

// ---------------- 캐시 (오프라인일 때 마지막 내용) ----------------
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), "knou_widget_cache.json");
function saveCache(d) { try { fm.writeString(cachePath, JSON.stringify(d)); } catch (e) {} }
function loadCache() { try { return fm.fileExists(cachePath) ? JSON.parse(fm.readString(cachePath)) : null; } catch (e) { return null; } }

// 확장이 넣은 notes → 위젯이 쓰는 모양 [{ course, kind, scope }]
function notesToScope(notes) {
  const items = [];
  for (const [course, n] of Object.entries(notes || {})) {
    for (const [k, kind] of [["mid", "중간평가"], ["final", "기말평가"], ["memo", ""]]) {
      const body = String(n?.[k] || "").trim();
      if (body) items.push({ course, kind, scope: body });
    }
  }
  return { format: "notes", items };
}

// 과제 메모 고르기:
//   txt의 rev가 notesRev와 같으면 → JSON의 notes (txt를 내려받지 않음)
//   다르면(이 스크립트·메모장에서 고친 뒤 아직 PC에서 동기화 전) → txt를 직접 읽음 (더 최신)
//   txt가 없으면 → notes, 그것도 없으면 예전 json
async function loadScope(agenda) {
  const meta = await metadata(SCOPE_TXT_PATH);
  if (agenda?.notes && (!meta || meta.rev === agenda.notesRev)) return notesToScope(agenda.notes);
  if (meta) {
    const txt = await readText(SCOPE_TXT_PATH);
    if (txt !== null) return parseScopeTxt(txt, coursesOf(agenda));
  }
  return agenda?.notes ? notesToScope(agenda.notes) : await readJSON(SCOPE_PATH);
}

async function loadData() {
  try {
    const agenda = await readJSON(AGENDA_PATH);
    const scope = await loadScope(agenda);
    const d = { agenda, scope, fetchedAt: Date.now() };
    saveCache(d);
    return { ...d, offline: false };
  } catch (e) {
    const c = loadCache();
    if (c) return { ...c, offline: true, error: String(e.message || e) };
    throw e;
  }
}

// ---------------- 글자 크기 ----------------
// 앱 메뉴 [글자 크기]에서 고른 값이 모든 위젯에 적용되고, 위젯 Parameter에 크기 낱말을 적으면 그 위젯만 바뀐다
const SIZES = [["작게", 0.9], ["보통", 1], ["크게", 1.15], ["아주 크게", 1.3]];
const settingsPath = fm.joinPath(fm.documentsDirectory(), "knou_widget_settings.json");
function loadSettings() { try { return fm.fileExists(settingsPath) ? JSON.parse(fm.readString(settingsPath)) : {}; } catch (e) { return {}; } }
function saveSettings(o) { try { fm.writeString(settingsPath, JSON.stringify({ ...loadSettings(), ...o })); } catch (e) {} }
let SCALE = Number(loadSettings().fontScale) || 1;
const fs = (n) => Math.max(8, Math.round(n * SCALE * 2) / 2);

// Parameter 해석: "1,2 크게", "1, 2크게", "크게 인간과사회" 등 → { courses: "1,2", scale }
function parseParam(param) {
  let t = String(param || "");
  let scale = null;
  for (const [word, v] of SIZES.slice().sort((a, b) => b[0].length - a[0].length)) {
    const re = new RegExp(word.replace(" ", "\\s*"));
    if (re.test(t)) { scale = v; t = t.replace(re, " "); break; }
  }
  return { courses: t.trim(), scale };
}

async function chooseFontSize() {
  const a = new Alert();
  a.title = "글자 크기";
  a.message = "모든 위젯에 적용됩니다. 위젯 Parameter에 \"크게\"처럼 적으면 그 위젯만 따로 바뀝니다.";
  SIZES.forEach(([w, v]) => a.addAction(`${w}${Math.abs(v - SCALE) < 0.01 ? " ✓" : ""}`));
  a.addCancelAction("취소");
  const i = await a.presentSheet();
  if (i < 0) return;
  SCALE = SIZES[i][1];
  saveSettings({ fontScale: SCALE });
}

// Parameter의 과목 부분 → 화면 종류
function viewOf(courseText) {
  const t = String(courseText || "").trim();
  if (!t) return "grid";
  if (t === "0") return "summary";
  return "picked";
}

// ---------------- 일정 가공 ----------------
const DAY = 86400000;
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const p2 = (n) => String(n).padStart(2, "0");
const md = (d) => `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`;
const hm = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const targetOf = (it) => (it.due || !it.start ? new Date(it.end) : new Date(it.start));
const ddayOf = (it, now) => Math.round((startOfDay(targetOf(it)) - startOfDay(now)) / DAY);
function ddayText(it, now) {
  const n = ddayOf(it, now);
  if (n < 0) return "진행 중";
  if (n === 0) return "오늘";
  if (n === 1) return "내일";
  return `D-${n}`;
}
const ddayColor = (it, now) => { const n = ddayOf(it, now); return n <= 3 ? C.red : n <= 7 ? C.orange : C.sub; };

function whenText(it, now) {
  const s = it.start ? new Date(it.start) : null;
  const e = new Date(it.end);
  if (it.due) {
    if (s && s > now) return `제출 ${md(s)} ~ ${md(e)} ${hm(e)}`;
    if (s) return `${md(e)} ${hm(e)} 마감 (제출 중)`;
    return `${md(e)} ${hm(e)} 마감`;
  }
  if (s) return startOfDay(s) === startOfDay(e) ? `${md(s)} ${hm(s)}–${hm(e)}` : `${md(s)} ${hm(s)} ~ ${md(e)} ${hm(e)}`;
  return `${md(e)} ${hm(e)}`;
}

const upcoming = (agenda, now) =>
  (agenda?.items || []).filter((it) => new Date(it.end) >= now).sort((a, b) => targetOf(a) - targetOf(b));

function coursesOf(agenda) {
  const list = (agenda?.courses || []).filter(Boolean);
  if (list.length) return list;
  return [...new Set((agenda?.items || []).map((i) => i.course).filter((c) => c && c !== "형성평가"))];
}

const kindOfScope = (k) => (/중간/.test(k || "") ? "mid" : /기말/.test(k || "") ? "final" : "");
const scopesFor = (scope, course) => (scope?.items || []).filter((s) => s.course === course && String(s.scope || "").trim());

// 과목 하나의 요약: 남은 일정, 범위(다음 평가 것이 먼저)
function courseView(data, course, now) {
  const items = upcoming(data.agenda, now).filter((i) => i.course === course);
  const next = items[0] || null;
  // 순서: 가장 가까운 평가(중간·기말)의 내용 → 다른 평가 → 과목 메모
  const nextEval = items.find((i) => i.kind === "mid" || i.kind === "final");
  const rank = (x) => (!kindOfScope(x.kind) ? 2 : nextEval && kindOfScope(x.kind) === nextEval.kind ? 0 : 1);
  const scopes = scopesFor(data.scope, course).slice().sort((a, b) => rank(a) - rank(b));
  return { course, items, next, scopes };
}

// 위젯 칸 매개변수: "1,2" 또는 과목명(쉼표로 구분). 비어 있으면 []
function pickCourses(param, courses) {
  return String(param || "").split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean).map((t) => {
    if (/^\d+$/.test(t)) return courses[Number(t) - 1];
    return courses.find((c) => c === t) || courses.find((c) => c.includes(t));
  }).filter(Boolean);
}

// ---------------- 위젯 그리기 ----------------

// 한 줄(줄바꿈 없는 문단)이 화면에서 몇 줄로 접히는지 어림. 너비는 em(한글 한 글자 = 1), 띄어쓰기 단위로 접힘
function charEm(ch) {
  if (ch === " ") return 0.3;
  if (/[0-9]/.test(ch)) return 0.6;
  if (/[A-Za-z]/.test(ch)) return 0.55;
  if (/[.,·:;'"‘’“”()\[\]\-~!?\/]/.test(ch)) return 0.35;
  return 1; // 한글·한자·원문자(①) 등
}
function wrapLine(line, per) {
  let lines = 1, cur = 0;
  for (const word of line.split(" ")) {
    let w = 0;
    for (const ch of word) w += charEm(ch);
    const add = (cur > 0 ? 0.3 : 0) + w;
    if (cur > 0 && cur + add > per) { lines++; cur = w; }
    else cur += add;
    while (cur > per) { lines++; cur -= per; } // 한 낱말이 한 줄보다 길 때
  }
  return lines;
}
// 홈 화면 착색(틴트)·투명 모드에서는 색이 단색으로 바뀌므로, 배경색 칸 대신 글자 굵기와 테두리로 구분한다
function txt(stack, s, font, color, lines) {
  const t = stack.addText(String(s));
  t.font = font;
  t.textColor = color || C.text;
  if (lines) t.lineLimit = lines;
  return t;
}

const runUrl = (q) => `scriptable:///run/${encodeURIComponent(Script.name())}?${form(q)}`;

function header(w, data, now, title) {
  const h = w.addStack();
  h.centerAlignContent();
  const sem = data.agenda?.semester ? " · " + data.agenda.semester.replace("-", "학년도 ") + "학기" : "";
  txt(h, title || `방통대${sem}`, Font.boldSystemFont(fs(15)));
  h.addSpacer();
  const saved = data.agenda?.savedAt ? new Date(data.agenda.savedAt) : null;
  const note = (saved ? `PC 동기화 ${startOfDay(saved) === startOfDay(now) ? "" : md(saved) + " "}${hm(saved)}` : "") + (data.offline ? " · 오프라인" : "");
  txt(h, note, Font.systemFont(fs(11)), data.offline ? C.orange : C.sub);
}

function message(w, title, body) {
  w.addSpacer();
  txt(w, title, Font.boldSystemFont(fs(15)));
  if (body) { w.addSpacer(4); txt(w, body, Font.systemFont(fs(12)), C.sub); }
  w.addSpacer();
}

// 일정 한 줄: "내일  중간평가 · 11/9(월) 18:00 마감"
function itemLine(stack, it, now, size) {
  const row = stack.addStack();
  row.centerAlignContent();
  const d = txt(row, ddayText(it, now), Font.boldSystemFont(fs(size)), ddayColor(it, now), 1);
  row.addSpacer(6);
  txt(row, `${it.label} · ${whenText(it, now)}`, Font.systemFont(fs(size - 1)), C.sub, 1).minimumScaleFactor = 0.75;
  return row;
}

// 과목 칸 (A 방식의 격자 한 칸 / B 방식의 넓은 칸 공통)
function courseCard(parent, v, now, opt) {
  const card = parent.addStack();
  card.layoutVertically();
  if (opt.compact) card.setPadding(8, 10, 8, 10); // 격자: 두 줄을 한 위젯에 넣어야 해서 여백을 조금 줄임
  else card.setPadding(10, 12, opt.fill ? 6 : 10, 12);
  card.cornerRadius = 12;
  card.borderWidth = 1;
  card.borderColor = C.line;
  card.url = runUrl({ course: v.course });
  // 너비는 고정하지 않는다: 첫 줄의 늘어나는 여백 덕분에 칸들이 위젯 너비를 나눠 채운다
  card.spacing = opt.compact ? 3 : 4;

  const top = card.addStack();
  top.centerAlignContent();
  txt(top, v.course, Font.boldSystemFont(fs(opt.big ? 16 : 14)), C.text, 1).minimumScaleFactor = 0.7;
  top.addSpacer();
  if (v.next) txt(top, ddayText(v.next, now), Font.boldSystemFont(fs(opt.big ? 15 : 13)), ddayColor(v.next, now), 1);

  // 일정: 짧게 (현재 방식 그대로)
  if (!v.items.length) txt(card, "남은 일정 없음", Font.systemFont(fs(11)), C.sub);
  for (const it of v.items.slice(0, opt.items)) itemLine(card, it, now, opt.big ? 12 : 11);
  if (v.items.length > opt.items) txt(card, `외 ${v.items.length - opt.items}건`, Font.systemFont(fs(10.5)), C.sub);

  // 과제 내용·시험 범위: 칸의 중심. 다음 평가 것이 먼저, 과목 메모는 뒤
  card.addSpacer(opt.compact ? 2 : 4);
  const hasScopes = v.scopes.length > 0;
  if (hasScopes) {
    let left = opt.scopeLines; // 칸 안에서 쓸 수 있는 줄 수를 항목끼리 나눔
    const cpl = Math.max(6, (opt.cpl || 20) / SCALE); // 한 줄 너비 (본문 글자 크기의 em 단위, 한글 한 글자 = 1)
    const wrapCount = (body, per) => body.split("\n").reduce((n, l) => n + wrapLine(l, per), 0);
    if (opt.fill) {
      // 꽉 채우기: 줄 수 제한을 두지 않고 원래 크기로 넣는다. 칸 높이는 위젯(iOS)이 정하고,
      // 남은 높이만큼 글자가 차고 넘치는 부분은 위젯이 "…"로 자른다 (눌러서 상세 화면)
      v.scopes.forEach((s) => {
        txt(card, s.kind || "메모", Font.semiboldSystemFont(fs(12)), C.blue, 1);
        txt(card, String(s.scope).trim(), Font.systemFont(fs(14)), C.text, 0);
      });
      v.scopes = []; // 아래 일반 경로는 건너뜀
    }
    v.scopes.forEach((s, i) => {
      if (left <= 0 && !opt.fill) return;
      const body = String(s.scope).trim();
      // 줄바꿈 수가 아니라 화면에서 접히는 줄 수로 센다. 마지막 항목은 남은 줄을 모두 쓴다
      const wrapped = wrapCount(body, cpl);
      const last = i === v.scopes.length - 1;
      const want = last ? left : Math.min(left, Math.max(2, wrapped + 1));
      txt(card, s.kind || "메모", Font.semiboldSystemFont(fs(opt.big ? 12 : 11)), C.blue, 1);
      const t = txt(card, body, Font.systemFont(fs(opt.big ? 14 : 13)), C.text, Math.max(1, want - 1));
      t.minimumScaleFactor = 0.85;
      left -= want;
    });
  } else {
    txt(card, "과제 내용 없음", Font.systemFont(fs(12)), C.sub);
  }
  card.addSpacer(); // 칸 테두리는 위젯 아래 끝까지 늘림
  return card;
}

// 요약: 같은 마감을 한 줄로 묶어 가까운 순서대로
function summaryRows(data, now, limit) {
  const groups = [];
  for (const it of upcoming(data.agenda, now).filter((i) => i.course !== "형성평가")) { // 형성평가는 맨 아래 한 줄로 따로
    const key = `${it.kind}|${it.label}|${it.start}|${it.end}|${it.detail}`;
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, it, courses: [] }));
    g.courses.push(it.course);
  }
  return groups.slice(0, limit);
}

function drawSummary(w, data, now, limit, size) {
  const col = w.addStack();
  col.layoutVertically();
  col.spacing = 7;
  const rows = summaryRows(data, now, limit);
  if (!rows.length) txt(col, "남은 일정 없음", Font.systemFont(fs(13)), C.sub);
  for (const g of rows) {
    const row = col.addStack();
    row.topAlignContent();
    const dd = row.addStack();
    dd.size = new Size(size >= 13 ? 52 : 44, 0);
    txt(dd, ddayText(g.it, now), Font.boldSystemFont(fs(size)), ddayColor(g.it, now), 1);
    const body = row.addStack();
    body.layoutVertically();
    const who = g.it.course === "형성평가" ? "형성평가" : g.courses.join(", ");
    txt(body, `${g.it.course === "형성평가" ? "" : g.it.label + " · "}${who}`, Font.semiboldSystemFont(fs(size)), C.text, 1).minimumScaleFactor = 0.7;
    txt(body, [whenText(g.it, now), g.it.detail, g.it.kind === "class" ? g.it.place : ""].filter(Boolean).join(" · "), Font.systemFont(fs(size - 1)), C.sub, 1).minimumScaleFactor = 0.75;
    row.addSpacer();
    if (g.courses.length === 1 && g.it.course !== "형성평가") row.url = runUrl({ course: g.it.course });
  }
}

// 맨 아래 한 줄: 왼쪽 형성평가, 오른쪽 "외 N과목" (격자에서 다 못 보여 준 과목 수. 둘 다 없으면 줄도 없음)
function formativeLine(w, data, now, extra) {
  const f = upcoming(data.agenda, now).find((i) => i.course === "형성평가");
  if (!f && !extra) return;
  w.addSpacer(extra === undefined ? 6 : 4);
  const r = w.addStack();
  r.centerAlignContent();
  if (f) {
    txt(r, "형성평가 ", Font.semiboldSystemFont(fs(11)), C.sub, 1);
    txt(r, `${ddayText(f, now)} · ${whenText(f, now)}`, Font.systemFont(fs(11)), C.sub, 1).minimumScaleFactor = 0.7;
  }
  if (extra) {
    r.addSpacer();
    txt(r, `외 ${extra}과목 더 보기`, Font.systemFont(fs(11)), C.sub, 1);
  }
}

// A: 위젯 하나에 과목 칸 격자. 칸을 누르면 그 과목 상세 화면
// 칸을 그렸으면 { extra: 다 못 보여 준 과목 수 }를, 다른 것(안내·요약)을 그렸으면 null을 돌려준다
function drawGrid(w, data, now, family) {
  const courses = coursesOf(data.agenda);
  if (!courses.length) { message(w, "과목 정보가 없습니다"); return null; }
  if (family === "medium") { drawSummary(w, data, now, 3, 13); return null; }
  const cols = family === "extraLarge" ? 3 : 2;
  const rowsMax = family === "extraLarge" ? 2 : 3;
  const shown = courses.slice(0, cols * rowsMax);
  const rowCount = Math.ceil(shown.length / cols);
  const opt = family === "extraLarge"
    ? { items: rowCount > 1 ? 1 : 2, scopeLines: rowCount > 1 ? 5 : 9, cpl: 19, compact: true } // 일정은 1~2줄, 나머지는 과제 내용
    : { items: 1, scopeLines: 3, cpl: 15, compact: true };
  const grid = w.addStack();
  grid.layoutVertically();
  grid.spacing = 6;
  for (let r = 0; r < rowCount; r++) {
    const row = grid.addStack();
    row.spacing = 6;
    for (let c = 0; c < cols; c++) {
      const course = shown[r * cols + c];
      if (course) courseCard(row, courseView(data, course, now), now, opt);
      else { const blank = row.addStack(); blank.addSpacer(); } // 빈 칸도 같은 몫의 너비를 차지
    }
  }
  return { extra: courses.length - shown.length }; // "외 N과목"은 맨 아래 형성평가 줄에 함께 넣는다 (formativeLine)
}

// B: 매개변수로 고른 과목을 크게. 비어 있으면 요약
function drawPicked(w, data, now, family, param) {
  const courses = coursesOf(data.agenda);
  const picked = pickCourses(param, courses);
  if (!picked.length) {
    message(w, `"${param}"에 맞는 과목이 없습니다`, courses.map((c, i) => `${i + 1} ${c}`).join("  "));
    return;
  }
  const n = family === "extraLarge" ? Math.min(2, picked.length) : 1;
  const row = w.addStack();
  row.spacing = 10;
  for (const course of picked.slice(0, n)) {
    // 한 줄 너비(em). 11/12 아이패드 특대형 한 과목에서 14pt 한 줄 ≈ 한글 41자 + 띄어쓰기 12개 ≈ 44.6em
    const cpl = family === "extraLarge" ? (n === 1 ? 44 : 21) : 21;
    courseCard(row, courseView(data, course, now), now, { big: true, items: family === "medium" ? 1 : 2, scopeLines: family === "medium" ? 3 : 14, cpl, fill: family !== "medium" });
  }
}

async function buildWidget(family, rawParam) {
  const pp = parseParam(rawParam);
  SCALE = pp.scale || Number(loadSettings().fontScale) || 1;
  const param = pp.courses;
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(14, 16, 14, 16);
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MIN * 60000);
  w.url = runUrl({ view: "all" });
  const now = new Date();

  if (!isConnected()) { message(w, "Dropbox 연결 필요", "Scriptable 앱에서 KnouWidget 스크립트를 한 번 실행해 Dropbox를 연결하세요."); return w; }
  let data;
  try { data = await loadData(); } catch (e) { message(w, "불러오지 못했습니다", String(e.message || e)); return w; }
  if (!data.agenda) { message(w, "일정 파일이 없습니다", "PC에서 Knou calendar로 [동기화 확인 & Dropbox 내보내기]를 한 번 실행하세요."); return w; }

  if (family === "small") {
    const it = upcoming(data.agenda, now)[0];
    txt(w, "방통대", Font.boldSystemFont(fs(13)), C.sub);
    w.addSpacer(6);
    if (!it) { txt(w, "남은 일정 없음", Font.systemFont(fs(13)), C.sub); return w; }
    txt(w, ddayText(it, now), Font.boldSystemFont(fs(20)), ddayColor(it, now), 1);
    txt(w, it.course, Font.semiboldSystemFont(fs(14)), C.text, 2);
    txt(w, `${it.label} · ${whenText(it, now)}`, Font.systemFont(fs(11)), C.sub, 3);
    if (it.course !== "형성평가") w.url = runUrl({ course: it.course });
    w.addSpacer();
    return w;
  }

  const view = viewOf(param);
  const picked = view === "picked" ? pickCourses(param, coursesOf(data.agenda)) : [];
  header(w, data, now, picked.length ? picked.slice(0, family === "extraLarge" ? 2 : 1).join(" · ") : "");
  const cards = view === "grid" && family !== "medium"; // 과목 칸 격자를 그리는 경우
  w.addSpacer(cards ? 6 : 10);
  let grid = null;
  if (view === "grid") grid = drawGrid(w, data, now, family);
  else if (view === "summary") drawSummary(w, data, now, family === "extraLarge" || family === "large" ? 7 : 3, 13);
  else drawPicked(w, data, now, family, param);
  // 칸이 있는 화면(격자, 과목 크게)은 칸이 아래 끝까지 차도록 위젯 쪽 빈칸을 두지 않는다
  if (grid) formativeLine(w, data, now, grid.extra);
  else if (view !== "picked") { formativeLine(w, data, now); w.addSpacer(); }
  return w;
}

// ---------------- 상세 화면 (스크롤 가능한 웹 화면) ----------------
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// [복사]로 넣을 글: 적힌 항목이 하나면 내용만, 여럿이면 "기말평가" 같은 제목을 붙이고 빈 줄로 나눈다
function scopeCopyText(scopes) {
  const filled = scopes.filter((s) => String(s.scope || "").trim());
  if (filled.length === 1) return String(filled[0].scope).trim();
  return filled.map((s) => `${s.kind || "메모"}\n${String(s.scope).trim()}`).join("\n\n");
}

function detailHtml(data, courses, now) {
  const all = data.agenda?.items || [];
  const copies = []; // 과목 순서대로 복사할 글 (없으면 "")
  const sections = courses.map((course, idx) => {
    const v = courseView(data, course, now);
    const past = all.filter((i) => i.course === course && new Date(i.end) < now).sort((a, b) => targetOf(b) - targetOf(a));
    const scopes = (data.scope?.items || []).filter((s) => s.course === course);
    copies.push(scopeCopyText(scopes));
    const li = (it, old) => `<li class="${old ? "old" : ""}"><b class="d ${old ? "" : ddayOf(it, now) <= 3 ? "r" : ddayOf(it, now) <= 7 ? "o" : ""}">${old ? "지남" : esc(ddayText(it, now))}</b><span><b>${esc(it.label)}</b>${it.detail ? " · " + esc(it.detail) : ""}<br><small>${esc(whenText(it, now))}${it.kind === "class" && it.place ? " · " + esc(it.place) : ""}</small></span></li>`;
    const copyBtn = copies[idx] ? `<button class="copy" onclick="copyScope(${idx})">과제 내용 복사</button>` : "";
    const dday = v.next ? `<span class="d ${ddayOf(v.next, now) <= 3 ? "r" : ddayOf(v.next, now) <= 7 ? "o" : ""}">${esc(ddayText(v.next, now))}</span>` : "";
    // 제목 줄: 왼쪽 과목명, 오른쪽에 [과제 내용 복사]와 남은 날짜 (좁은 화면에서는 오른쪽 묶음이 아랫줄로 내려감)
    return `<section><h2><span>${esc(course)}</span>${copyBtn || dday ? `<span class="act">${copyBtn}${dday}</span>` : ""}</h2>
      <h3>과제 내용·시험 범위</h3>${scopes.length ? scopes.map((s) => `<p class="scope"><b>${esc(s.kind || "메모")}</b> ${String(s.scope || "").trim() ? esc(s.scope).replace(/\n/g, "<br>") : '<span class="muted">비어 있음</span>'}</p>`).join("") : '<p class="muted">적힌 내용이 없습니다.</p>'}
      <h3>남은 일정</h3><ul>${v.items.map((i) => li(i, false)).join("") || '<li class="muted">없음</li>'}</ul>
      ${past.length ? `<details><summary>지난 일정 ${past.length}건</summary><ul>${past.map((i) => li(i, true)).join("")}</ul></details>` : ""}</section>`;
  }).join("");
  const saved = data.agenda?.savedAt ? new Date(data.agenda.savedAt) : null;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#fff;--fg:#1c1c1e;--sub:#6e6e73;--line:#e5e5ea;--r:#d70015;--o:#c93400;--card:#f7f7f9}
@media (prefers-color-scheme:dark){:root{--bg:#1c1c1e;--fg:#f2f2f7;--sub:#a1a1a6;--line:#38383a;--r:#ff6961;--o:#ffb340;--card:#2c2c2e}}
body{margin:0;padding:20px 20px 40px;background:var(--bg);color:var(--fg);font:16px -apple-system,system-ui,sans-serif;line-height:1.45}
header{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:12px}
header h1{font-size:22px;margin:0}header small{color:var(--sub)}
section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:12px 0}
h2{font-size:19px;margin:0 0 6px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px 12px}
.act{display:flex;align-items:center;gap:12px;margin-left:auto}.act .d{min-width:0}
h3{font-size:13px;color:var(--sub);margin:12px 0 4px;font-weight:600}
ul{list-style:none;margin:0;padding:0}li{display:flex;gap:10px;padding:6px 0;border-top:1px solid var(--line)}li:first-child{border-top:0}
.d{min-width:52px;color:var(--sub);font-weight:700}.d.r{color:var(--r)}.d.o{color:var(--o)}
small,.muted{color:var(--sub)}.old{opacity:.55}.scope{margin:4px 0}
details summary{color:var(--sub);font-size:14px;margin-top:10px}
.copy{padding:8px 16px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:#0a84ff;font:600 16px -apple-system,system-ui,sans-serif}
.copy:active{opacity:.5}
#pop{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);z-index:9}
#pop[hidden]{display:none}
#pop .box{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 24px 14px;min-width:240px;max-width:80%;text-align:center}
#pop p{margin:0 0 14px;font-size:16px}
#pop button{width:100%;padding:10px 0 4px;border:0;border-top:1px solid var(--line);background:none;color:#0a84ff;font:600 16px -apple-system,system-ui,sans-serif}
</style></head><body><header><h1>${courses.length === 1 ? esc(courses[0]) : "전체 과목"}</h1><small>${saved ? "PC 동기화 " + esc(md(saved) + " " + hm(saved)) : ""}${data.offline ? " · 오프라인" : ""}</small></header>${sections}
<p class="muted" style="font-size:13px">닫으면 메모 편집 메뉴가 나옵니다. (원본: Dropbox › Apps › KnouWidget › knou_scope.txt)</p>
<div id="pop" hidden onclick="this.hidden=true"><div class="box"><p id="popMsg"></p><button>확인</button></div></div>
<script>
var COPY = ${JSON.stringify(copies).replace(/</g, "\\u003c")};
function say(msg) { document.getElementById("popMsg").textContent = msg; document.getElementById("pop").hidden = false; }
// [복사]: 보이지 않는 글상자에 넣고 선택해서 복사한다 (이 화면에는 navigator.clipboard가 없음)
function copyScope(i) {
  var text = COPY[i] || "", ok = false;
  try {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    ok = document.execCommand("copy");
    document.body.removeChild(ta);
  } catch (e) {}
  say(ok ? "과제 내용이 복사되었습니다." : "복사하지 못했습니다. 글자를 길게 눌러 직접 복사해 주세요.");
}
</script></body></html>`;
}

async function showDetail(courses) {
  const data = await loadData();
  if (!data.agenda) throw new Error("일정 파일이 없습니다. PC에서 Knou calendar로 동기화·내보내기를 먼저 하세요.");
  const list = courses.length ? courses : coursesOf(data.agenda);
  const wv = new WebView();
  await wv.loadHTML(detailHtml(data, list, new Date()));
  // 주의: v1.1.6은 화면을 띄운 채 wv.evaluateJavaScript(…, true)로 [복사]를 기다렸는데, 실제 기기에서 화면이 비었다.
  // 그래서 [복사]는 웹 화면 안에서만 처리하고, 여기서는 v1.1.5까지와 똑같이 띄우기만 한다
  await wv.present(true);
  // 닫은 뒤: 바로 편집할 수 있게
  const m = new Alert();
  m.title = list.length === 1 ? list[0] : "전체 과목";
  m.addAction(list.length === 1 ? "이 과목 메모 편집" : "과제 메모 편집");
  m.addAction("다른 과목 보기");
  m.addCancelAction("닫기");
  const i = await m.presentSheet();
  if (i === 0) await editMemos(list.length === 1 ? list[0] : null);
  if (i === 1) {
    const all = coursesOf(data.agenda);
    const s = new Alert();
    s.title = "과목 선택";
    all.forEach((c, n) => s.addAction(`${n + 1}  ${c}`));
    s.addAction("전체");
    s.addCancelAction("취소");
    const k = await s.presentSheet();
    if (k >= 0) await showDetail(k < all.length ? [all[k]] : []);
  }
}

// ---------------- 과제 메모 편집기 (knou_scope.txt를 고침) ----------------
// 과목마다 [중간평가 / 기말평가 / 메모] 칸. 저장하면 정해진 txt 형식으로 다시 쓴다.
// 머리말(첫 과목 위의 줄)은 그대로 살리고, 저장 전에 Dropbox 파일 버전을 확인한다.
function memoOf(scope, course) {
  const get = (k) => (scope?.items || []).filter((x) => x.course === course && (x.kind || "") === k).map((x) => x.scope).join("\n\n");
  return { mid: get("중간평가"), final: get("기말평가"), memo: get("") };
}

function scopeToTxt(preamble, courses, memos) {
  const out = [];
  if (preamble) out.push(preamble, "");
  for (const c of courses) {
    const m = memos[c] || { mid: "", final: "", memo: "" };
    out.push(c);
    if (m.memo.trim()) out.push(m.memo.replace(/\s+$/, ""));
    out.push(`중간평가: ${m.mid.replace(/\s+$/, "")}`.replace(/\s+$/, ""));
    out.push(`기말평가: ${m.final.replace(/\s+$/, "")}`.replace(/\s+$/, ""));
    out.push("");
  }
  return out.join("\n");
}

function editorHtml(courses, memos, focus) {
  const box = (c, k, label, ph) => `<label>${label}</label><textarea data-c="${esc(c)}" data-k="${k}" placeholder="${esc(ph)}">${esc(memos[c]?.[k] || "")}</textarea>`;
  const sections = courses.map((c, i) => `<section id="c${i}"><h2>${esc(c)}</h2>
    ${box(c, "mid", "중간평가", "시험 범위, 과제 내용 등")}
    ${box(c, "final", "기말평가", "레포트 주제·분량, 시험 범위 등")}
    ${box(c, "memo", "과목 메모", "교재, 참고 사항 등")}</section>`).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#fff;--fg:#1c1c1e;--sub:#6e6e73;--line:#d1d1d6;--card:#f7f7f9;--field:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#1c1c1e;--fg:#f2f2f7;--sub:#a1a1a6;--line:#48484a;--card:#2c2c2e;--field:#1c1c1e}}
body{margin:0;padding:16px 16px 60px;background:var(--bg);color:var(--fg);font:16px -apple-system,system-ui,sans-serif}
.note{color:var(--sub);font-size:14px;margin:0 0 8px}
section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:12px 0}
h2{font-size:18px;margin:2px 0 6px}
label{display:block;color:var(--sub);font-size:13px;font-weight:600;margin:10px 0 4px}
textarea{width:100%;box-sizing:border-box;min-height:64px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--field);color:var(--fg);font:16px -apple-system,system-ui,sans-serif;resize:vertical}
</style></head><body>
<p class="note">다 고친 뒤 왼쪽 위 <b>완료</b>를 누르면 저장할지 묻습니다. 칸은 아래로 늘릴 수 있고, 여러 줄로 써도 됩니다.</p>
${sections}
<script>
function grow(t){t.style.height='auto';t.style.height=Math.max(64,t.scrollHeight+2)+'px'}
document.querySelectorAll('textarea').forEach(t=>{grow(t);t.addEventListener('input',()=>grow(t))});
function collect(){const o={};document.querySelectorAll('textarea').forEach(t=>{(o[t.dataset.c]=o[t.dataset.c]||{})[t.dataset.k]=t.value});return JSON.stringify(o)}
${focus >= 0 ? `document.getElementById('c${focus}').scrollIntoView();` : ""}
</script></body></html>`;
}

async function editMemos(focusCourse) {
  const agenda = await readJSON(AGENDA_PATH);
  if (!agenda) throw new Error("일정 파일이 없습니다. PC에서 Knou calendar로 동기화·내보내기를 먼저 하세요.");
  const courses = coursesOf(agenda);
  let draft = null; // 충돌 뒤 다시 열 때 이어 쓸 내용은 없음 (클립보드로 넘김)
  for (;;) {
    // 서버의 최신 내용과 그 버전(rev)
    const { text, rev } = await readTextWithRev(SCOPE_TXT_PATH);
    // txt가 아직 없으면 예전 json 내용으로 시작 (저장하면 txt가 새로 생김)
    const parsed = text !== null ? parseScopeTxt(text, courses) : { items: (await readJSON(SCOPE_PATH))?.items || [], preamble: "" };
    const original = {};
    for (const c of courses) original[c] = memoOf(parsed, c);
    let values = draft || original;

    // 편집 → 닫기 → 저장/다시 편집/취소 (다시 편집은 고친 내용 그대로, 같은 버전 기준으로)
    for (;;) {
      const wv = new WebView();
      await wv.loadHTML(editorHtml(courses, values, courses.indexOf(focusCourse)));
      await wv.present(true);
      values = JSON.parse(await wv.evaluateJavaScript("collect()"));
      const changed = courses.some((c) => ["mid", "final", "memo"].some((k) => (values[c]?.[k] || "") !== (original[c]?.[k] || "")));
      if (!changed) return;

      const ask = new Alert();
      ask.title = "과제 메모를 저장할까요?";
      ask.message = "Dropbox의 knou_scope.txt에 저장합니다.";
      ask.addAction("저장");
      ask.addDestructiveAction("저장하지 않고 닫기");
      ask.addCancelAction("다시 편집");
      const a = await ask.presentAlert();
      if (a === 1) return;
      if (a === -1) continue;
      break;
    }

    const memos = {};
    for (const c of courses) memos[c] = { mid: values[c]?.mid || "", final: values[c]?.final || "", memo: values[c]?.memo || "" };
    const res = await writeTextIfUnchanged(SCOPE_TXT_PATH, scopeToTxt(parsed.preamble, courses, memos), rev);
    if (res.conflict) {
      Pasteboard.copy(courses.filter((x) => memos[x].mid || memos[x].final || memos[x].memo)
        .map((x) => `${x}\n중간평가: ${memos[x].mid}\n기말평가: ${memos[x].final}${memos[x].memo ? "\n메모: " + memos[x].memo : ""}`).join("\n\n"));
      const c = new Alert();
      c.title = "다른 곳에서 먼저 고쳤습니다";
      c.message = "편집하는 사이에 PC나 Dropbox 앱에서 knou_scope.txt가 바뀌어 저장하지 않았습니다. 지금 고친 내용은 클립보드에 복사해 두었으니, 새 내용을 연 뒤 필요한 부분을 붙여넣으세요.";
      c.addAction("새 내용 열기");
      c.addCancelAction("닫기");
      if ((await c.presentAlert()) === -1) return;
      draft = null;
      continue;
    }
    try { await loadData(); } catch (e) {} // 캐시를 새 내용으로
    const ok = new Alert();
    ok.title = "저장했습니다";
    ok.message = "위젯에는 다음 갱신 때 반영됩니다.";
    ok.addAction("확인");
    await ok.presentAlert();
    return;
  }
}

// ---------------- 앱: 범위 편집 ----------------
async function scopeHelp() {
  const a = new Alert();
  a.title = "과제 메모 파일";
  a.message = "과제 내용·시험 범위는 Dropbox의 Apps › KnouWidget › knou_scope.txt 하나에 적습니다.\n\n이 스크립트: 메뉴의 [과제 메모 편집]\n아이패드·아이폰: Dropbox 앱에서 파일을 열어 편집\n윈도: 메모장으로 편집 (UTF-8로 저장)\n\n형식:\n인간과사회\n기말평가: 과제 내용 (여러 줄 가능)\n중간평가: 시험 범위\n\n과목명 줄은 MyKNOU 과목명과 같아야 합니다.";
  a.addAction("확인");
  await a.presentAlert();
}

// 예전 json 편집기 (txt 방식으로 바뀌어 메뉴에서 뺐음)
async function editScope(onlyCourse) {
  let scope = await readJSON(SCOPE_PATH);
  if (!scope) {
    const a = new Alert();
    a.title = "범위 파일이 없습니다";
    a.message = "PC에서 Knou calendar로 동기화·내보내기를 하면 과목이 채워진 양식이 만들어집니다.";
    a.addAction("확인");
    await a.presentAlert();
    return;
  }
  scope.items = scope.items || [];
  let changed = false;
  for (;;) {
    const idx = scope.items.map((s, i) => i).filter((i) => !onlyCourse || scope.items[i].course === onlyCourse);
    const sheet = new Alert();
    sheet.title = onlyCourse ? `${onlyCourse} 범위` : "레포트·시험 범위";
    sheet.message = changed ? "저장하지 않은 변경이 있습니다." : "편집할 항목을 고르세요.";
    idx.forEach((i) => { const s = scope.items[i]; sheet.addAction(`${onlyCourse ? "" : s.course + " · "}${s.kind || "메모"}${String(s.scope || "").trim() ? " ✓" : ""}`); });
    sheet.addAction("+ 항목 추가");
    if (changed) sheet.addAction("Dropbox에 저장");
    sheet.addCancelAction(changed ? "저장하지 않고 닫기" : "닫기");
    const pick = await sheet.presentSheet();
    if (pick === -1) return;
    if (changed && pick === idx.length + 1) {
      await writeJSON(SCOPE_PATH, scope);
      const ok = new Alert();
      ok.title = "저장했습니다";
      ok.message = "위젯에는 다음 갱신 때 반영됩니다.";
      ok.addAction("확인");
      await ok.presentAlert();
      changed = false;
      continue;
    }
    const isNew = pick === idx.length;
    const target = isNew ? { course: onlyCourse || "", kind: "", scope: "" } : scope.items[idx[pick]];
    const e = new Alert();
    e.title = isNew ? "항목 추가" : `${target.course} ${target.kind}`.trim();
    e.addTextField("과목 (MyKNOU 과목명 그대로)", target.course);
    e.addTextField("종류 (중간평가 / 기말평가 등)", target.kind);
    e.addTextField("과제 내용·범위", target.scope || "");
    e.addAction("확인");
    if (!isNew) e.addDestructiveAction("이 항목 삭제");
    e.addCancelAction("취소");
    const r = await e.presentAlert();
    if (r === -1) continue;
    if (r === 1 && !isNew) { scope.items.splice(idx[pick], 1); changed = true; continue; }
    const next = { course: e.textFieldValue(0).trim(), kind: e.textFieldValue(1).trim(), scope: e.textFieldValue(2).trim() };
    if (!next.course) continue;
    if (isNew) scope.items.push(next); else scope.items[idx[pick]] = next;
    changed = true;
  }
}

function errorAlert(e) {
  const a = new Alert();
  a.title = "오류";
  a.message = String(e.message || e) + (e.code === "invalid_grant" ? "\n\nKnouWidget에서 [Dropbox 다시 연결]을 눌러 주세요." : "");
  a.addAction("확인");
  return a.presentAlert();
}

async function courseTable() {
  const data = await loadData();
  const list = coursesOf(data.agenda);
  const a = new Alert();
  a.title = "위젯 Parameter";
  a.message = "비움 : 과목 칸\n0 : 마감 순 요약\n" + list.map((c, i) => `${i + 1} : ${c}`).join("\n") +
    "\n\n과목은 쉼표로 여러 개: 1,2 (특대형은 두 과목)\n뒤에 크기: 크게 / 0 작게 / 1,2 아주 크게";
  a.addAction("확인");
  await a.presentAlert();
}

// ---------------- 자동 업데이트 ----------------
// 앱에서 실행할 때만 확인한다 (위젯을 그리는 중에는 자기 파일을 바꾸지 않음). 더 높은 버전일 때만 바꾼다
const WIDGET_PATH = "/KnouWidget.js";
const versionOf = (text) => (/^(?:\uFEFF)?\/\/ KnouWidget v(\d+\.\d+\.\d+)/.exec(String(text || "")) || [])[1] || "";
function cmpVersion(a, b) {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}

// 반환: "updated"(파일을 바꿈 → 다시 실행 필요) / null
async function checkUpdate({ manual = false } = {}) {
  let meta;
  try { meta = await metadata(WIDGET_PATH); } catch (e) { if (manual) throw e; return null; }
  const st = loadSettings();
  if (!meta) { if (manual) await notice("업데이트 확인", `Dropbox에 KnouWidget.js가 없습니다.\n지금 버전: v${WIDGET_VERSION}`); return null; }
  if (!manual && st.updateCheckedRev === meta.rev) return null; // 이미 확인한 파일
  const text = await readText(WIDGET_PATH);
  const v = versionOf(text);
  saveSettings({ updateCheckedRev: meta.rev });
  // 받은 파일이 온전한 위젯 스크립트인지 확인
  const sane = v && text.length > 10000 && text.includes(`const WIDGET_VERSION = "${v}"`) && /Script\.complete\(\);?\s*$/.test(text.trim());
  if (!sane || cmpVersion(v, WIDGET_VERSION) <= 0) {
    if (manual) await notice("업데이트 확인", sane ? `지금이 최신입니다. (v${WIDGET_VERSION}, Dropbox v${v})` : "Dropbox의 KnouWidget.js를 확인하지 못했습니다.");
    return null;
  }
  const where = module.filename;
  const fmw = where.includes("/Mobile Documents/") ? FileManager.iCloud() : FileManager.local();
  fmw.writeString(where, text);
  await notice("새 버전으로 바꿨습니다", `v${WIDGET_VERSION} → v${v}\n\n스크립트를 닫고 다시 실행하면 새 버전으로 동작합니다. 위젯은 다음 갱신 때 바뀝니다.`);
  return "updated";
}

async function notice(title, message) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  a.addAction("확인");
  await a.presentAlert();
}

async function appMenu() {
  if (!isConnected()) {
    const r = await connectDropbox();
    if (r !== true) return;
  }
  if ((await checkUpdate()) === "updated") return;
  for (;;) {
    const m = new Alert();
    m.title = "KnouWidget";
    const acts = [];
    const add = (label, fn) => { m.addAction(label); acts.push(fn); };
    add("과목 상세 보기", () => showDetail([]));
    add("과제 메모 편집", () => editMemos(null));
    add("과제 메모 파일 안내", scopeHelp);
    add("글자 크기", chooseFontSize);
    add("Parameter 안내 (과목 번호)", courseTable);
    add("미리보기: 비움 (과목 칸)", async () => (await buildWidget("extraLarge", "")).presentExtraLarge());
    add("미리보기: 0 (마감 순 요약)", async () => (await buildWidget("extraLarge", "0")).presentExtraLarge());
    add("미리보기: 1,2 (고른 과목)", async () => (await buildWidget("extraLarge", "1,2")).presentExtraLarge());
    add("Dropbox 다시 연결", async () => (await connectDropbox()) === "pending" ? "stop" : null);
    add(`업데이트 확인 (지금 v${WIDGET_VERSION})`, async () => ((await checkUpdate({ manual: true })) === "updated" ? "stop" : null));
    m.addCancelAction("닫기");
    const i = await m.presentSheet();
    if (i === -1) return;
    try {
      if ((await acts[i]()) === "stop") return;
    } catch (e) {
      await errorAlert(e);
    }
  }
}

// ---------------- 시작 ----------------
const query = (typeof args !== "undefined" && args.queryParameters) || {};
if (config.runsInWidget) {
  Script.setWidget(await buildWidget(config.widgetFamily || "extraLarge", args.widgetParameter));
} else if (query.code || query.error) {
  // Dropbox 허용 페이지에서 돌아온 실행
  const a = new Alert();
  try {
    await finishConnect(query);
    a.title = "Dropbox에 연결되었습니다";
    a.message = "이제 홈 화면에 Scriptable 위젯을 추가하고 이 스크립트를 고르세요.";
  } catch (e) {
    a.title = "연결하지 못했습니다";
    a.message = String(e.message || e);
  }
  a.addAction("확인");
  await a.presentAlert();
  await appMenu();
} else if (query.course || query.view) {
  // 위젯의 과목 칸이나 빈 곳을 눌러서 온 실행
  try { await showDetail(query.course ? [query.course] : []); } catch (e) { await errorAlert(e); }
} else {
  await appMenu();
}
Script.complete();
