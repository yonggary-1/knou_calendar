// 사용법: node test\scope_test.js
// 확장(lib/scope.js)과 위젯(widget/KnouWidget.js)의 과제 메모 규칙이 같은지 확인한다.
// 위젯 스크립트에서 parseScopeTxt / memoOf / scopeToTxt 함수 본문을 그대로 꺼내 비교하므로,
// 한쪽만 고치면 이 테스트가 실패한다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', 'src');
const out = (...a) => process.stdout.write(a.join(' ') + '\n');

// ---- 확장 쪽 ----
const ectx = { console };
ectx.globalThis = ectx;
vm.createContext(ectx);
vm.runInContext('globalThis.KS = {};', ectx);
vm.runInContext(fs.readFileSync(path.join(SRC, 'lib/scope.js'), 'utf8'), ectx);
const E = ectx.KS.scope;

// ---- 위젯 쪽: 함수 본문만 꺼낸다 (스크립트 전체는 Scriptable 전용이라 실행할 수 없음) ----
const widgetSrc = fs.readFileSync(path.join(SRC, 'widget/KnouWidget.js'), 'utf8');
function extract(name) {
  const start = widgetSrc.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `위젯에 ${name}이 없음`);
  let i = widgetSrc.indexOf('{', start), depth = 0;
  for (; i < widgetSrc.length; i++) {
    if (widgetSrc[i] === '{') depth++;
    else if (widgetSrc[i] === '}' && --depth === 0) break;
  }
  return widgetSrc.slice(start, i + 1);
}
const wctx = {};
vm.createContext(wctx);
vm.runInContext(['parseScopeTxt', 'memoOf', 'scopeToTxt'].map(extract).join('\n') + '\nthis.W = { parseScopeTxt, memoOf, scopeToTxt };', wctx);
const W = wctx.W;
// 위젯은 BOM을 읽을 때(readTextWithRev) 지운다. 확장은 parseScopeTxt 안에서 지운다 → 비교는 BOM 없는 입력으로
const plain = (t) => t.replace(/^﻿/, '');
const json = (o) => JSON.stringify(o);

const courses = ['인간과사회', '철학의이해', '한국문학과대중문화', '컴퓨터의이해'];

// ---- 1. 인계 문서의 예시 ----
const sample = `2026-2학기 과제 메모 (머리말: 위젯에 안 나옴, 저장해도 그대로 남김)

인간과사회
교재 2026 개정판 사용
중간평가:
기말평가: 교재 3장의 사회 계층 이론으로 한국 사회 사례 분석
A4 3쪽 내외, 참고문헌 2개 이상

철학의이해
중간평가: 출석수업 맞춤형평가 - 따로 준비 없음
기말평가: 칸트 정언명령 요약 + 일상 사례 2개
`;
const ep = E.parseScopeTxt(sample, courses), wp = W.parseScopeTxt(sample, courses);
assert.strictEqual(json(ep), json(wp));
const n = E.notesOf(sample, courses);
assert.deepStrictEqual(JSON.parse(json(n['인간과사회'])), { mid: '', final: '교재 3장의 사회 계층 이론으로 한국 사회 사례 분석\nA4 3쪽 내외, 참고문헌 2개 이상', memo: '교재 2026 개정판 사용' });
assert.strictEqual(n['철학의이해'].mid, '출석수업 맞춤형평가 - 따로 준비 없음');
out('[1] 인계 문서 예시: 해석 결과가 위젯과 같음');

