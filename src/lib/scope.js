// 과제 메모 (Dropbox 앱 폴더의 knou_scope.txt)
// 위젯 KnouWidget.js의 parseScopeTxt / memoOf / scopeToTxt 와 **똑같은 규칙**을 쓴다.
// 한쪽만 고치면 확장과 위젯이 번갈아 저장할 때 파일이 흔들리므로, 바꿀 때는 반드시 둘 다 고친다.
// (test/scope_test.js가 위젯 스크립트의 함수와 결과를 직접 비교한다)
(() => {
  const KS = globalThis.KS;

  // knou_scope.txt → { items: [{ course, kind, scope }], preamble }
  //   과목명과 같은 줄 = 과목 제목 (공백 무시하고 비교)
  //   "중간평가:" / "기말평가:" (또는 "중간:", "기말:", "기말시험:")로 시작하는 줄부터 다음 표시·다음 과목 전까지 = 그 평가의 내용
  //   과목 제목 바로 아래, 평가 표시 앞의 줄 = 과목 메모(kind ''). 첫 과목 제목 위의 줄 = 머리말
  function parseScopeTxt(text, courses) {
    const norm = (t) => String(t).replace(/\s+/g, '');
    const items = [];
    const preamble = [];
    let cur = null, kind = '', buf = [];
    const flush = () => {
      const body = buf.join('\n').replace(/^\s*\n+|\s+$/g, '').trim();
      if (cur && body) items.push({ course: cur, kind, scope: body });
      buf = [];
    };
    for (const raw of String(text || '').replace(/^﻿/, '').split(/\r?\n/)) {
      const t = raw.trim();
      const c = t && courses.find((x) => norm(x) === norm(t));
      if (c) { flush(); cur = c; kind = ''; continue; }
      const m = /^(중간평가|기말평가|기말시험|중간|기말)\s*[:：]\s*(.*)$/.exec(t);
      if (m && cur) { flush(); kind = m[1].startsWith('중간') ? '중간평가' : '기말평가'; buf = [m[2]]; continue; }
      if (cur) buf.push(raw.replace(/\s+$/, ''));
      else preamble.push(raw.replace(/\s+$/, ''));
    }
    flush();
    return { format: 'txt', items, preamble: preamble.join('\n').replace(/\s+$/, '') };
  }

  // 같은 과목·같은 종류가 여러 번이면 빈 줄 하나를 사이에 두고 이어 붙인다
  function memoOf(scope, course) {
    const get = (k) => (scope?.items || []).filter((x) => x.course === course && (x.kind || '') === k).map((x) => x.scope).join('\n\n');
    return { mid: get('중간평가'), final: get('기말평가'), memo: get('') };
  }

  // 저장 모양: 머리말 → 빈 줄 → 과목마다 [과목명 / 과목 메모(있을 때만) / 중간평가: / 기말평가: / 빈 줄]
  // 내용이 비어도 평가 줄은 남긴다. 줄바꿈 LF, BOM 없음
  function scopeToTxt(preamble, courses, memos) {
    const out = [];
    if (preamble) out.push(preamble, '');
    for (const c of courses) {
      const m = memos[c] || { mid: '', final: '', memo: '' };
      out.push(c);
      if (m.memo.trim()) out.push(m.memo.replace(/\s+$/, ''));
      out.push(`중간평가: ${m.mid.replace(/\s+$/, '')}`.replace(/\s+$/, ''));
      out.push(`기말평가: ${m.final.replace(/\s+$/, '')}`.replace(/\s+$/, ''));
      out.push('');
    }
    return out.join('\n');
  }

  // ---- 확장에서만 쓰는 것 ----

  // 위젯용 knou_agenda.json의 notes: { 과목명: { mid, final, memo } }
  function notesOf(text, courses) {
    const parsed = parseScopeTxt(text, courses);
    const notes = {};
    for (const c of courses) notes[c] = memoOf(parsed, c);
    return notes;
  }

  // "2026-2" → "2026-2학기 과제 메모 — …" (머리말 첫 줄. 학기 전환 판단에 쓴다)
  const headerFor = (semester) =>
    `${semester ? semester + '학기 ' : ''}과제 메모 — 첫 과목명 위에 적은 내용은 위젯에 나오지 않습니다.`;

  // 머리말 첫 줄의 "YYYY-N학기" → "YYYY-N". 못 읽으면 '' (= 사용자가 만든 파일로 보고 건드리지 않음)
  function semesterOfTxt(text) {
    const first = String(text || '').replace(/^﻿/, '').split(/\r?\n/)[0] || '';
    const m = /^\s*(\d{4})\s*-\s*(\d)\s*학기/.exec(first);
    return m ? `${m[1]}-${m[2]}` : '';
  }

  function templateTxt(semester, courses) {
    return scopeToTxt(headerFor(semester), courses, {});
  }

  KS.scope = { parseScopeTxt, memoOf, scopeToTxt, notesOf, headerFor, semesterOfTxt, templateTxt };
})();
