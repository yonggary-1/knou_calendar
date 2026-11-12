// 과제 메모 편집기: 과목별 칸으로 과제 메모(knou_scope.txt 형식)를 고친다
//  - Dropbox 연결됨: 원본은 Dropbox의 knou_scope.txt, 저장할 때마다 이 브라우저(storage.sync)에도 백업
//  - Dropbox 연결 안 함: 이 브라우저(storage.sync)에 저장
//  - 연결했는데 지금 Dropbox에 닿지 못함: 브라우저 백업을 보여 주고, 저장은 브라우저에 (다시 닿으면 자동으로 올라감)
//  - 저장은 열었을 때의 버전(rev / savedAt)일 때만. 다른 곳에서 먼저 고쳤으면 덮어쓰지 않고 고친 내용을 화면에 남긴다
//  - 저장 모양은 위젯과 같다 (lib/scope.js의 scopeToTxt, 백그라운드에서 만든다)
(() => {
  const { h, send } = KS;
  const $ = (id) => document.getElementById(id);
  const KINDS = [
    ['mid', '중간평가', '시험 범위, 과제 내용 등'],
    ['final', '기말평가', '레포트 주제·분량, 시험 범위 등'],
    ['memo', '과목 메모', '교재, 참고 사항 등 (그 과목의 캘린더 일정 모두에 들어갑니다)'],
  ];
  const WHERE = {
    dropbox: 'Dropbox › Apps › KnouWidget › knou_scope.txt (이 브라우저에도 백업)',
    local: '이 브라우저 (구글 계정 동기화)',
    backup: '이 브라우저의 백업 — 지금 Dropbox에 연결되지 않음',
  };
  const HELP = {
    dropbox: '과목마다 중간평가·기말평가·과목 메모를 적습니다. 서식 없는 글자만 저장되며, 아이패드 위젯과 메모장에서 고친 내용과 같은 파일입니다. 저장하면 위젯에 바로 반영되고, 구글 캘린더 설명란에는 다음 동기화 때 반영됩니다.',
    local: '과목마다 중간평가·기말평가·과목 메모를 적습니다. 이 브라우저에 저장되며, 브라우저의 동기화를 켜 두었다면 같은 구글 계정의 다른 PC에서도 보입니다. 구글 캘린더 설명란에는 다음 동기화 때 반영됩니다. 아이패드 위젯에서도 보려면 Dropbox를 연결하세요 — 지금 적은 내용이 그대로 Dropbox로 옮겨집니다.',
    backup: '지금은 이 브라우저에 백업해 둔 내용을 보여 줍니다. 저장하면 이 브라우저에 저장되고, 다음에 Dropbox에 연결되면(동기화하거나 이 화면을 다시 열 때) 자동으로 Dropbox에 올라갑니다.',
  };

  let doc = null; // { courses, preamble, memos, rev, version, mode, exists, semester }
  let saving = false;

  const fields = () => [...document.querySelectorAll('textarea[data-c]')];
  const current = () => {
    const o = {};
    for (const t of fields()) (o[t.dataset.c] = o[t.dataset.c] || { mid: '', final: '', memo: '' })[t.dataset.k] = t.value;
    return o;
  };
  const isDirty = () => !!doc && fields().some((t) => t.value !== (doc.memos[t.dataset.c]?.[t.dataset.k] || ''));

  function grow(t) {
    t.style.height = 'auto';
    t.style.height = Math.max(58, t.scrollHeight + 2) + 'px';
  }

  function setState(text) { $('state').textContent = text || ''; }

  function refreshDirty() {
    for (const sec of document.querySelectorAll('.course')) {
      const changed = [...sec.querySelectorAll('textarea')].some((t) => t.value !== (doc.memos[t.dataset.c]?.[t.dataset.k] || ''));
      sec.classList.toggle('changed', changed);
    }
    const dirty = isDirty();
    $('btnSave').disabled = !dirty || saving;
    const none = doc.mode === 'dropbox' ? '아직 파일이 없습니다 — 저장하면 만들어집니다' : '아직 저장한 메모가 없습니다';
    setState(dirty ? '저장하지 않은 변경이 있습니다' : doc.exists ? '' : none);
  }

  function banner(kind, title, body, extra) {
    const b = $('banner');
    if (!title) { b.hidden = true; b.replaceChildren(); return; }
    b.className = kind || '';
    b.hidden = false;
    b.replaceChildren(h('div', { class: 't' }, title), body ? h('p', { class: 'muted' }, body) : null, ...(extra || []));
  }

  const roBox = (text) => {
    const box = h('textarea', { readonly: true });
    box.value = text;
    return box;
  };

  // 충돌 때 보여 줄 "내가 고친 내용" (txt 모양 그대로, 바뀐 과목만)
  function myEditsText(values) {
    const out = [];
    for (const c of doc.courses) {
      const v = values[c], o = doc.memos[c] || {};
      if (!v || KINDS.every(([k]) => (v[k] || '') === (o[k] || ''))) continue;
      out.push(c);
      if (v.memo.trim()) out.push(v.memo.trim());
      out.push(`중간평가: ${v.mid.trim()}`.trim(), `기말평가: ${v.final.trim()}`.trim(), '');
    }
    return out.join('\n');
  }

  function render() {
    $('where').textContent = WHERE[doc.mode] || '';
    $('help').textContent = HELP[doc.mode] || '';
    $('jump').replaceChildren(...doc.courses.map((c, i) => h('a', { href: '#c' + i }, c)));
    $('list').replaceChildren(
      ...doc.courses.map((c, i) =>
        h('section', { class: 'course', id: 'c' + i },
          h('h2', null, h('span', { class: 'dirty', title: '바뀐 칸이 있음' }), c),
          KINDS.map(([k, label, ph]) => {
            const id = `f${i}_${k}`;
            const ta = h('textarea', { id, 'data-c': c, 'data-k': k, placeholder: ph, spellcheck: 'false' });
            ta.value = doc.memos[c]?.[k] || '';
            ta.addEventListener('input', () => { grow(ta); refreshDirty(); });
            return [h('label', { for: id }, label), ta];
          }).flat()))); // h()는 한 단계만 펼치므로 [라벨, 칸] 쌍을 미리 펼친다
    for (const t of fields()) grow(t);
    $('btnExport').disabled = false;
    refreshDirty();
  }

  function empty(text) {
    doc = null;
    $('list').replaceChildren(h('div', { class: 'empty muted' }, text));
    $('jump').replaceChildren();
    $('btnSave').disabled = true;
    $('btnExport').disabled = true;
    setState('');
  }

  // 다시 연결된 뒤 브라우저 쪽과 Dropbox 쪽이 둘 다 바뀌어 있을 때: 어느 쪽을 쓸지 고른다
  function conflictBanner(c) {
    const when = c.savedAt ? new Date(c.savedAt).toLocaleString('ko-KR') : '';
    const lines = [];
    for (const course of doc.courses) {
      const a = c.memos[course] || {}, b = doc.memos[course] || {};
      if (KINDS.every(([k]) => (a[k] || '') === (b[k] || ''))) continue;
      lines.push(course);
      if ((a.memo || '').trim()) lines.push(a.memo.trim());
      lines.push(`중간평가: ${(a.mid || '').trim()}`.trim(), `기말평가: ${(a.final || '').trim()}`.trim(), '');
    }
    const pick = async (choice) => {
      setState('적용하는 중…');
      const r = await send('scopeResolve', { data: { choice, rev: doc.rev } });
      if (!r || r.ok === false) {
        banner('bad', '적용하지 못했습니다', r?.message || 'Dropbox에 연결할 수 없습니다. 잠시 뒤 다시 열어 주세요.');
        return;
      }
      banner();
      apply(r);
      setState(choice === 'local' ? '브라우저의 내용으로 Dropbox를 바꿨습니다 · 위젯에 반영됨' : 'Dropbox의 내용을 씁니다');
      if (r.note) banner('warn', r.note);
    };
    banner('warn', '브라우저와 Dropbox 양쪽에서 메모가 바뀌었습니다',
      `Dropbox에 연결되지 않은 동안 이 브라우저에서 저장한 메모${when ? `(${when})` : ''}가 있는데, 그사이 Dropbox의 knou_scope.txt도 위젯이나 메모장에서 바뀌었습니다. 어느 쪽도 덮어쓰지 않았습니다. 화면에는 지금 Dropbox 내용이 보입니다. 아래는 브라우저에만 있는 내용(다른 과목만)입니다.`,
      [
        roBox(lines.join('\n') || '(과목 칸은 같고 머리말만 다릅니다)'),
        h('div', { class: 'row' },
          h('button', { class: 'primary', onclick: () => pick('dropbox') }, 'Dropbox 내용 쓰기'),
          h('button', { onclick: () => { if (confirm('Dropbox의 knou_scope.txt를 브라우저의 내용으로 바꿉니다. 위젯·메모장에서 고친 내용은 사라집니다. 계속할까요?')) pick('local'); } }, '브라우저 내용으로 Dropbox 덮어쓰기')),
        h('p', { class: 'muted small' }, '“Dropbox 내용 쓰기”를 골라도 브라우저의 내용은 지우지 않고 따로 보관합니다. 필요한 부분은 위 상자에서 복사해 붙여 넣으세요.'),
      ]);
  }

  function apply(r) {
    doc = {
      courses: r.courses, preamble: r.preamble || '', memos: r.memos || {},
      rev: r.rev || null, version: r.version ?? null, mode: r.mode || 'dropbox', exists: !!r.exists, semester: r.semester || '',
    };
    render();
    if (r.conflict) conflictBanner(r.conflict);
    else if (doc.mode === 'backup') {
      banner('warn', 'Dropbox에 연결하지 못해 이 브라우저의 백업을 보여 줍니다',
        '저장하면 이 브라우저에 저장되고, Dropbox에 다시 닿으면 자동으로 올라갑니다. Dropbox 연결이 풀렸다면 팝업의 Dropbox 줄에서 다시 연결하세요.' + (r.reason ? ` (이유: ${r.reason})` : ''));
    }
  }

  async function load({ keepEdits } = {}) {
    setState('불러오는 중…');
    $('btnReload').disabled = true;
    const r = await send('scopeLoad');
    $('btnReload').disabled = false;
    if (!r || r.ok === false) {
      setState('');
      banner('bad', '과제 메모를 불러오지 못했습니다', r?.message || '확장 백그라운드에 연결할 수 없습니다. 확장을 새로고침한 뒤 다시 열어 주세요.');
      return false;
    }
    if (!r.courses?.length) {
      empty('과목 목록이 아직 없습니다. 팝업에서 동기화를 한 번 한 뒤 다시 열어 주세요.');
      return false;
    }
    // 다시 채울 것은 "내가 바꾼 칸"만이다. 안 바꾼 칸까지 덮으면 다른 곳에서 고친 내용을 옛 값으로 되돌려 버린다
    let edits = null;
    if (keepEdits && doc) {
      edits = {};
      for (const t of fields()) {
        if (t.value !== (doc.memos[t.dataset.c]?.[t.dataset.k] || '')) (edits[t.dataset.c] = edits[t.dataset.c] || {})[t.dataset.k] = t.value;
      }
    }
    apply(r);
    if (r.pushed) setState('브라우저에서 고친 메모를 Dropbox에 올렸습니다');
    if (edits) {
      for (const t of fields()) {
        const v = edits[t.dataset.c]?.[t.dataset.k];
        if (v !== undefined && v !== t.value) { t.value = v; grow(t); }
      }
      refreshDirty();
    }
    return true;
  }

  async function save() {
    if (!doc || !isDirty() || saving) return;
    saving = true;
    $('btnSave').disabled = true;
    setState('저장하는 중…');
    const values = current();
    const r = await send('scopeSave', { data: { preamble: doc.preamble, memos: values, mode: doc.mode, rev: doc.rev, version: doc.version } });
    saving = false;
    if (r?.conflict) {
      const mine = myEditsText(values);
      try { await navigator.clipboard.writeText(mine); } catch { /* 아래 상자에 남김 */ }
      const where = doc.mode === 'dropbox'
        ? '편집하는 사이에 위젯·Dropbox 앱·메모장에서 knou_scope.txt가 바뀌었습니다.'
        : '편집하는 사이에 다른 창이나 다른 PC의 브라우저에서 과제 메모를 먼저 저장했습니다.';
      banner('warn', '다른 곳에서 먼저 고쳤습니다 — 저장하지 않았습니다',
        `${where} 덮어쓰지 않았으니, 아래 둘 중 하나를 고르세요. 내가 고친 내용은 클립보드에도 복사해 두었습니다.`,
        [
          roBox(mine),
          h('div', { class: 'row' },
            h('button', { class: 'primary', onclick: async () => { banner(); await load({ keepEdits: true }); setState('새 내용 위에 내가 고친 칸을 다시 채웠습니다. 확인 후 저장하세요.'); } }, '새 내용 불러오고 내 변경 다시 채우기'),
            h('button', { onclick: async () => { banner(); await load(); } }, '새 내용만 불러오기 (내 변경 버림)')),
        ]);
      refreshDirty();
      return;
    }
    if (!r || r.ok === false) {
      banner('bad', '저장하지 못했습니다', r?.message || '알 수 없는 오류입니다. 버그 리포트를 보내주세요.');
      refreshDirty();
      return;
    }
    // 저장 성공: 방금 저장한 내용이 새 기준
    doc.rev = r.rev || doc.rev;
    doc.version = r.version ?? doc.version;
    doc.exists = true;
    for (const c of doc.courses) doc.memos[c] = { mid: values[c]?.mid || '', final: values[c]?.final || '', memo: values[c]?.memo || '' };
    banner();
    refreshDirty();
    const ex = r.exported;
    const msg = r.local
      ? doc.mode === 'backup' ? '이 브라우저에 저장했습니다 · Dropbox에 닿으면 올라갑니다' : '이 브라우저에 저장했습니다 · 캘린더 설명란은 다음 동기화 때'
      : ex?.ok === false ? '저장했습니다 · 위젯용 내보내기는 실패 (다음 동기화 때 다시 시도)' : '저장했습니다 · 위젯에 반영됨';
    setState(msg);
    // 저장 후 저장소 모양으로 다시 읽어 rev와 내용을 맞춘다 (같은 내용이면 화면은 그대로)
    await load();
    if (!$('state').textContent) setState(msg);
  }

  // ---------- txt 내보내기: 화면에 보이는 내용(저장 전 변경 포함)을 knou_scope.txt 형식으로 ----------
  const fileName = () => `knou_scope_${(doc?.semester || '').replace(/[^0-9A-Za-z_-]/g, '') || 'memo'}.txt`;

  async function exportTxt() {
    if (!doc) return;
    const text = KS.scope.scopeToTxt(doc.preamble, doc.courses, current());
    const name = fileName();
    try {
      // Chrome·Edge·웨일·오페라: "다른 이름으로 저장" 창
      if (typeof window.showSaveFilePicker === 'function') {
        let handle;
        try {
          handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: '텍스트 파일', accept: { 'text/plain': ['.txt'] } }] });
        } catch (e) {
          if (e?.name === 'AbortError') return; // 사용자가 취소
          throw e;
        }
        const w = await handle.createWritable();
        await w.write(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        await w.close();
        setState(`txt로 내보냈습니다 (${handle.name || name})`);
        return;
      }
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      try {
        // Firefox: 다운로드 API로 저장 위치를 묻는다
        if (KS.ext.downloads?.download) {
          await KS.ext.downloads.download({ url, filename: name, saveAs: true });
          setState('txt로 내보냈습니다');
          return;
        }
        // 그 밖: 보통의 다운로드 (브라우저 설정에 따라 위치를 묻거나 다운로드 폴더에 저장)
        h('a', { href: url, download: name }).click();
        setState('txt로 내보냈습니다');
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (e) {
      if (/cancel/i.test(String(e?.message || e))) return; // Firefox 저장 창 취소
      banner('bad', 'txt로 내보내지 못했습니다', String(e?.message || e));
    }
  }

  $('btnSave').onclick = save;
  $('btnExport').onclick = exportTxt;
  $('btnReload').onclick = async () => {
    if (isDirty() && !confirm('저장하지 않은 변경이 있습니다. 버리고 다시 불러올까요?')) return;
    banner();
    await load();
  };
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  });
  window.addEventListener('beforeunload', (e) => {
    if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  load();
})();