// ---- 2. 까다로운 입력들 ----
const tricky = [
  '',
  '﻿인간과사회\r\n기말평가: CRLF와 BOM\r\n',
  '머리말만 있음\n둘째 줄',
  '인 간 과 사 회\n중간:  공백 섞인 과목명, 짧은 표시\n기말 ：전각 콜론\n',
  '인간과사회\n기말시험: 시험 표시\n\n\n  들여쓴 줄  \n\n',
  '인간과사회\n중간평가: 첫번째\n중간평가: 두번째(이어 붙음)\n과목 메모처럼 보이는 줄\n',
  '철학의이해\n메모 1\n메모 2\n\n기말평가:\n\n여러 줄\n\n\n',
  '모르는과목\n중간평가: 앞 과목이 없으니 머리말로\n인간과사회\n중간평가: 정상\n',
  '인간과사회\n기말평가: 내용 안에 철학의이해 라는 단어\n철학의이해\n기말평가: 다음 과목\n',
  '컴퓨터의이해\n중간평가 : 표시 앞 공백\n기말평가:끝에 공백   \t\n',
];
for (const t of tricky) {
  const a = E.parseScopeTxt(plain(t), courses), b = W.parseScopeTxt(plain(t), courses);
  assert.strictEqual(json(a), json(b), '해석 불일치: ' + JSON.stringify(t));
  for (const c of courses) assert.strictEqual(json(E.memoOf(a, c)), json(W.memoOf(b, c)));
}
// 확장은 BOM이 붙은 채로 받아도 같은 결과
assert.strictEqual(json(E.parseScopeTxt(tricky[1], courses)), json(W.parseScopeTxt(plain(tricky[1]), courses)));
out(`[2] 까다로운 입력 ${tricky.length}개: 해석·memoOf 모두 위젯과 같음`);

// ---- 3. 저장 모양이 같고, 번갈아 저장해도 흔들리지 않음 ----
let rand = 7;
const rnd = (k) => (rand = (rand * 1103515245 + 12345) % 2147483648) % k;
const pieces = ['', '범위 1~3장', '레포트 A4 3쪽\n참고문헌 2개', '  앞 공백', '끝 공백   ', '빈 줄 아래\n\n두 번째 문단', '중간평가처럼: 보이는 글', '😀 이모지'];
let cases = 0;
for (let k = 0; k < 400; k++) {
  const memos = {};
  for (const c of courses) memos[c] = { mid: pieces[rnd(pieces.length)], final: pieces[rnd(pieces.length)], memo: pieces[rnd(pieces.length)] };
  const pre = ['', '2026-2학기 과제 메모', '머리말\n두 줄'][rnd(3)];
  const te = E.scopeToTxt(pre, courses, memos), tw = W.scopeToTxt(pre, courses, memos);
  assert.strictEqual(te, tw, '저장 모양 불일치');
  // 확장 저장 → 위젯이 읽고 저장 → 확장이 읽고 저장 … 를 반복해도 같은 파일
  let txt = te;
  for (let round = 0; round < 3; round++) {
    const side = round % 2 ? W : E;
    const p = side.parseScopeTxt(txt, courses);
    const m = {};
    for (const c of courses) m[c] = side.memoOf(p, c);
    const again = side.scopeToTxt(p.preamble, courses, m);
    if (round > 0) assert.strictEqual(again, txt, '번갈아 저장했더니 내용이 바뀜');
    txt = again;
  }
  assert.ok(!/\r|﻿/.test(te) && !/[ \t]+\n/.test(te), 'LF, BOM 없음, 줄 끝 공백 없음');
  cases++;
}
out(`[3] 무작위 ${cases}건: 저장 모양 동일, 확장↔위젯 번갈아 저장해도 그대로`);

// ---- 4. 양식·학기 머리말 ----
const tpl = E.templateTxt('2026-2', ['인간과사회', '철학의이해']);
assert.strictEqual(tpl, '2026-2학기 과제 메모 — 첫 과목명 위에 적은 내용은 위젯에 나오지 않습니다.\n\n인간과사회\n중간평가:\n기말평가:\n\n철학의이해\n중간평가:\n기말평가:\n');
assert.strictEqual(E.semesterOfTxt(tpl), '2026-2');
assert.strictEqual(E.semesterOfTxt('﻿2027-1학기 메모'), '2027-1');
assert.strictEqual(E.semesterOfTxt('과제 메모 2026-2학기'), '', '첫 줄 맨 앞에 있어야 함');
assert.strictEqual(E.semesterOfTxt('인간과사회\n기말평가: x'), '');
// 위젯이 양식을 읽으면 머리말 = 첫 줄, 내용은 모두 빈 칸
const wt = W.parseScopeTxt(tpl, ['인간과사회', '철학의이해']);
assert.strictEqual(wt.items.length, 0);
assert.ok(wt.preamble.startsWith('2026-2학기'));
out('[4] txt 양식과 학기 머리말 판단 통과');

out('모든 과제 메모 형식 점검 통과');
