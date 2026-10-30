// 작은 DOM 도우미 (innerHTML을 쓰지 않아 데이터가 그대로 글자로만 들어간다)
(() => {
  const KS = globalThis.KS;
  KS.h = (tag, props, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  };
  KS.send = async (type, data) => {
    try {
      const r = await KS.ext.runtime.sendMessage({ type, ...(data || {}) });
      if (r && r.ok === false) throw new Error(r.error);
      return r?.result;
    } catch (e) {
      console.warn('[Knou calendar]', type, e);
      return null;
    }
  };
  KS.fmtTime = (ms) => {
    if (!ms) return '';
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
})();
