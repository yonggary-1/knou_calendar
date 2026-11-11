// 사용법: node test\run_test.js <저장한 대시보드.html>
// 확장 코드를 그대로 불러와 파싱 → 일정 변환 → diff 를 점검한다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', 'src');
const ctx = { console: { log() {}, info() {}, warn() {}, error() {} }, URL, URLSearchParams, crypto: globalThis.crypto, setTimeout };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['lib/env.js', 'lib/core.js', 'lib/settings.js', 'lib/log.js', 'lib/nuxt.js', 'lib/schedule.js', 'lib/scope.js', 'lib/knou.js']) {
  vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
}
const KS = ctx.KS;
const out = (...a) => process.stdout.write(a.join(' ') + '\n');

// ---- 1. 기간 문자열 파서 ----
const P = KS.schedule.parsePeriod;
const cases = [
  ['2026.11.09 09:00-11.09 18:00', { range: true, startDate: '2026-11-09', startTime: '09:00', endDate: '2026-11-09', endTime: '18:00' }],
  ['2026.10.13.-10.15. 18:00', { range: true, startDate: '2026-10-13', startTime: '09:00', endDate: '2026-10-15', endTime: '18:00' }],
  ['2026.11.20.-11.30. 18:00', { range: true, startDate: '2026-11-20', endDate: '2026-11-30', endTime: '18:00' }],
  ['2026.10.13 09:00 ~ 2026.10.15 18:00', { range: true, startDate: '2026-10-13', startTime: '09:00', endDate: '2026-10-15', endTime: '18:00' }],
  ['2026.11.09 18:00', { range: false, endDate: '2026-11-09', endTime: '18:00' }],
  ['2026.12.28.-01.05. 18:00', { range: true, startDate: '2026-12-28', endDate: '2027-01-05' }],
  [' ', null],
  ['', null],
];
for (const [s, exp] of cases) {
  const r = P(s);
  if (exp === null) assert.strictEqual(r, null, s);
  else for (const k of Object.keys(exp)) assert.strictEqual(r[k], exp[k], `${s} → ${k}`);
}
out('[1] 기간 파서', cases.length, '건 통과');

// ---- 2. 장소 정식 명칭 ----
const A = KS.schedule.autoPlace;
assert.strictEqual(A('남부학습센터(목동)-출석수업', '서울지역대학(남부학습센터)'), '한국방송통신대학교 서울남부학습센터');
assert.strictEqual(A('서울지역대학(출석수업)', '서울지역대학'), '한국방송통신대학교 서울지역대학');
assert.strictEqual(A('대전충남지역대학(출석수업)', '대전/충남지역대학'), '한국방송통신대학교 대전충남지역대학');
assert.strictEqual(A('남부학습센터(목동)-출석수업', ''), '한국방송통신대학교 남부학습센터');
const ov = KS.schedule.resolvePlace('남부학습센터(목동)-출석수업', '서울지역대학(남부학습센터)', { '남부학습센터(목동)-출석수업': '직접 입력한 이름' });
assert.strictEqual(ov.location, '직접 입력한 이름');
out('[2] 장소 변환 통과');

// ---- 3. 실제 대시보드 파싱 ----
const file = process.argv[2];
if (!file) { out('HTML 경로가 없어 3~5단계를 건너뜁니다.'); process.exit(0); }
const html = fs.readFileSync(file, 'utf8');
const r = KS.knou.parseDashboardHtml(html);
assert.ok(r.ok, '파싱 실패: ' + r.reason);
out(`[3] 파싱: 로그인=${r.loggedIn}, 학기=${r.semester?.year}-${r.semester?.term}, 과목 ${r.courses.length}개, 형성평가 ${r.formative?.start}~${r.formative?.end}`);
for (const c of r.courses) {
  const s = c.attendance.sessions.map((x) => `${x.date} ${x.hours} @${x.placeRaw}/${x.room} [${x.campus}]`).join('; ');
  out(`   - ${c.name} | 출석:${c.attendance.type || '-'} ${s} | 중간:${c.mid?.type || '-'} ${c.mid?.period || ''} | 기말:${c.final?.type || '-'} ${c.final?.period || ''}`);
}

