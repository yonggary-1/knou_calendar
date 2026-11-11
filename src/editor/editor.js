// 과제 메모 편집기: Dropbox의 knou_scope.txt를 과목별 칸으로 고친다
//  - 열 때마다 최신 내용과 rev를 받는다
//  - 저장은 그 rev일 때만 (다른 곳에서 먼저 고쳤으면 덮어쓰지 않고, 고친 내용을 화면에 남긴다)
//  - 저장 모양은 위젯과 같다 (lib/scope.js의 scopeToTxt, 백그라운드에서 만든다)
(() => {
  const { h, send } = KS;
  const $ = (id) => document.getElementById(id);
  const KINDS = [
    ['mid', '중간평가', '시험 범위, 과제 내용 등'],
    ['final', '기말평가', '레포트 주제·분량, 시험 범위 등'],
    ['memo', '과목 메모', '교재, 참고 사항 등 (그 과목의 캘린더 일정 모두에 들어갑니다)'],
  ];

  let doc = null; // { courses, preamble, memos, rev, exists }
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
    setState(dirty ? '저장하지 않은 변경이 있습니다' : doc.exists ? '' : '아직 파일이 없습니다 — 저장하면 만들어집니다');
  }

  function banner(kind, title, body, extra) {
    const b = $('banner');
    if (!title) { b.hidden = true; b.replaceChildren(); return; }
    b.className = kind || '';
    b.hidden = false;
    b.replaceChildren(h('div', { class: 't' }, title), body ? h('p', { class: 'muted' }, body) : null, ...(extra || []));
  }

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
    refreshDirty();
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
    if (!r.connected) {
      doc = null;
      $('list').replaceChildren(h('div', { class: 'empty muted' }, 'Dropbox 연결이 필요합니다. 팝업의 Dropbox 줄이나 설정 → 4. Dropbox 내보내기에서 연결하세요.'));
      $('jump').replaceChildren();
      $('btnSave').disabled = true;
      setState('');
      return false;
    }
    if (!r.courses?.length) {
      doc = null;
      $('list').replaceChildren(h('div', { class: 'empty muted' }, '과목 목록이 아직 없습니다. 팝업에서 동기화를 한 번 한 뒤 다시 열어 주세요.'));
      $('jump').replaceChildren();
      $('btnSave').disabled = true;
      setState('');
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
    doc = { courses: r.courses, preamble: r.preamble || '', memos: r.memos || {}, rev: r.rev || null, exists: !!r.exists };
    render();
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
    const r = await send('scopeSave', { data: { preamble: doc.preamble, memos: values, rev: doc.rev } });
    saving = false;
    if (r?.conflict) {
      const mine = myEditsText(values);
      try { await navigator.clipboard.writeText(mine); } catch { /* 아래 상자에 남김 */ }
      const box = h('textarea', { readonly: true });
      box.value = mine;
      banner('warn', '다른 곳에서 먼저 고쳤습니다 — 저장하지 않았습니다',
        '편집하는 사이에 위젯·Dropbox 앱·메모장에서 knou_scope.txt가 바뀌었습니다. 덮어쓰지 않았으니, 아래 둘 중 하나를 고르세요. 내가 고친 내용은 클립보드에도 복사해 두었습니다.',
        [
          box,
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
    doc.exists = true;
    for (const c of doc.courses) doc.memos[c] = { mid: values[c]?.mid || '', final: values[c]?.final || '', memo: values[c]?.memo || '' };
    banner();
    refreshDirty();
    const ex = r.exported;
    setState(ex?.ok === false ? '저장했습니다 · 위젯용 내보내기는 실패 (다음 동기화 때 다시 시도)' : '저장했습니다 · 위젯에 반영됨');
    // 저장 후 서버 모양으로 다시 읽어 rev와 내용을 맞춘다 (같은 내용이면 화면은 그대로)
    await load();
    setState(ex?.ok === false ? '저장했습니다 · 위젯용 내보내기는 실패 (다음 동기화 때 다시 시도)' : '저장했습니다 · 위젯에 반영됨');
  }

  $('btnSave').onclick = save;
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
