// 과목 데이터 → 구글 캘린더 일정 변환, 그리고 기존 일정과의 비교(diff)
(() => {
  const KS = globalThis.KS;
  const TZ = 'Asia/Seoul';
  const SCHEMA = '1';
  const pad = (n) => String(n).padStart(2, '0');

  // ---------- 날짜/시간 ----------
  const isoDate = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const normTime = (t) => {
    if (!t) return null;
    const [h, m] = String(t).split(':').map(Number);
    return `${pad(h)}:${pad(m)}`;
  };
  const addDays = (date, n) => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  };
  const kst = (date, time) => `${date}T${time}:00+09:00`;
  const shiftMinutes = (date, time, mins) => {
    const s = new Date(Date.parse(kst(date, time)) + mins * 60000 + 9 * 3600000).toISOString();
    return { date: s.slice(0, 10), time: s.slice(11, 16) };
  };

  function parseYmd(s) {
    s = String(s ?? '').trim();
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s) || /^(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/.exec(s);
    return m ? isoDate(+m[1], +m[2], +m[3]) : null;
  }

  function parseHours(s) {
    const m = /(\d{1,2}:\d{2})\s*[~\-]\s*(\d{1,2}:\d{2})/.exec(String(s ?? ''));
    return m ? [normTime(m[1]), normTime(m[2])] : null;
  }

  // 지원 형식:
  //  2026.11.09 09:00-11.09 18:00 / 2026.10.13.-10.15. 18:00
  //  2026.10.13 09:00 ~ 2026.10.15 18:00 / 2026.11.09 18:00 (마감만)
  const PERIOD_RE =
    /^\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(?:\([^)]*\))?\s*(\d{1,2}:\d{2})?\s*(?:[-~]\s*(?:(\d{4})\.\s*)?(\d{1,2})\.\s*(\d{1,2})\.?\s*(?:\([^)]*\))?\s*(\d{1,2}:\d{2})?)?\s*$/;

  function parsePeriod(str, defaultStart = '09:00') {
    const raw = String(str ?? '').replace(/ /g, ' ').trim();
    if (!raw) return null;
    const m = PERIOD_RE.exec(raw);
    if (!m) return null;
    const y1 = +m[1], mo1 = +m[2], d1 = +m[3];
    const t1 = normTime(m[4]);
    const startDate = isoDate(y1, mo1, d1);
    if (m[6] === undefined) {
      return { range: false, startDate, startTime: null, endDate: startDate, endTime: t1 || '23:59', hadTime: !!t1 };
    }
    const mo2 = +m[6], d2 = +m[7];
    let y2 = m[5] ? +m[5] : y1;
    if (!m[5] && (mo2 < mo1 || (mo2 === mo1 && d2 < d1))) y2 = y1 + 1; // 해 넘김
    return {
      range: true,
      startDate,
      startTime: t1 || defaultStart,
      endDate: isoDate(y2, mo2, d2),
      endTime: normTime(m[8]) || '23:59',
      hadTime: !!(t1 || m[8]),
    };
  }

  // ---------- 장소 ----------
  const PREFIX = '한국방송통신대학교 ';
  const shortPlace = (raw) =>
    String(raw ?? '').replace(/\([^)]*\)/g, '').replace(/-.*$/, '').replace(/\s+/g, ' ').trim();
  const cleanRegion = (r) => r.replace(/[/·\s]/g, '');

  function autoPlace(raw, campus) {
    const c = String(campus ?? '').trim();
    let m;
    if ((m = /^(.+?)지역대학\s*\((.+?)\)$/.exec(c))) {
      const region = cleanRegion(m[1]);
      const center = m[2].trim();
      return PREFIX + (center.startsWith(region) ? center : region + center);
    }
    if ((m = /^(.+?)지역대학$/.exec(c))) return PREFIX + cleanRegion(m[1]) + '지역대학';
    const s = shortPlace(raw);
    if (!s) return '';
    return s.includes('한국방송통신대학교') ? s : PREFIX + s;
  }

  function resolvePlace(raw, campus, overrides) {
    const ov = overrides || {};
    const auto = autoPlace(raw, campus);
    const override = (raw && ov[raw]) || (campus && ov[campus]) || '';
    return { raw: raw || '', campus: campus || '', auto, override, location: override || auto };
  }

  // ---------- 해시 ----------
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    return JSON.stringify(v);
  }
  function cyrb53(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  // ---------- 일정 생성 ----------
  const reminders = (list) => ({ useDefault: false, overrides: list.map((minutes) => ({ method: 'popup', minutes })) });
  const timedEvent = (sDate, sTime, eDate, eTime) => ({
    start: { dateTime: kst(sDate, sTime), timeZone: TZ },
    end: { dateTime: kst(eDate, eTime), timeZone: TZ },
  });
  const allDayEvent = (sDate, eDateInclusive) => ({
    start: { date: sDate },
    end: { date: addDays(eDateInclusive, 1) },
  });
  const md = (date) => `${date.slice(5, 7)}/${date.slice(8, 10)}`;
  const LINK = 'MyKNOU: https://m.knou.ac.kr/';

  const isExamType = (t) => /시험|객관식|주관식/.test(t || '') && !/과제/.test(t || '');
  // 사용자 결정 (1.6.6): 시험형이 아니면서 제출 기간이 딱 하루인 평가(대개 출석수업 맞춤형평가)가 그 과목 출석수업과
  // **같은 날**이면 따로 일정을 만들지 않고 그 출석수업 일정에 합친다(제목에 평가 이름, 설명란에 평가 시간·평가 메모).
  // 날짜가 다르면 예전처럼 따로 넣는다. 시험형(중간·기말 시험)은 합치지 않는다
  const isOneDayTask = (type, p) => !isExamType(type) && !!p && p.range && p.startDate === p.endDate;
  const shortEval = (type) => (/맞춤형/.test(type || '') ? '맞춤형평가' : type || '평가');
  // → [{ kind, type, p, session }] session = 합칠 출석수업 회차 번호
  function mergedEvals(course) {
    const sessions = (course.attendance?.sessions || []).filter((s) => parseYmd(s.date) && parseHours(s.hours));
    const out = [];
    for (const kind of ['mid', 'final']) {
      const ev = course[kind];
      const p = ev && parsePeriod(ev.period);
      if (!isOneDayTask(ev?.type, p)) continue;
      const i = sessions.findIndex((s) => parseYmd(s.date) === p.startDate);
      if (i >= 0) out.push({ kind, type: ev.type || '', p, session: i });
    }
    return out;
  }

  function buildClassGroup(course, settings, places, merged = []) {
    const a = course.attendance || {};
    const sessions = (a.sessions || []).filter((s) => parseYmd(s.date) && parseHours(s.hours));
    if (!sessions.length) return null;
    const rem = reminders(KS.parseReminders(settings.classReminders));
    const online = /비대면|화상|실시간|온라인/.test(a.type || '');
    const events = sessions.map((s, i) => {
      const date = parseYmd(s.date);
      const [st, et] = parseHours(s.hours);
      const place = resolvePlace(s.placeRaw, s.campus, settings.placeOverrides);
      if (place.raw || place.campus) places.set(place.raw || place.campus, place);
      const location = online && a.meetingUrl ? a.meetingUrl : place.location;
      const evals = merged.filter((m) => m.session === i);
      const desc = [
        ...evals.map((m) => `${m.kind === 'mid' ? '중간' : '기말'}평가: ${m.type || '-'} (${m.p.startTime}~${m.p.endTime})`),
        `과목: ${course.name}`,
        a.type ? `유형: ${a.type}` : null,
        s.placeRaw ? `장소: ${s.placeRaw}` : null,
        s.room ? `강의실: ${s.room}` : null,
        s.campus ? `지역대학: ${s.campus}` : null,
        s.prof || course.prof ? `담당교수: ${s.prof || course.prof}${s.profEmail ? ` (${s.profEmail})` : ''}` : null,
        online && a.meetingUrl ? `접속: ${a.meetingUrl}` : null,
        '',
        LINK,
      ].filter((x) => x !== null);
      return {
        summary:
          `[출석수업] ${course.name}` +
          (sessions.length > 1 ? ` (${i + 1}/${sessions.length})` : '') +
          (a.type && a.type !== '대면수업' ? ` · ${a.type}` : '') +
          evals.map((m) => ` · ${shortEval(m.type)}`).join(''),
        location: location || undefined,
        description: desc.join('\n'),
        ...timedEvent(date, st, date, et),
        colorId: '9',
        reminders: rem,
      };
    });
    const f = events[0];
    return {
      kind: 'class',
      merged: merged.map((m) => ({ kind: m.kind, session: m.session })), // 이 일정에 합친 평가 (applyNotes가 평가 메모를 넣음)
      label: `${course.name} · 출석수업${merged.length ? ` + ${merged.map((m) => shortEval(m.type)).join(', ')}` : ''}`,
      when: `${md(f.start.dateTime.slice(0, 10))} ${f.start.dateTime.slice(11, 16)}`,
      events,
    };
  }

  function buildEvalGroup(course, kind, ev, settings) {
    if (!ev) return null;
    const p = parsePeriod(ev.period);
    if (!p) return null;
    const type = ev.type || '';
    if (mergedEvals(course).some((m) => m.kind === kind)) return null; // 같은 날 출석수업 일정에 합침
    const exam = isExamType(type);
    const label = kind === 'mid' ? '중간평가' : exam ? '기말시험' : '기말평가';
    const color = kind === 'mid' ? '5' : '11';
    const descBase = [`과목: ${course.name}`, `${kind === 'mid' ? '중간' : '기말'}평가 유형: ${type || '-'}`, '', LINK].join('\n');
    const events = [];

    if (exam) {
      if (p.range && p.startDate === p.endDate) {
        events.push({ summary: `[${label}] ${course.name}`, description: descBase, ...timedEvent(p.startDate, p.startTime, p.endDate, p.endTime), colorId: color, reminders: reminders(KS.parseReminders(settings.classReminders)) });
      } else if (!p.range && p.hadTime) {
        const e = shiftMinutes(p.startDate, p.endTime, 60);
        events.push({ summary: `[${label}] ${course.name}`, description: descBase, ...timedEvent(p.startDate, p.endTime, e.date, e.time), colorId: color, reminders: reminders(KS.parseReminders(settings.classReminders)) });
      } else {
        events.push({ summary: `[${label}] ${course.name} 응시기간`, description: descBase, ...allDayEvent(p.startDate, p.endDate), colorId: color, transparency: 'transparent', reminders: reminders([]) });
      }
    } else {
      // 하루짜리 기간은 마감 일정만으로 충분하다
      const wantPeriod = settings.showPeriod && p.range && p.startDate !== p.endDate;
      const wantDeadline = settings.showDeadline || !wantPeriod; // 최소 하나는 만든다
      if (wantPeriod) {
        events.push({
          summary: `[${label}] ${course.name} 제출기간`,
          description: `${descBase}\n시작: ${p.startDate} ${p.startTime}\n마감: ${p.endDate} ${p.endTime}`,
          ...allDayEvent(p.startDate, p.endDate),
          colorId: color,
          transparency: 'transparent',
          reminders: reminders([]),
        });
      }
      if (wantDeadline) {
        const s = shiftMinutes(p.endDate, p.endTime, -30);
        events.push({
          summary: `[마감] ${course.name} ${label}`,
          description: `${descBase}\n마감: ${p.endDate} ${p.endTime}`,
          ...timedEvent(s.date, s.time, p.endDate, p.endTime),
          colorId: '11',
          reminders: reminders(KS.parseReminders(settings.deadlineReminders)),
        });
      }
    }
    if (!events.length) return null;
    const when = p.range && p.startDate !== p.endDate ? `${md(p.startDate)}~${md(p.endDate)}` : `${md(p.endDate)} ${p.endTime}`;
    return { kind, label: `${course.name} · ${label}${type ? ` (${type})` : ''}`, when, events };
  }

  function buildFormativeGroup(formative, settings) {
    if (!settings.showFormative || !formative) return null;
    const s = parseYmd(formative.start), e = parseYmd(formative.end);
    if (!s || !e) return null;
    const events = [];
    if (settings.showPeriod) {
      events.push({ summary: '[형성평가] 학습 기간', description: `형성평가(학습영상·연습문제) 학습 기간\n${LINK}`, ...allDayEvent(s, e), colorId: '2', transparency: 'transparent', reminders: reminders([]) });
    }
    if (settings.showDeadline || !events.length) {
      events.push({ summary: '[마감] 형성평가 학습', description: `형성평가 학습 기간 종료일\n${LINK}`, ...timedEvent(e, '23:29', e, '23:59'), colorId: '11', reminders: reminders(KS.parseReminders(settings.deadlineReminders)) });
    }
    return { kind: 'formative', label: '형성평가 학습 기간', when: `${md(s)}~${md(e)}`, events };
  }

  // ---------- 팝업용 할 일 목록 ----------
  // 각 항목: { course, kind, label, detail, start?, end, place?, link, due }
  //  end = 이 시각이 지나면 목록에서 사라짐, due = 마감형(언제까지) 여부
  const shortLoc = (loc) => String(loc || '').replace(PREFIX, '').trim();
  function buildAgenda(knou, settings) {
    const items = [];
    for (const c of knou.courses || []) {
      const a = c.attendance || {};
      const merged = mergedEvals(c);
      const valid = (a.sessions || []).filter((s) => parseYmd(s.date) && parseHours(s.hours));
      for (const [i, s] of valid.entries()) {
        const date = parseYmd(s.date), hrs = parseHours(s.hours);
        const place = resolvePlace(s.placeRaw, s.campus, settings.placeOverrides);
        const room = s.room ? s.room + (/^\d+$/.test(s.room) ? '호' : '') : '';
        items.push({
          course: c.name, kind: 'class', label: '출석수업',
          detail: [a.type && a.type !== '대면수업' ? a.type : '', ...merged.filter((m) => m.session === i).map((m) => shortEval(m.type))].filter(Boolean).join(' · '),
          start: kst(date, hrs[0]), end: kst(date, hrs[1]),
          place: [shortLoc(place.location) || s.placeRaw, room].filter(Boolean).join(' '),
          link: 'attendance', due: false,
        });
      }
      for (const kind of ['mid', 'final']) {
        const ev = c[kind];
        const p = ev && parsePeriod(ev.period);
        if (!p) continue;
        const type = ev.type || '';
        if (merged.some((m) => m.kind === kind)) continue; // 출석수업 줄에 합침
        const exam = isExamType(type);
        const label = kind === 'mid' ? '중간평가' : exam ? '기말시험' : '기말평가';
        const link = exam ? 'myknou' : /맞춤형/.test(type) ? 'classAssignment' : 'assignment';
        if (exam) {
          const sameDay = p.range && p.startDate === p.endDate;
          items.push({
            course: c.name, kind, label, detail: type,
            start: sameDay ? kst(p.startDate, p.startTime) : p.range ? kst(p.startDate, p.startTime) : null,
            end: kst(p.endDate, p.endTime), link, due: !sameDay,
          });
        } else {
          items.push({
            course: c.name, kind, label, detail: type,
            start: p.range && p.startDate !== p.endDate ? kst(p.startDate, p.startTime) : null,
            end: kst(p.endDate, p.endTime), link, due: true,
          });
        }
      }
    }
    if (settings.showFormative && knou.formative) {
      const s = parseYmd(knou.formative.start), e = parseYmd(knou.formative.end);
      if (s && e) items.push({ course: '형성평가', kind: 'formative', label: '형성평가', detail: '학습영상·연습문제', start: kst(s, '00:00'), end: kst(e, '23:59'), link: 'ucampus', due: true });
    }
    return items.sort((x, y) => (x.end < y.end ? -1 : x.end > y.end ? 1 : 0));
  }

  // ---------- 과제 메모 → 설명란 ----------
  // 사용자 결정 (1.6.0):
  //  - 평가 내용: 그 평가의 **제출기간** 일정에만 (마감 일정에는 넣지 않음). 시험형은 시험 일정.
  //    제출기간 일정이 없을 때(설정에서 끔, 하루짜리 기간)만 내용이 사라지지 않게 마감 일정에 넣는다.
  //  - 과목 메모: 그 과목의 모든 일정 (출석수업 포함)
  //  설명란 맨 위에 머리줄 + 내용, 그 아래 원래 설명. 설명란 한도(약 8,192자)를 넘으면 메모를 자른다
  const DESC_LIMIT = 8000;
  const CUT = '\n… (전체는 위젯·편집기에서)';
  function roleOf(ev, kind) {
    if (kind === 'class') return 'class';
    if (/ 제출기간$/.test(ev.summary)) return 'period';
    if (/^\[마감\]/.test(ev.summary)) return 'deadline';
    return 'exam';
  }
  function withNotes(ev, parts) {
    const add = parts.filter(Boolean).join('\n\n');
    if (!add) return;
    const base = ev.description || '';
    const room = DESC_LIMIT - base.length - 4;
    const head = add.length > room ? add.slice(0, Math.max(0, room - CUT.length)).replace(/\s+$/, '') + CUT : add;
    ev.description = head + '\n\n────────\n' + base;
  }
  function applyNotes(g, course, notes) {
    const n = notes?.[course];
    if (!n) return;
    const memo = String(n.memo || '').trim();
    const memoPart = memo ? `📌 과목 메모\n${memo}` : '';
    if (g.kind === 'class') {
      // 합친 평가(1.6.6)의 평가 메모는 그 회차의 출석수업 일정에
      g.events.forEach((ev, i) => {
        const evalParts = (g.merged || []).filter((m) => m.session === i).map((m) => {
          const body = String(n[m.kind] || '').trim();
          return body ? `📝 ${m.kind === 'mid' ? '중간평가' : '기말평가'}\n${body}` : '';
        });
        withNotes(ev, [...evalParts, memoPart]);
      });
      return;
    }
    if (g.kind !== 'mid' && g.kind !== 'final') return;
    const body = String(n[g.kind] || '').trim();
    const evalPart = body ? `📝 ${g.kind === 'mid' ? '중간평가' : '기말평가'}\n${body}` : '';
    const roles = g.events.map((ev) => roleOf(ev, g.kind));
    const hasPeriod = roles.includes('period');
    g.events.forEach((ev, i) => {
      const r = roles[i];
      const getsEval = r === 'period' || r === 'exam' || (r === 'deadline' && !hasPeriod);
      withNotes(ev, [getsEval ? evalPart : '', memoPart]);
    });
  }

  // knou: KS.knou가 만든 결과, settings: 사용자 설정, notes: 과제 메모 { 과목명: { mid, final, memo } } (없으면 null)
  function build(knou, settings, notes) {
    const groups = [];
    const places = new Map();
    const semesters = new Set();
    if (knou.semester?.year && knou.semester?.term) semesters.add(`${knou.semester.year}-${knou.semester.term}`);

    for (const c of knou.courses || []) {
      const sem = `${c.year || knou.semester?.year || '0000'}-${c.term || knou.semester?.term || '0'}`;
      semesters.add(sem);
      const parts = [
        buildClassGroup(c, settings, places, mergedEvals(c)),
        buildEvalGroup(c, 'mid', c.mid, settings),
        buildEvalGroup(c, 'final', c.final, settings),
      ];
      for (const g of parts) if (g) groups.push({ ...g, key: `${sem}|${c.name}|${g.kind}`, semester: sem, course: c.name });
    }

    const firstSem = [...semesters][0];
    const fg = firstSem ? buildFormativeGroup(knou.formative, settings) : null;
    if (fg) groups.push({ ...fg, key: `${firstSem}|_|formative`, semester: firstSem });

    for (const g of groups) {
      for (const ev of g.events) if (ev.location === undefined) delete ev.location;
      // base: 메모를 넣기 전 모양. 메모만 바뀌면 base가 같으므로 일정을 다시 만들지 않고 설명란만 고친다
      g.base = cyrb53(stable(g.events));
      if (g.course) applyNotes(g, g.course, notes);
      g.hash = cyrb53(stable(g.events));
      for (const ev of g.events) {
        ev.extendedProperties = { private: { ks_v: SCHEMA, ks_group: g.key, ks_hash: g.hash, ks_base: g.base } };
      }
    }
    return {
      groups,
      semesters: [...semesters],
      courseCount: (knou.courses || []).length,
      places: [...places.values()],
      agenda: buildAgenda(knou, settings),
    };
  }

  // existing: 캘린더에 있는 Knou calendar 일정 목록
  function diff(built, existing) {
    const byGroup = new Map();
    for (const ev of existing) {
      const p = ev.extendedProperties?.private;
      if (!p?.ks_group) continue;
      if (!byGroup.has(p.ks_group)) byGroup.set(p.ks_group, []);
      byGroup.get(p.ks_group).push(ev);
    }
    const inserts = [], deletes = [], patches = [], items = [];
    const counts = { add: 0, replace: 0, update: 0, delete: 0, same: 0 };
    // 1.5.0 이전 일정에는 ks_base가 없다. 그때는 메모가 없던 시절이라 ks_hash가 곧 base다
    const baseOf = (e) => e.extendedProperties.private.ks_base || e.extendedProperties.private.ks_hash;
    const startOf = (e) => (e.start?.dateTime ? Date.parse(e.start.dateTime) : Date.parse(e.start?.date || 0)) + '|' + (e.summary || '');
    const byStart = (a, b) => (startOf(a) < startOf(b) ? -1 : startOf(a) > startOf(b) ? 1 : 0);
    const wanted = new Set();

    for (const g of built.groups) {
      wanted.add(g.key);
      const ex = byGroup.get(g.key);
      if (!ex) {
        counts.add++;
        inserts.push(...g.events);
        items.push({ op: 'add', label: g.label, when: g.when });
      } else if (ex.length === g.events.length && ex.every((e) => e.extendedProperties.private.ks_hash === g.hash)) {
        counts.same++;
      } else if (ex.length === g.events.length && ex.every((e) => baseOf(e) === g.base)) {
        // 일정 모양은 그대로, 과제 메모(설명란)만 바뀜 → 설명란만 고친다 (알림·일정 ID 유지)
        counts.update++;
        const olds = [...ex].sort(byStart), news = [...g.events].sort(byStart);
        olds.forEach((o, i) => patches.push({ id: o.id, body: { description: news[i].description, extendedProperties: news[i].extendedProperties } }));
        items.push({ op: 'update', label: g.label, when: g.when });
      } else {
        counts.replace++;
        inserts.push(...g.events);
        deletes.push(...ex.map((e) => e.id));
        items.push({ op: 'replace', label: g.label, when: g.when });
      }
    }

    const sems = new Set(built.semesters);
    for (const [key, ex] of byGroup) {
      if (wanted.has(key)) continue;
      if (!sems.has(key.split('|')[0])) continue; // 지난 학기 기록은 건드리지 않음
      counts.delete++;
      deletes.push(...ex.map((e) => e.id));
      const f = ex[0];
      const st = f.start?.dateTime || f.start?.date || '';
      items.push({ op: 'delete', label: f.summary || key, when: st ? md(st.slice(0, 10)) + (f.start?.dateTime ? ' ' + st.slice(11, 16) : '') : '' });
    }

    return { inserts, deletes, patches, items, counts, total: counts.add + counts.replace + counts.update + counts.delete };
  }

  KS.schedule = { parsePeriod, parseYmd, parseHours, autoPlace, resolvePlace, build, buildAgenda, diff };
})();