// ---- 4. 일정 변환 ----
const settings = JSON.parse(JSON.stringify(KS.DEFAULT_SETTINGS));
const built = KS.schedule.build(r, settings);
out(`[4] 일정 그룹 ${built.groups.length}개, 일정 ${built.groups.reduce((n, g) => n + g.events.length, 0)}개`);
for (const g of built.groups) {
  out(`   ▣ ${g.key}  (${g.when})`);
  for (const e of g.events) {
    const when = e.start.dateTime ? `${e.start.dateTime} → ${e.end.dateTime}` : `${e.start.date} ~ ${e.end.date}(종료 제외)`;
    out(`      · ${e.summary} | ${when}${e.location ? ' | 📍' + e.location : ''}`);
  }
}
out('   장소 목록:', JSON.stringify(built.places.map((p) => [p.raw, p.location])));

// ---- 5. diff ----
let d = KS.schedule.diff(built, []);
out(`[5] 빈 캘린더 대비: 추가 ${d.counts.add}, 교체 ${d.counts.replace}, 삭제 ${d.counts.delete}`);
assert.strictEqual(d.counts.add, built.groups.length);

let n = 0;
const existing = built.groups.flatMap((g) => g.events.map((e) => ({ ...JSON.parse(JSON.stringify(e)), id: 'ev' + n++ })));
d = KS.schedule.diff(built, existing);
assert.strictEqual(d.total, 0, '동일한 상태인데 변경이 생김');
out('   같은 상태 재동기화: 변경 0 ✓');

// 출석수업 캠퍼스 변경 시뮬레이션
const r2 = JSON.parse(JSON.stringify(r));
const phil = r2.courses.find((c) => c.attendance.sessions.length);
phil.attendance.sessions[0].placeRaw = '서울지역대학(출석수업)';
phil.attendance.sessions[0].campus = '서울지역대학';
phil.attendance.sessions[0].date = '20261101';
const built2 = KS.schedule.build(r2, settings);
d = KS.schedule.diff(built2, existing);
assert.strictEqual(d.counts.replace, 1);
out(`   캠퍼스 변경(${phil.name}): 교체 ${d.counts.replace}, 새 일정 ${d.inserts.length}, 삭제 ${d.deletes.length} ✓`);

// 수강 취소 시뮬레이션
const r3 = JSON.parse(JSON.stringify(r));
const dropped = r3.courses.pop();
d = KS.schedule.diff(KS.schedule.build(r3, settings), existing);
assert.ok(d.counts.delete >= 1);
out(`   수강 취소(${dropped.name}): 삭제 그룹 ${d.counts.delete} ✓`);

// 지난 학기 일정은 건드리지 않음
const old = { ...existing[0], id: 'old', extendedProperties: { private: { ks_v: '1', ks_group: '2026-1|옛과목|class', ks_hash: 'x' } } };
d = KS.schedule.diff(built, [...existing, old]);
assert.strictEqual(d.total, 0);
out('   지난 학기 일정 보존 ✓');

// 과목 0개 (파싱 이상 대비)
const empty = { ...r, courses: [] };
d = KS.schedule.diff(KS.schedule.build(empty, settings), existing);
out(`   과목 0개일 때: 삭제 그룹 ${d.counts.delete} → 팝업에서 별도 확인 필요`);

// 로그아웃 페이지 판정
const fakeOut = html.replace('"isSigned":162', '"isSigned":163');
assert.strictEqual(KS.knou.parseDashboardHtml(fakeOut).loggedIn, false);
assert.strictEqual(KS.knou.parseDashboardHtml('<html><body>login</body></html>').loggedIn, false);
out('   로그아웃 판정 ✓');
out('모든 테스트 통과');

