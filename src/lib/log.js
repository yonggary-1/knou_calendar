// 버그 리포트용 로그 (개인정보는 넣지 않음)
(() => {
  const KS = globalThis.KS;
  const MAX = 400;
  let queue = Promise.resolve();

  const safe = (d) => {
    try {
      const s = typeof d === 'string' ? d : JSON.stringify(d);
      return s.length > 800 ? s.slice(0, 800) + '…' : s;
    } catch {
      return String(d);
    }
  };

  KS.log = (level, msg, data) => {
    const line = `${new Date().toISOString()} [${level}] ${msg}${data !== undefined ? ' ' + safe(data) : ''}`;
    const fn = console[level] || console.log;
    fn.call(console, `[Knou calendar] ${msg}${data !== undefined ? ' ' + safe(data) : ''}`);
    if (!KS.ext?.storage?.local) return;
    queue = queue
      .then(async () => {
        const r = await KS.ext.storage.local.get('ks_log');
        const arr = r.ks_log || [];
        arr.push(line);
        while (arr.length > MAX) arr.shift();
        await KS.ext.storage.local.set({ ks_log: arr });
      })
      .catch(() => {});
  };
})();
