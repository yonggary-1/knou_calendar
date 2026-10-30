// Knou calendar 공통 네임스페이스
(() => {
  const KS = (globalThis.KS = globalThis.KS || {});

  // Firefox는 browser.*, Chromium 계열은 chrome.* (MV3에서 둘 다 Promise 지원)
  KS.ext = globalThis.browser ?? globalThis.chrome;

  KS.KNOU_HOST = 'm.knou.ac.kr';
  KS.KNOU_DASHBOARD = 'https://m.knou.ac.kr/';
  KS.KNOU_ORIGINS = ['https://*.knou.ac.kr/*'];

  class KsError extends Error {
    constructor(code, message, extra) {
      super(message);
      this.code = code;
      if (extra) Object.assign(this, extra);
    }
  }
  KS.KsError = KsError;

  KS.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
})();
