// Nuxt 3 SSR payload(__NUXT_DATA__, devalue 형식) 해석기
(() => {
  const KS = globalThis.KS;

  const UNDEFINED = -1, HOLE = -2, NAN = -3, POS_INF = -4, NEG_INF = -5, NEG_ZERO = -6;
  const PASSTHROUGH = new Set(['Reactive', 'ShallowReactive', 'Ref', 'ShallowRef', 'Skip', 'NuxtError', 'Island']);

  function special(i) {
    switch (i) {
      case UNDEFINED: return undefined;
      case NAN: return NaN;
      case POS_INF: return Infinity;
      case NEG_INF: return -Infinity;
      case NEG_ZERO: return -0;
      default: return undefined;
    }
  }

  function parseEmptyRef(v) {
    if (v === '_' || v === undefined) return undefined;
    if (v === '0n') return 0;
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return v; }
  }

  function unflatten(values) {
    if (typeof values === 'number') return special(values);
    if (!Array.isArray(values) || values.length === 0) throw new Error('payload 형식이 아님');
    const hydrated = new Array(values.length);
    const done = new Uint8Array(values.length);

    function hydrate(index) {
      if (index < 0) return special(index);
      if (done[index]) return hydrated[index];
      const value = values[index];
      const put = (v) => { hydrated[index] = v; done[index] = 1; return v; };

      if (value === null || typeof value !== 'object') return put(value);

      if (Array.isArray(value)) {
        if (typeof value[0] === 'string') {
          const type = value[0];
          if (PASSTHROUGH.has(type)) return put(value.length > 1 ? hydrate(value[1]) : undefined);
          switch (type) {
            case 'EmptyRef':
            case 'EmptyShallowRef':
              return put(parseEmptyRef(hydrate(value[1])));
            case 'Date': return put(new Date(value[1]));
            case 'Set': {
              const s = put(new Set());
              for (let i = 1; i < value.length; i++) s.add(hydrate(value[i]));
              return s;
            }
            case 'Map': {
              const m = put(new Map());
              for (let i = 1; i < value.length; i += 2) m.set(hydrate(value[i]), hydrate(value[i + 1]));
              return m;
            }
            case 'RegExp': return put(new RegExp(value[1], value[2]));
            case 'Object': return put(Object(value[1]));
            case 'BigInt': return put(Number(value[1]));
            case 'null': {
              const o = put(Object.create(null));
              for (let i = 1; i < value.length; i += 2) o[value[i]] = hydrate(value[i + 1]);
              return o;
            }
            default:
              // 모르는 태그: 내부 값만 꺼낸다
              return put(value.length > 1 ? hydrate(value[1]) : undefined);
          }
        }
        const arr = put(new Array(value.length));
        for (let i = 0; i < value.length; i++) {
          const n = value[i];
          if (n === HOLE) continue;
          arr[i] = hydrate(n);
        }
        return arr;
      }

      const obj = put({});
      for (const key of Object.keys(value)) obj[key] = hydrate(value[key]);
      return obj;
    }

    return hydrate(0);
  }

  function extractPayloadText(html) {
    const m = /<script\b[^>]*\bid=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html || '');
    return m ? m[1] : null;
  }

  // 객체 트리를 너비 우선으로 훑어 조건에 맞는 첫 값을 찾는다
  function findDeep(root, pred, limit = 50000) {
    const seen = new Set();
    const queue = [root];
    let n = 0;
    while (queue.length && n++ < limit) {
      const v = queue.shift();
      if (!v || typeof v !== 'object' || seen.has(v)) continue;
      seen.add(v);
      try { if (pred(v)) return v; } catch { /* 무시 */ }
      const children = Array.isArray(v) ? v : (v instanceof Map || v instanceof Set) ? [...v.values()] : Object.values(v);
      for (const c of children) if (c && typeof c === 'object') queue.push(c);
    }
    return null;
  }

  KS.nuxt = { unflatten, extractPayloadText, findDeep };
})();
