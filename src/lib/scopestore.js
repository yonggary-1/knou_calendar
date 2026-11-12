// 과제 메모의 브라우저 저장소 (chrome.storage.sync = 구글 계정을 따라 다른 PC의 크롬으로 동기화)
//  - Dropbox를 연결하지 않았으면 여기가 원본
//  - Dropbox를 연결했으면 knou_scope.txt의 백업 (연결이 끊겨도 메모를 잃지 않게)
//
// 기록 모양: { v: 1, text, semester, savedAt, dirty, baseRev }
//   text     : knou_scope.txt와 같은 형식의 전체 내용 (lib/scope.js의 scopeToTxt)
//   dirty    : Dropbox에 아직 올리지 않은 변경이 있음 (Dropbox 없이 고쳤거나, 연결이 끊긴 동안 고침)
//   baseRev  : 이 내용이 바탕으로 삼은 Dropbox 파일의 rev (없으면 null)
//
// storage.sync는 항목 하나가 약 8KB, 전체가 약 100KB까지라 글을 여러 조각(ks_scope_0, _1 …)으로 나눠 저장한다
(() => {
  const KS = globalThis.KS;
  const META = 'ks_scope_meta';
  const PART = 'ks_scope_';
  const PART_BYTES = 6000; // 항목 한도(8,192바이트)보다 넉넉하게 (키·따옴표·이스케이프 몫)
  const enc = new TextEncoder();

  const area = () => KS.ext.storage.sync || KS.ext.storage.local; // sync가 없는 환경 대비

  // UTF-8 바이트 기준으로 자른다 (한글은 3바이트). JSON으로 저장될 때 늘어나는 몫까지 셈
  function split(text) {
    const parts = [];
    let cur = '', bytes = 0;
    for (const ch of text) {
      const b = enc.encode(JSON.stringify(ch)).length - 2;
      if (bytes + b > PART_BYTES && cur) { parts.push(cur); cur = ''; bytes = 0; }
      cur += ch;
      bytes += b;
    }
    if (cur || !parts.length) parts.push(cur);
    return parts;
  }

  async function get() {
    try {
      const a = area();
      const meta = (await a.get(META))[META];
      if (!meta?.n) return null;
      const keys = Array.from({ length: meta.n }, (_, i) => PART + i);
      const got = await a.get(keys);
      if (keys.some((k) => typeof got[k] !== 'string')) {
        KS.log('warn', '과제 메모 백업 조각이 빠져 있음 (다른 PC와 동기화 중일 수 있음)');
        return null;
      }
      return { ...meta, text: keys.map((k) => got[k]).join('') };
    } catch (e) {
      KS.log('warn', '과제 메모 백업 읽기 실패', String(e?.message || e));
      return null;
    }
  }

  // rec: { text, semester, dirty, baseRev } → savedAt을 붙여 저장. 용량을 넘으면 SCOPE_QUOTA 오류
  async function set(rec) {
    const a = area();
    const parts = split(String(rec.text || ''));
    const old = (await a.get(META))[META];
    const meta = { v: 1, n: parts.length, semester: rec.semester || '', savedAt: Date.now(), dirty: !!rec.dirty, baseRev: rec.baseRev || null };
    const items = { [META]: meta };
    parts.forEach((p, i) => { items[PART + i] = p; });
    try {
      // 조각을 먼저, 목차(meta)를 나중에 — 중간에 끊겨도 옛 목차로 옛 내용이 읽히도록 조각 이름을 겹치지 않게 하지는 않으나,
      // 목차의 조각 수가 맞지 않으면 get()이 null을 돌려 깨진 내용을 쓰지 않는다
      const { [META]: _m, ...partItems } = items;
      await a.set(partItems);
      await a.set({ [META]: meta });
    } catch (e) {
      const msg = String(e?.message || e);
      KS.log('warn', '과제 메모 백업 저장 실패', msg);
      if (/quota|QUOTA/i.test(msg)) {
        throw new KS.KsError('SCOPE_QUOTA', '과제 메모가 너무 길어 브라우저(구글 계정 동기화)에 저장할 수 없습니다. 메모를 줄이거나 Dropbox를 연결해 주세요.');
      }
      throw new KS.KsError('SCOPE_STORE', '과제 메모를 브라우저에 저장하지 못했습니다: ' + msg);
    }
    if (old?.n > parts.length) {
      try { await a.remove(Array.from({ length: old.n - parts.length }, (_, i) => PART + (parts.length + i))); } catch { /* 남은 조각은 무시됨 */ }
    }
    return meta;
  }

  async function clear() {
    const a = area();
    const old = (await a.get(META))[META];
    await a.remove([META, ...Array.from({ length: old?.n || 0 }, (_, i) => PART + i)]);
  }

  KS.scopeStore = { get, set, clear, split, PART_BYTES };
})();
