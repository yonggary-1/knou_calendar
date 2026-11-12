// 백그라운드: 팝업/설정 페이지의 요청 처리, 방통대 로그인 후 자동 재시도
(() => {
  const KS = globalThis.KS;
  const ext = KS.ext;

  async function status() {
    const [state, account, last, perm, settings, dropbox] = await Promise.all([
      KS.sync.getStatus(),
      KS.gauth.getAccount(),
      ext.storage.local.get(['ks_last', 'ks_agenda']),
      ext.permissions.contains({ origins: KS.KNOU_ORIGINS }),
      KS.getSettings(),
      KS.dropbox.status(),
    ]);
    return {
      state,
      account,
      lastSync: last.ks_last || null,
      agenda: last.ks_agenda || null,
      hasPermission: perm,
      hasClientId: !!KS.effectiveClientId(settings),
      // 연결되어 있으면 숨김 설정과 관계없이 항상 보인다
      dropbox: { ...dropbox, hidden: !dropbox.connected && !!settings.dropboxHidden, hasKey: !!KS.effectiveDropboxKey(settings) },
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
    // Dropbox: 화면에 이유를 보여줄 수 있게 오류도 결과로 돌려준다
    dropboxStatus: () => KS.dropbox.status(),
    // 연결은 팝업·설정 어디서 눌러도 여기서 끝까지 진행된다 (인증 창이 뜨며 팝업이 닫혀도 계속됨)
    connectDropbox: () =>
      wrap(async () => {
        const r = await KS.dropbox.connect();
        await KS.saveSettings({ dropboxHidden: false }); // 숨겨 두었어도 연결하면 팝업에 다시 보임
        const x = await KS.dropbox.exportAgenda({ quiet: false }); // 남은 일정이 있으면 바로 한 번 내보냄
        return { ...r, exported: x };
      }),
    // 과제 메모 편집기 (editor/editor.html)
    openScopeEditor: async () => {
      const url = ext.runtime.getURL('editor/editor.html');
      const [tab] = await ext.tabs.query({ url });
      if (tab) {
        await ext.tabs.update(tab.id, { active: true });
        try { await ext.windows.update(tab.windowId, { focused: true }); } catch { /* 창 포커스는 실패해도 됨 */ }
      } else await ext.tabs.create({ url });
      return { ok: true };
    },
    // 1.6.2: Dropbox 연결 여부와 관계없이 열림 (연결 안 함 → 브라우저 저장, 연결 → Dropbox + 브라우저 백업)
    scopeLoad: () => wrap(KS.memo.load),
    scopeSave: (msg) => wrap(() => KS.memo.save(msg.data || {})),
    scopeResolve: (msg) => wrap(() => KS.memo.resolve(msg.data || {})),
    hideDropbox: async () => {
      await KS.saveSettings({ dropboxHidden: true });
      KS.log('info', 'Dropbox 줄 숨김 (사용 안 함)');
      return { ok: true };
    },
    disconnectDropbox: () => wrap(KS.dropbox.disconnect),
    exportDropbox: () => wrap(() => KS.dropbox.exportAgenda({ quiet: false })),
  };

  async function wrap(fn) {
    try {
      return { ok: true, ...((await fn()) || {}) };
    } catch (e) {
      return { ok: false, message: String(e?.message || e) };
    }
  }

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
