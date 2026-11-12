// 사용법: node test\memo_test.js
// 과제 메모의 저장 위치 점검 (1.6.2): 브라우저 저장(storage.sync), Dropbox 백업, 연결이 끊긴 동안의 저장, 다시 연결, 충돌
const assert = require('assert');
const { fakeDropbox, load, agenda } = require('./harness.js');
const out = (...a) => process.stdout.write(a.join(' ') + '\n');

const LINK = { ks_dropbox: { refresh: 'R1', appKey: 'KEY', email: '' } };
const edit = (doc, course, kind, value) => ({ ...doc.memos, [course]: { ...doc.memos[course], [kind]: value } });

(async () => {
  // ---- 1. 조각 나누기: 한글 긴 글도 항목 한도 안, 이어 붙이면 그대로 ----
  {
    const { KS, sync } = load(fakeDropbox());
    const long = ('가나다라마바사 "따옴표" \\ 역슬래시\n줄바꿈 😀 ').repeat(900);
    const parts = KS.scopeStore.split(long);
    assert.ok(parts.length > 1);
    assert.strictEqual(parts.join(''), long);
    for (const p of parts) assert.ok(Buffer.byteLength(JSON.stringify(p)) <= 8000, '조각마다 8KB 아래');
    await KS.scopeStore.set({ text: long, semester: '2026-2', dirty: true, baseRev: null });
    assert.strictEqual((await KS.scopeStore.get()).text, long);
    // 짧게 다시 저장하면 남는 옛 조각을 지운다
    await KS.scopeStore.set({ text: '짧음', semester: '2026-2', dirty: true, baseRev: null });
    assert.strictEqual((await KS.scopeStore.get()).text, '짧음');
    assert.deepStrictEqual(Object.keys(sync.data).sort(), ['ks_scope_0', 'ks_scope_meta']);
    // 조각 하나가 빠지면(다른 PC에서 동기화 중) 깨진 내용을 돌려주지 않는다
    await KS.scopeStore.set({ text: long, semester: '2026-2', dirty: true, baseRev: null });
    delete sync.data.ks_scope_1;
    assert.strictEqual(await KS.scopeStore.get(), null);
    // 전체 한도(약 100KB) 초과 → SCOPE_QUOTA
    await assert.rejects(() => KS.scopeStore.set({ text: '한'.repeat(40000), semester: '2026-2' }), (e) => e.code === 'SCOPE_QUOTA');
    out('[1] storage.sync 조각 저장 (한글·이모지·이스케이프, 남는 조각 정리, 빠진 조각, 용량 초과) 통과');
  }

  // ---- 2. Dropbox 없이: 편집기 → 브라우저에 저장, 캘린더 notes도 브라우저에서 ----
  const dbx = fakeDropbox();
  const { KS, local, sync } = load(dbx);
  KS.sleep = async () => {};
  await local.set({ ks_agenda: agenda('2026-2') });
  let doc = await KS.memo.load();
  assert.strictEqual(doc.connected, false);
  assert.strictEqual(doc.mode, 'local');
  assert.strictEqual(doc.exists, false);
  assert.strictEqual(doc.version, null);
  let s = await KS.memo.save({ preamble: doc.preamble, memos: edit(doc, '행정학개론', 'final', '규제 사례 분석'), mode: doc.mode, version: doc.version });
  assert.ok(s.ok && s.local, JSON.stringify(s));
  assert.strictEqual(dbx.calls.length, 0, 'Dropbox는 건드리지 않음');
  let rec = await KS.scopeStore.get();
  assert.strictEqual(rec.dirty, true);
  assert.ok(rec.text.startsWith('2026-2학기 과제 메모'));
  doc = await KS.memo.load();
  assert.strictEqual(doc.memos['행정학개론'].final, '규제 사례 분석');
  assert.strictEqual(doc.version, s.version);
  const notes = await KS.memo.notesForCalendar(['행정학개론', '경영학원론', '컴퓨터의이해'], '2026-2');
  assert.strictEqual(notes['행정학개론'].final, '규제 사례 분석');
  out('[2] Dropbox 없음 → 브라우저에 저장, 캘린더 메모도 브라우저에서 통과');

  // ---- 3. 다른 PC에서 먼저 저장 → savedAt이 달라 덮어쓰지 않음 ----
  const stale = doc.version;
  await KS.scopeStore.set({ ...(await KS.scopeStore.get()), text: rec.text.replace('규제 사례 분석', '다른 PC'), dirty: true });
  s = await KS.memo.save({ preamble: doc.preamble, memos: doc.memos, mode: 'local', version: stale });
  assert.strictEqual(s.conflict, true);
  assert.ok((await KS.scopeStore.get()).text.includes('다른 PC'));
  doc = await KS.memo.load();
  s = await KS.memo.save({ preamble: doc.preamble, memos: edit(doc, '행정학개론', 'final', '규제 사례 분석'), mode: 'local', version: doc.version });
  assert.ok(s.ok);
  out('[3] 브라우저 저장 충돌 (다른 PC가 먼저 저장) → 덮어쓰지 않음 통과');

  // ---- 4. Dropbox 연결 → 브라우저 메모로 knou_scope.txt를 만들고, 백업은 깨끗한 상태 ----
  await local.set(LINK);
  let r = await KS.dropbox.exportAgenda();
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.scope, 'created');
  assert.ok(dbx.text('/knou_scope.txt').includes('기말평가: 규제 사례 분석'), '브라우저 메모가 Dropbox로 옮겨짐');
  rec = await KS.scopeStore.get();
  assert.strictEqual(rec.dirty, false);
  assert.strictEqual(rec.baseRev, dbx.files.get('/knou_scope.txt').rev);
  assert.strictEqual(JSON.parse(dbx.text('/knou_agenda.json')).notes['행정학개론'].final, '규제 사례 분석');
  out('[4] Dropbox 연결 → 브라우저 메모로 txt 생성, 백업 갱신 통과');

  // ---- 5. 연결된 상태: 위젯에서 고침 → 다음 내보내기 때 백업도 따라감 / 편집기 저장도 백업 ----
  dbx.put('/knou_scope.txt', dbx.text('/knou_scope.txt').replace('경영학원론\n중간평가:', '경영학원론\n중간평가: 1~5장 (위젯)'));
  await KS.dropbox.exportAgenda();
  assert.ok((await KS.scopeStore.get()).text.includes('1~5장 (위젯)'));
  doc = await KS.memo.load();
  assert.strictEqual(doc.mode, 'dropbox');
  s = await KS.memo.save({ preamble: doc.preamble, memos: edit(doc, '컴퓨터의이해', 'memo', '교재 3판'), mode: doc.mode, rev: doc.rev });
  assert.ok(s.ok && !s.local);
  assert.strictEqual(s.backup, 'saved');
  rec = await KS.scopeStore.get();
  assert.strictEqual(rec.text, dbx.text('/knou_scope.txt'));
  assert.strictEqual(rec.baseRev, dbx.files.get('/knou_scope.txt').rev);
  out('[5] 연결됨 → 위젯 수정·편집기 저장 모두 브라우저에 백업 통과');

  // ---- 6. Dropbox가 끊김 → 편집기는 백업 모드, 저장은 브라우저(dirty), 캘린더 메모도 백업에서 ----
  dbx.offline = true;
  doc = await KS.memo.load();
  assert.strictEqual(doc.mode, 'backup');
  assert.ok(doc.reason);
  assert.strictEqual(doc.memos['컴퓨터의이해'].memo, '교재 3판');
  s = await KS.memo.save({ preamble: doc.preamble, memos: edit(doc, '경영학원론', 'final', '오프라인에서 적음'), mode: doc.mode, version: doc.version });
  assert.ok(s.ok && s.local);
  const nb = await KS.memo.notesForCalendar(['행정학개론', '경영학원론', '컴퓨터의이해'], '2026-2');
  assert.strictEqual(nb['경영학원론'].final, '오프라인에서 적음');
  r = await KS.dropbox.exportAgenda();
  assert.strictEqual(r.ok, false, '내보내기는 실패로 기록');
  assert.ok((await KS.scopeStore.get()).dirty, '브라우저 변경은 그대로');
  out('[6] Dropbox 끊김 → 백업으로 편집·저장, 캘린더 메모도 백업에서 통과');

  // ---- 7. 다시 연결 + Dropbox는 그대로 → 브라우저 변경을 자동으로 올림 ----
  dbx.offline = false;
  r = await KS.dropbox.exportAgenda();
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(dbx.text('/knou_scope.txt').includes('기말평가: 오프라인에서 적음'));
  assert.ok(dbx.text('/knou_scope.txt').includes('교재 3판'), '나머지 내용 보존');
  assert.strictEqual(JSON.parse(dbx.text('/knou_agenda.json')).notes['경영학원론'].final, '오프라인에서 적음');
  assert.strictEqual((await KS.scopeStore.get()).dirty, false);
  out('[7] 다시 연결 → 브라우저에서 고친 메모를 자동으로 Dropbox에 올림 통과');

  // ---- 8. 끊긴 동안 양쪽이 모두 바뀜 → 충돌, 아무것도 덮어쓰지 않음 ----
  async function makeConflict(tag) {
    dbx.offline = true;
    const d = await KS.memo.load();
    const x = await KS.memo.save({ preamble: d.preamble, memos: edit(d, '행정학개론', 'mid', '브라우저 ' + tag), mode: d.mode, version: d.version });
    assert.ok(x.ok);
    dbx.offline = false;
    dbx.put('/knou_scope.txt', dbx.text('/knou_scope.txt').replace('행정학개론\n', '행정학개론\n위젯 ' + tag + '\n'));
    return dbx.text('/knou_scope.txt');
  }
  let theirs = await makeConflict('A');
  doc = await KS.memo.load();
  assert.strictEqual(doc.mode, 'dropbox');
  assert.ok(doc.conflict, '충돌 보고');
  assert.strictEqual(doc.conflict.memos['행정학개론'].mid, '브라우저 A');
  assert.strictEqual(doc.memos['행정학개론'].memo, '위젯 A', '화면은 Dropbox 내용');
  assert.strictEqual(dbx.text('/knou_scope.txt'), theirs, 'Dropbox 그대로');
  assert.ok((await KS.scopeStore.get()).dirty, '브라우저 내용 그대로');
  r = await KS.dropbox.exportAgenda(); // 동기화도 덮어쓰지 않는다
  assert.strictEqual(dbx.text('/knou_scope.txt'), theirs);
  assert.ok((await local.get('ks_scope_conflict')).ks_scope_conflict);

  // 8a. "Dropbox 내용 쓰기" → 브라우저 내용은 따로 보관, 백업은 Dropbox 내용으로
  doc = await KS.memo.resolve({ choice: 'dropbox', rev: doc.rev });
  assert.ok(!doc.conflict);
  assert.strictEqual(dbx.text('/knou_scope.txt'), theirs);
  rec = await KS.scopeStore.get();
  assert.strictEqual(rec.dirty, false);
  assert.strictEqual(rec.text, theirs);
  assert.ok((await local.get('ks_scope_discarded')).ks_scope_discarded.text.includes('중간평가: 브라우저 A'));
  assert.ok(!(await local.get('ks_scope_conflict')).ks_scope_conflict);

  // 8b. "브라우저 내용으로 덮어쓰기"
  theirs = await makeConflict('B');
  doc = await KS.memo.load();
  assert.ok(doc.conflict);
  doc = await KS.memo.resolve({ choice: 'local', rev: doc.rev });
  assert.ok(!doc.conflict);
  assert.ok(dbx.text('/knou_scope.txt').includes('중간평가: 브라우저 B'));
  assert.ok(!dbx.text('/knou_scope.txt').includes('위젯 B'));
  assert.strictEqual(JSON.parse(dbx.text('/knou_agenda.json')).notes['행정학개론'].mid, '브라우저 B', '위젯용 내보내기도 갱신');
  assert.strictEqual((await KS.scopeStore.get()).dirty, false);

  // 8c. 충돌을 고르지 않고 편집기에서 Dropbox 쪽에 저장 → 브라우저 내용은 따로 보관
  await makeConflict('C');
  doc = await KS.memo.load();
  assert.ok(doc.conflict);
  s = await KS.memo.save({ preamble: doc.preamble, memos: edit(doc, '컴퓨터의이해', 'final', '새로'), mode: doc.mode, rev: doc.rev });
  assert.ok(s.ok);
  assert.ok((await local.get('ks_scope_discarded')).ks_scope_discarded.text.includes('브라우저 C'));
  assert.strictEqual((await KS.scopeStore.get()).dirty, false);
  out('[8] 양쪽 모두 바뀜 → 충돌 보고, Dropbox 쓰기 / 브라우저로 덮어쓰기 / 그냥 저장 모두 내용을 잃지 않음 통과');

  // ---- 9. 연결 해제 → 브라우저 백업이 원본이 되어 그대로 보임 ----
  const before = dbx.text('/knou_scope.txt');
  await KS.dropbox.disconnect();
  doc = await KS.memo.load();
  assert.strictEqual(doc.mode, 'local');
  assert.strictEqual(KS.scope.scopeToTxt(doc.preamble, doc.courses, doc.memos), before);
  out('[9] 연결 해제 → 백업이 그대로 브라우저 메모가 됨 통과');

  // ---- 10. 새 학기 → 옛 브라우저 메모는 보관하고 새로 시작 ----
  await local.set({ ks_agenda: agenda('2027-1') });
  doc = await KS.memo.load();
  assert.strictEqual(doc.exists, false);
  assert.ok(doc.preamble.startsWith('2027-1학기'));
  assert.strictEqual(doc.memos['행정학개론'].mid, '');
  assert.ok((await local.get('ks_scope_archive_2026-2'))['ks_scope_archive_2026-2'].text.includes('2026-2학기'), '옛 학기 메모 보관');
  assert.strictEqual(await KS.scopeStore.get(), null);
  out('[10] 새 학기 → 옛 메모 보관 후 새로 시작 통과');

  // ---- 11. 너무 긴 메모 → 브라우저 저장은 분명한 오류 (조용히 잃지 않음) ----
  doc = await KS.memo.load();
  await assert.rejects(
    () => KS.memo.save({ preamble: doc.preamble, memos: edit(doc, '행정학개론', 'final', '긴 메모 '.repeat(12000)), mode: 'local', version: doc.version }),
    (e) => e.code === 'SCOPE_QUOTA');
  out('[11] 용량 초과 → SCOPE_QUOTA 오류 통과');

  void sync;
  out('모든 과제 메모 저장 점검 통과');
})().catch((e) => { console.error(e); process.exit(1); });
