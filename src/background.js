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
      pastRange: settings.pastRange === 'all' ? 'all' : '2w',
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
    ackMessage: (msg) => KS.sync.ackMessage(msg.msgAt),
    confirmEmpty: () => KS.sync.apply({ allowEmpty: true }),
    cancel: () => KS.sync.cancel(),
    openKnou: () => KS.sync.openKnouLogin(),
    // 1.6.5: 구글 연결은 설정 화면에서만. 연결만 하고, 동기화가 구글 연결을 기다리던 중이었으면 이어서 진행한다
    connectGoogle: () =>
      wrap(async () => {
        await KS.gauth.getToken({ interactive: true, forceInteractive: true });
        const account = await KS.gauth.getAccount();
        const st = await KS.sync.getStatus();
        let resumed = false;
        if (st.phase === 'need_google') {
          resumed = true;
          KS.sync.preview({ interactive: false, trigger: 'resume' }).catch((e) => KS.log('error', '구글 연결 후 이어서 동기화 실패', String(e?.message || e)));
        }
        KS.log('info', '설정에서 구글 연결', { resumed });
        return { email: account?.email || '', resumed };
      }),
    switchAccount: () => KS.sync.switchAccount(),
    disconnect: () => KS.sync.disconnect(),
    resetCalendar: () => KS.sync.resetCalendar(),
    // focus: 'google' | 'dropbox' — 설정의 그 계정 칸을 보여 준다
    openOptions: (msg) => openOptions(msg?.focus),
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

  // 설정 화면을 열고(이미 열려 있으면 그 탭으로) 보여 줄 칸을 알려 준다. 설정 화면은 ks_options_focus를 보고 그 칸으로 간다
  async function openOptions(focus) {
    if (focus) await ext.storage.session.set({ ks_options_focus: { focus, at: Date.now() } });
    await ext.runtime.openOptionsPage();
    return { ok: true };
  }

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
    if (d.reason === 'install') openOptions('accounts'); // 처음 설치: 계정 연결부터
  });
})();
