// 사용자 설정
(() => {
  const KS = globalThis.KS;

  KS.DEFAULT_SETTINGS = {
    clientId: '',
    scopeMode: 'app', // 'app' = 확장이 만든 캘린더만 / 'full' = 전체 캘린더
    calendarName: '방통대 학사일정',
    showPeriod: true, // 제출기간을 종일 일정으로
    showDeadline: true, // 마감 시각 일정
    showFormative: true, // 형성평가 학습기간
    classReminders: '1440,120', // 출석수업 알림(분 전)
    deadlineReminders: '1440,180', // 마감 알림(분 전)
    autoApply: false, // 미리보기 없이 바로 반영
    placeOverrides: {}, // 장소 원문 → 정식 명칭
  };

  KS.getSettings = async () => {
    const r = await KS.ext.storage.local.get('ks_settings');
    return { ...KS.DEFAULT_SETTINGS, ...(r.ks_settings || {}) };
  };

  KS.saveSettings = async (patch) => {
    const next = { ...(await KS.getSettings()), ...patch };
    await KS.ext.storage.local.set({ ks_settings: next });
    return next;
  };

  // 직접 입력한 ID가 있으면 그것을, 없으면 빌드에 내장된 ID를 쓴다
  KS.effectiveClientId = (s) => String(s?.clientId || '').trim() || String(KS.env?.clientId || '').trim();

  KS.parseReminders = (s) =>
    String(s ?? '')
      .split(/[,\s]+/)
      .map((x) => parseInt(x, 10))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 40320)
      .slice(0, 5);
})();
