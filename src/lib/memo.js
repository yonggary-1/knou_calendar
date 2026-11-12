// 과제 메모: 어디가 원본인지 정하고, 편집기·동기화·내보내기가 같은 규칙으로 읽고 쓰게 한다
//
//   mode 'dropbox' : Dropbox에 연결되어 있고 읽을 수 있음. 원본 = knou_scope.txt, 브라우저(storage.sync)는 백업
//   mode 'backup'  : 연결은 되어 있는데 지금 Dropbox에 닿지 못함. 브라우저 백업을 보여 주고, 저장하면 백업에 저장(dirty)
//   mode 'local'   : Dropbox를 연결하지 않음. 원본 = 브라우저(storage.sync)
//
// 다시 Dropbox를 읽게 되었을 때 (reconcile):
//   브라우저에 안 올린 변경(dirty)이 있고 Dropbox 파일이 그 바탕(baseRev) 그대로면 → 브라우저 내용을 Dropbox에 올림
//   Dropbox 파일도 그사이 바뀌었으면 → 어느 쪽도 덮어쓰지 않고 ks_scope_conflict를 남김 (편집기에서 고름)
(() => {
  const KS = globalThis.KS;
  const path = () => KS.dropbox.SCOPE_TXT_PATH;
  const agendaNow = async () => (await KS.ext.storage.local.get('ks_agenda')).ks_agenda;
  const coursesOf = (agenda) => KS.dropbox.coursesOf(agenda);

  // 브라우저 기록을 지금 학기에 맞춘다. 학기가 다르면 옛 기록은 storage.local에 보관하고 새로 시작
  async function localFor(semester) {
    const rec = await KS.scopeStore.get();
    if (!rec) return null;
    if (semester && rec.semester && rec.semester !== semester) {
      await KS.ext.storage.local.set({ ['ks_scope_archive_' + rec.semester]: { text: rec.text, savedAt: rec.savedAt } });
      await KS.scopeStore.clear();
      KS.log('info', '새 학기 — 브라우저 과제 메모를 보관하고 새로 시작', { old: rec.semester, now: semester });
      return null;
    }
    return rec;
  }

  // Dropbox 내용을 브라우저에 백업. 브라우저에만 있는 변경(dirty)은 force가 아니면 지우지 않는다. 백업 실패는 동작에 영향 없음
  async function backup(text, rev, semester, { force = false } = {}) {
    try {
      const rec = await KS.scopeStore.get();
      if (rec?.dirty && !force) return 'kept-dirty';
      if (rec && !rec.dirty && rec.text === text && rec.baseRev === rev) return 'same';
      await KS.scopeStore.set({ text, semester, dirty: false, baseRev: rev });
      return 'saved';
    } catch (e) {
      KS.log('warn', '과제 메모 백업 실패 (Dropbox 원본은 그대로)', String(e?.message || e));
      return 'failed';
    }
  }

  // Dropbox에서 읽은 직후. 반환 { text, rev, pushed?, conflict? }
  async function reconcile(text, rev, semester) {
    const rec = await localFor(semester);
    if (rec?.dirty) {
      if (text !== null && rec.text === text) {
        await backup(text, rev, semester, { force: true });
        return { text, rev };
      }
      if (text === null || rec.baseRev === rev) {
        // Dropbox 파일이 없거나, 브라우저 내용의 바탕 그대로 → 브라우저 내용을 올린다
        const w = await KS.dropbox.writeTextIfUnchanged(path(), rec.text, text === null ? null : rev);
        if (w.ok) {
          await backup(rec.text, w.rev, semester, { force: true });
          await KS.ext.storage.local.remove('ks_scope_conflict');
          KS.log('info', '브라우저에서 고친 과제 메모를 Dropbox에 올림');
          return { text: rec.text, rev: w.rev, pushed: true };
        }
        // 올리는 사이 바뀜 → 아래 충돌로
      }
      await KS.ext.storage.local.set({ ks_scope_conflict: { at: Date.now(), localSavedAt: rec.savedAt } });
      KS.log('warn', '과제 메모 충돌 — 브라우저와 Dropbox가 모두 바뀜. 덮어쓰지 않음');
      return { text, rev, conflict: { text: rec.text, savedAt: rec.savedAt } };
    }
    if (text !== null) await backup(text, rev, semester);
    return { text, rev };
  }

  // Dropbox에 txt가 없을 때 만들 내용: 이번 학기 브라우저 메모가 있으면 그것, 없으면 빈 양식
  async function seedText(agenda) {
    const rec = await localFor(agenda.semester || '');
    return rec?.text || KS.scope.templateTxt(agenda.semester || '', coursesOf(agenda));
  }

  const parse = (text, courses) => {
    const p = KS.scope.parseScopeTxt(text, courses);
    const memos = {};
    for (const c of courses) memos[c] = KS.scope.memoOf(p, c);
    return { preamble: p.preamble, memos };
  };

  // ---------- 편집기 ----------
  async function load() {
    const agenda = await agendaNow();
    const courses = coursesOf(agenda);
    const semester = agenda?.semester || '';
    const connected = !!(await KS.dropbox.status()).connected;
    if (!courses.length) return { connected, courses: [] };

    let mode = connected ? 'dropbox' : 'local';
    let text = null, rev = null, version = null, reason = '', conflict = null, exists = true, pushed = false;
    if (connected) {
      try {
        const r = await KS.dropbox.readTextWithRev(path());
        if (r.text === null) {
          // Dropbox에 아직 txt가 없음: 브라우저 메모 → 없으면 옛 json으로 시작 (저장하면 txt가 생김)
          exists = false;
          text = (await localFor(semester))?.text ?? null;
          if (text === null) text = await legacyJsonText(courses, semester);
        } else {
          const x = await reconcile(r.text, r.rev, semester);
          text = x.text;
          rev = x.rev;
          conflict = x.conflict || null;
          pushed = !!x.pushed;
        }
      } catch (e) {
        mode = 'backup';
        reason = String(e?.message || e);
        KS.log('warn', '편집기: Dropbox를 읽지 못해 브라우저 백업을 씀', reason);
      }
    }
    if (mode !== 'dropbox') {
      const rec = await localFor(semester);
      text = rec?.text ?? null;
      version = rec?.savedAt ?? null;
      exists = !!rec;
    }
    const p = text !== null ? parse(text, courses) : { preamble: KS.scope.headerFor(semester), memos: Object.fromEntries(courses.map((c) => [c, { mid: '', final: '', memo: '' }])) };
    return {
      connected, mode, courses, semester, exists, rev, version, reason, pushed,
      preamble: p.preamble, memos: p.memos,
      conflict: conflict ? { text: conflict.text, savedAt: conflict.savedAt, memos: parse(conflict.text, courses).memos } : null,
    };
  }

  async function legacyJsonText(courses, semester) {
    try {
      const raw = await KS.dropbox.downloadText(KS.dropbox.SCOPE_PATH);
      const old = raw ? JSON.parse(raw) : null;
      if (!old?.items?.length) return null;
      const memos = {};
      for (const c of courses) memos[c] = KS.scope.memoOf({ items: old.items }, c);
      return KS.scope.scopeToTxt(KS.scope.headerFor(semester), courses, memos);
    } catch {
      return null;
    }
  }

  // base: load()가 돌려준 { mode, rev, version }
  async function save({ preamble, memos, mode, rev, version }) {
    const agenda = await agendaNow();
    const courses = coursesOf(agenda);
    const semester = agenda?.semester || '';
    const text = KS.scope.scopeToTxt(preamble || '', courses, memos || {});

    if (mode === 'dropbox') {
      const r = await KS.dropbox.writeTextIfUnchanged(path(), text, rev || null);
      if (!r.ok) {
        KS.log('warn', '과제 메모 저장 충돌 — 저장하지 않음');
        return { ok: false, conflict: true };
      }
      // 충돌을 고르지 않고 Dropbox 쪽에 저장했다면, 덮일 브라우저 변경은 따로 보관해 둔다
      const prev = await KS.scopeStore.get();
      if (prev?.dirty && prev.text !== text) await KS.ext.storage.local.set({ ks_scope_discarded: { text: prev.text, savedAt: prev.savedAt, at: Date.now() } });
      const b = await backup(text, r.rev, semester, { force: true });
      await KS.ext.storage.local.remove('ks_scope_conflict');
      KS.log('info', '과제 메모 저장 (Dropbox)', { courses: courses.length, backup: b });
      let exported = null;
      try { exported = await KS.dropbox.exportAgenda({ quiet: true }); } catch { exported = null; }
      return { ok: true, rev: r.rev, exported, backup: b };
    }

    // 브라우저에 저장 (local: 원본, backup: 다시 연결되면 Dropbox에 올림)
    const rec = await KS.scopeStore.get();
    if ((rec?.savedAt ?? null) !== (version ?? null)) {
      KS.log('warn', '과제 메모 저장 충돌 (다른 PC의 크롬에서 먼저 저장) — 저장하지 않음');
      return { ok: false, conflict: true };
    }
    const meta = await KS.scopeStore.set({ text, semester, dirty: true, baseRev: rec?.baseRev ?? null });
    KS.log('info', '과제 메모 저장 (브라우저)', { mode, courses: courses.length });
    return { ok: true, version: meta.savedAt, local: true };
  }

  // 충돌 해결: 'local' = 브라우저 내용으로 Dropbox를 덮어씀, 'dropbox' = Dropbox 내용을 쓰고 브라우저 내용은 따로 보관
  async function resolve({ choice, rev }) {
    const agenda = await agendaNow();
    const semester = agenda?.semester || '';
    const rec = await KS.scopeStore.get();
    if (!rec?.dirty) {
      await KS.ext.storage.local.remove('ks_scope_conflict');
      return load();
    }
    if (choice === 'local') {
      const w = await KS.dropbox.writeTextIfUnchanged(path(), rec.text, rev || null);
      if (!w.ok) return { ...(await load()), note: 'Dropbox 파일이 또 바뀌었습니다. 다시 골라 주세요.' };
      await backup(rec.text, w.rev, semester, { force: true });
      try { await KS.dropbox.exportAgenda({ quiet: true }); } catch { /* 다음 동기화 때 */ }
    } else {
      await KS.ext.storage.local.set({ ks_scope_discarded: { text: rec.text, savedAt: rec.savedAt, at: Date.now() } });
      const r = await KS.dropbox.readTextWithRev(path());
      if (r.text !== null) await backup(r.text, r.rev, semester, { force: true });
    }
    await KS.ext.storage.local.remove('ks_scope_conflict');
    KS.log('info', '과제 메모 충돌 해결', { choice });
    return load();
  }

  // ---------- 동기화(캘린더 설명란)용 ----------
  async function notesForCalendar(courses, semester) {
    const connected = !!(await KS.dropbox.status()).connected;
    if (connected) {
      let timer;
      try {
        const fresh = await Promise.race([
          KS.dropbox.readNotes({ courses, semester }),
          new Promise((resolve) => { timer = setTimeout(() => resolve(null), 15000); }),
        ]);
        if (fresh?.notes) return fresh.notes;
      } catch { /* 아래 백업으로 */ } finally { clearTimeout(timer); }
    }
    // Dropbox 없음 또는 못 읽음 → 브라우저 기록
    const rec = await localFor(semester);
    if (rec?.text) return KS.scope.notesOf(rec.text, courses);
    return (await KS.ext.storage.local.get('ks_notes')).ks_notes?.notes || null;
  }

  KS.memo = { load, save, resolve, reconcile, backup, seedText, notesForCalendar, localFor };
})();
