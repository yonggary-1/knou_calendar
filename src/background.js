// 백그라운드: 팝업/설정 페이지의 요청 처리, 방통대 로그인 후 자동 재시도
(() => {
  const KS = globalThis.KS;
  const ext = KS.ext;

  async function status() {
    const [state, account, last, perm, settings] = await Promise.all([
      KS.sync.getStatus(),
      KS.gauth.getAccount(),
      ext.storage.local.get(['ks_last', 'ks_agenda']),
      ext.permissions.contains({ origins: KS.KNOU_ORIGINS }),
      KS.getSettings(),
    ]);
    return {
      state,
      account,
      lastSync: last.ks_last || null,
      agenda: last.ks_agenda || null,
      hasPermission: perm,
      hasClientId: !!KS.effectiveClientId(settings),
      target: KS.env.target,
      version: KS.env.version,
    };
  }

  const handlers = {
    status,
    preview: () => KS.sync.preview({ interactive: true, trigger: 'user' }),
    apply: () => KS.sync.apply(),
    confirmEmpty: () => KS.sync.apply({ allowEmpty: true }),
    cancel: () => KS.sync.cancel(),
    openKnou: () => KS.sync.openKnouLogin(),
    connectGoogle: () => KS.sync.preview({ interactive: true, trigger: 'connect', forceInteractive: true }),
    switchAccount: () => KS.sync.switchAccount(),
    disconnect: () => KS.sync.disconnect(),
    resetCalendar: () => KS.sync.resetCalendar(),
    openOptions: () => ext.runtime.openOptionsPage(),
  };

  ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const h = handlers[msg?.type];
    if (!h) return false;
    Promise.resolve()
      .then(() => h(msg))
      .then((result) => sendResponse({ ok: true, result }))
      .catch((e) => {
        KS.log('error', '요청 처리 실패', { type: msg.type, msg: String(e?.message || e) });
        sendResponse({ ok: false, error: String(e?.message || e) });
      });
    return true; // 비동기 응답
  });

  ext.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status !== 'complete') return;
    if (!(tab?.url || '').startsWith(KS.KNOU_DASHBOARD)) return;
    KS.sync.onKnouPageLoaded().catch((e) => KS.log('error', '자동 재시도 실패', String(e?.message || e)));
  });

  ext.runtime.onInstalled.addListener((d) => {
    KS.log('info', '설치/업데이트', { reason: d.reason, version: KS.env.version, target: KS.env.target });
    if (d.reason === 'install') ext.runtime.openOptionsPage();
  });
})();