// ---- 6. 팝업용 남은 일정 목록 ----
const ag = built.agenda;
out(`[6] 할 일 목록 ${ag.length}건`);
for (const it of ag) out(`   - ${it.course} | ${it.label}${it.detail ? ' · ' + it.detail : ''} | ${it.start || '-'} → ${it.end}${it.place ? ' @' + it.place : ''} | 링크:${it.link} 마감형:${it.due}`);
assert.ok(ag.every((it) => it.end && /\+09:00$/.test(it.end)));
assert.ok(ag.some((it) => it.kind === 'class' && it.place === '서울남부학습센터 301호'));
out('   ✓ 목록 형식 확인');

// ---- 7. 과제 메모 → 캘린더 설명란 (1.6.0 결정) ----
//  평가 내용: 제출기간 일정에만 (마감 X). 시험형은 시험 일정. 제출기간 일정이 없으면 마감 일정에.
//  과목 메모: 그 과목 일정 전부 (출석수업 포함)
{
  const assignCourse = r.courses.find((c) => c.final && !/시험/.test(c.final.type) && KS.schedule.parsePeriod(c.final.period)?.range && c.attendance.sessions.length);
  assert.ok(assignCourse, '과제형 기말 + 출석수업이 있는 과목이 필요');
  const name = assignCourse.name;
  const notes = { [name]: { mid: '', final: '교재 3장 사례 분석\nA4 3쪽', memo: '교재 2026 개정판' } };
  const b2 = KS.schedule.build(r, settings, notes);
  const fg = b2.groups.find((g) => g.course === name && g.kind === 'final');
  const cg = b2.groups.find((g) => g.course === name && g.kind === 'class');
  const period = fg.events.find((e) => / 제출기간$/.test(e.summary));
  const deadline = fg.events.find((e) => /^\[마감\]/.test(e.summary));
  assert.ok(period.description.startsWith('📝 기말평가\n교재 3장 사례 분석\nA4 3쪽\n\n📌 과목 메모\n교재 2026 개정판\n\n────────\n'), period.description.slice(0, 80));
  assert.ok(!deadline.description.includes('📝'), '마감 일정에는 평가 내용 없음');
  assert.ok(deadline.description.startsWith('📌 과목 메모\n교재 2026 개정판'), '마감 일정에도 과목 메모');
  assert.ok(cg.events.every((e) => e.description.startsWith('📌 과목 메모\n교재 2026 개정판')), '출석수업에 과목 메모');
  assert.ok(!cg.events.some((e) => e.description.includes('📝')), '출석수업에 평가 내용 없음');
  out(`[7] 설명란: ${name} — 제출기간에 평가 내용, 마감엔 과목 메모만, 출석수업에 과목 메모 ✓`);

  // 제출기간 일정을 끈 경우 → 평가 내용이 마감 일정으로
  const b3 = KS.schedule.build(r, { ...settings, showPeriod: false }, notes);
  const d3 = b3.groups.find((g) => g.course === name && g.kind === 'final').events;
  assert.strictEqual(d3.length, 1);
  assert.ok(d3[0].description.startsWith('📝 기말평가'), '제출기간이 없으면 마감 일정에 평가 내용');
  out('   제출기간 끔 → 평가 내용이 마감 일정으로 ✓');

  // 시험형 → 시험 일정
  const examCourse = r.courses.find((c) => c.final && /시험|객관식|주관식/.test(c.final.type) && !/과제/.test(c.final.type) && KS.schedule.parsePeriod(c.final.period));
  if (examCourse) {
    const b4 = KS.schedule.build(r, settings, { [examCourse.name]: { mid: '', final: '1~7장', memo: '' } });
    const eg = b4.groups.find((g) => g.course === examCourse.name && g.kind === 'final');
    assert.ok(eg.events[0].description.startsWith('📝 기말평가\n1~7장'));
    out(`   시험형(${examCourse.name}) → 시험 일정에 평가 내용 ✓`);
  }
  // 저장 페이지에는 날짜가 공지된 시험형이 없으므로 가상의 과목으로도 확인
  {
    const fake = { ...r, courses: [{ ...r.courses[0], name: '가상시험과목', attendance: { sessions: [] }, mid: null, final: { type: '기말시험(객관식)', period: '2026.12.12 10:00-12.12 11:00' } }] };
    const b4 = KS.schedule.build(fake, settings, { 가상시험과목: { mid: '', final: '1~7장', memo: '계산기 지참' } });
    const ev = b4.groups.find((g) => g.kind === 'final').events;
    assert.strictEqual(ev.length, 1);
    assert.ok(ev[0].summary.startsWith('[기말시험]'));
    assert.ok(ev[0].description.startsWith('📝 기말평가\n1~7장\n\n📌 과목 메모\n계산기 지참'));
    out('   시험형(가상 과목) → 시험 일정에 평가 내용·과목 메모 ✓');
  }

  // 아주 긴 메모 → 잘라서 넣음
  const long = '가'.repeat(12000);
  const b5 = KS.schedule.build(r, settings, { [name]: { mid: '', final: long, memo: '' } });
  const p5 = b5.groups.find((g) => g.course === name && g.kind === 'final').events.find((e) => / 제출기간$/.test(e.summary));
  assert.ok(p5.description.length <= 8192 && p5.description.includes('… (전체는 위젯·편집기에서)'), '길이 ' + p5.description.length);
  out(`   긴 메모 → ${p5.description.length}자로 잘림 ✓`);

  // 메모만 바뀌면 일정을 다시 만들지 않고 설명란만 고친다
  let k = 0;
  const cal = b2.groups.flatMap((g) => g.events.map((e) => ({ ...JSON.parse(JSON.stringify(e)), id: 'm' + k++ })));
  const notes2 = { [name]: { ...notes[name], final: '교재 4장으로 바뀜' } };
  let dd = KS.schedule.diff(KS.schedule.build(r, settings, notes2), cal);
  // 기말평가 내용만 바뀌었으니 그 과목의 기말 그룹 하나만 (과목 메모는 그대로라 출석수업은 변화 없음)
  assert.deepStrictEqual([dd.counts.add, dd.counts.replace, dd.counts.delete, dd.counts.update], [0, 0, 0, 1]);
  assert.strictEqual(dd.patches.length, fg.events.length);
  const pp = dd.patches.find((p) => p.body.description.includes('교재 4장'));
  assert.ok(pp && cal.find((e) => e.id === pp.id).summary.endsWith('제출기간'), '제출기간 일정의 설명란을 고침');
  assert.strictEqual(dd.inserts.length + dd.deletes.length, 0);
  out(`   메모만 바뀜 → 교체 없이 설명란 수정 ${dd.patches.length}건 (그룹 ${dd.counts.update}) ✓`);

  // 1.5.0 시절 일정(ks_base 없음, 메모 없음)에서 메모가 처음 생겨도 교체가 아니라 설명란 수정
  const oldCal = built.groups.flatMap((g) => g.events.map((e) => {
    const c = JSON.parse(JSON.stringify(e));
    c.extendedProperties = { private: { ks_v: '1', ks_group: g.key, ks_hash: g.hash } };
    return { ...c, id: 'o' + k++ };
  }));
  dd = KS.schedule.diff(b2, oldCal);
  assert.strictEqual(dd.counts.replace, 0, '1.5.0 일정을 교체하지 않음');
  // 그 과목의 모든 그룹(출석수업·중간·기말)에 과목 메모가 새로 들어가므로 전부 설명란 수정
  assert.strictEqual(dd.counts.update, b2.groups.filter((g) => g.course === name).length);
  // 메모가 없으면 1.5.0 일정과 완전히 같음 (업데이트해도 아무 변화 없음)
  assert.strictEqual(KS.schedule.diff(KS.schedule.build(r, settings, null), oldCal).total, 0);
  out('   1.5.0에서 올라와도 교체 없이 설명란만, 메모 없으면 변경 0 ✓');
}
out('설명란 테스트 통과');
