/* RMATE 非正常处置检查单（教员的流程）：R 识别 · M 保持控制 · A 分析 · T 处置 · E 评估 → 执行 → 正常程序 → 落地。
   每一项点一下打勾（记下 UTC 时间），不适用的点「跳过」；T 做完自动进入 E。进度存在这台 iPad 上，刷新不丢。 */
(function () {
  'use strict';
  const T = (zh, en) => typeof tt === 'function' ? tt(zh, en) : zh;
  const KEY = 'fa.nnc';
  let st = load(); if (!st.can) st.can = { A: {}, B: {} };
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || fresh(); } catch (e) { return fresh(); } }
  function fresh() { return { t0: null, done: {}, skip: {}, ti: null, opt: null, apt: null, planB: null, can: { A: {}, B: {} } }; }
  const ROWS = [['fuel', 'Make it？油够吗', 'Make it? (fuel)'], ['wx', 'Wx 天气', 'Wx'], ['wt', 'Wt 重量', 'Wt (weight)'], ['opt', '→ OPT 性能', '→ OPT'], ['app', 'App？能进近吗', 'Approach?'], ['stop', 'Stop？停得住吗', 'Stop?'], ['ga', 'G/A？复飞行吗', 'Go-around?']];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  const z2 = n => String(n).padStart(2, '0'), hm = t => t ? z2(new Date(t).getUTCHours()) + ':' + z2(new Date(t).getUTCMinutes()) + 'Z' : '';

  // ---------- 流程（按教员那张纸） ----------
  // g = 段落，id = 项目；when = 只在某个选择下出现
  const FLOW = [
    { g: 'R', zh: '识别', en: 'Recognise', items: [
      { id: 'r1', zh: '「EICAS」——喊出 EICAS 信息', en: '“EICAS” — call out the EICAS message', note: ['先别急着动手：看清、读出、双方确认是什么告警。', 'Don’t rush: read it, call it, both crew confirm.'] }] },
    { g: 'M', zh: '保持控制', en: 'Maintain control', items: [
      { id: 'm1', zh: 'A — Aviate 飞好飞机', en: 'A — Aviate', note: ['PF 只管飞：姿态、推力、航迹。需要的话接通自动驾驶。', 'PF flies: attitude, thrust, path. Use the autopilot if available.'] },
      { id: 'm2', zh: 'N — Navigate 导航', en: 'N — Navigate', note: ['确认在安全的航迹和高度上，离地形和其他飞机够远。', 'Safe track and altitude, clear of terrain and traffic.'] },
      { id: 'm3', zh: 'C — Communicate 通讯', en: 'C — Communicate', note: ['需要时告诉 ATC（PAN / MAYDAY），先保证不撞不掉。', 'Tell ATC when needed (PAN / MAYDAY).'] }] },
    { g: 'A', zh: '分析', en: 'Analyse', items: [
      { id: 'a1', zh: '「What’s the problem?」——到底是什么问题', en: '“What’s the problem?”' },
      { id: 'a2', zh: 'PM：1. 读 EICAS', en: 'PM: 1. Read the EICAS' },
      { id: 'a3', zh: 'PM：2. 提出建议（suggest）', en: 'PM: 2. Suggest' }] },
    { g: 'T', zh: '处置', en: 'Take action', items: [
      { id: 't1', kind: 'ti', zh: '记忆项目（M.I）还是 NNC？', en: 'Memory items (M.I) or NNC?' },
      { id: 't2', zh: '做完 → Review EICAS 复查 EICAS', en: 'Done → Review EICAS' },
      { id: 't3', zh: 'Cancel EICAS 取消 / 清除 EICAS', en: 'Cancel EICAS' }] },
    { g: 'E', zh: '评估', en: 'Evaluate', key: true, items: [
      { id: 'e1', zh: '「You have control」——把操纵交给 F/O', en: '“You have control” — hand control to the F/O', note: ['机长腾出手和脑子来评估和决策，F/O 负责飞和跟 ATC 通话。', 'Captain steps back to evaluate and decide; F/O flies and talks to ATC.'] },
      { id: 'e2', kind: 'opt', zh: '三个问题，选一个方向', en: 'Three questions — choose one direction' },
      { id: 'e3', kind: 'apt', zh: 'LANSA：至少比较 2 个机场，选一个', en: 'LANSA: compare at least 2 airports, pick one', when: s => s.opt === 'lansa' || s.opt === 'imm' },
      { id: 'can', kind: 'can', zh: '★ CAN WE?——两个机场一起比（左：选定的；右：Plan B）', en: '★ CAN WE? — compare two airports (left: chosen, right: Plan B)' },
      { id: 'k0', kind: 'head', zh: '商量 → 决定', en: 'Consult → decide' },
      { id: 'k1', zh: '1. F/O——听听副驾驶的意见', en: '1. F/O — ask for input' },
      { id: 'k2', zh: '2. VPNC——联系公司运控', en: '2. VPNC — company ops' },
      { id: 'k3', zh: '3. ATC——告诉管制意图，要许可', en: '3. ATC — intentions and clearance' },
      { id: 'x1', zh: 'ALTN 页面（FMC）→ 选备降场 → EXECUTE', en: 'ALTN page (FMC) → select → EXECUTE', when: s => s.opt !== 'cont' },
      { id: 'p0', kind: 'head', zh: '通知', en: 'Inform' },
      { id: 'p1', zh: 'P — Purser 到驾驶舱（F/D）简令', en: 'P — Purser to the flight deck', note: ['NITS：性质、意图、剩余时间、特别指示。', 'NITS: Nature, Intentions, Time, Special instructions.'] },
      { id: 'p2', zh: 'PA — 广播告诉旅客', en: 'PA — passengers' },
      { id: 'p3', zh: 'C — Company：备降报告（DIV report）', en: 'C — Company: diversion report', when: s => s.opt !== 'cont' }] },
    { g: 'N', zh: '正常程序', en: 'Normal', items: [
      { id: 'n1', zh: '1. FMC——爬升 / 巡航程序（按需要）', en: '1. FMC — climb / cruise procedure (as needed)' },
      { id: 'n2', zh: '2. 下降程序：recall / notes（NNC 的注意事项）', en: '2. Descent procedure: recall / notes' },
      { id: 'n3', zh: '　— OPT 着陆性能', en: '   — OPT landing performance' },
      { id: 'n4', zh: '　— Vref', en: '   — Vref' },
      { id: 'n5', zh: '　— Mins 最低标准', en: '   — Minimums' },
      { id: 'n6', zh: '　— NAV RAD 导航台', en: '   — NAV RAD' },
      { id: 'n7', zh: '　— A/B 自动刹车', en: '   — Autobrake' },
      { id: 'n8', zh: '「I have control」——机长接回操纵', en: '“I have control” — Captain takes control back' },
      { id: 'n9', zh: 'Brief——CTWOF', en: 'Brief — CTWOF' },
      { id: 'n10', zh: 'Land 落地 ✈', en: 'Land ✈' }] }
  ];
  const OPTS = [
    { v: 'imm', zh: '1. Immediacy？要不要马上落地', en: '1. Immediacy? Land immediately', sub: ['火 / 烟 / 无法控制 / 人员急救……→ 最近能落的机场', 'Fire / smoke / control / medical → nearest airport'] },
    { v: 'lansa', zh: '2. LANSA？最近的合适机场落地', en: '2. LANSA — land at nearest suitable airport', sub: ['至少比较 2 个选择（≥ 2 options）', 'Compare at least 2 options'] },
    { v: 'cont', zh: '3. 能安全继续飞目的地吗？', en: '3. Can we continue to our destination safely?', sub: ['开放式问题：NNC 允许、油够、天气和性能都没问题', 'Open question: NNC allows, fuel, weather and performance OK'] }
  ];
  const visible = it => !it.when || it.when(st);
  const allItems = () => FLOW.flatMap(g => g.items.filter(visible).map(it => Object.assign({ g: g.g }, it)));
  const canDone = () => !!st.planB && ROWS.every(r => st.can.A[r[0]] && st.can.B[r[0]]);
  const isDone = it => it.kind === 'head' || (it.kind === 'can' && canDone()) || st.done[it.id] || st.skip[it.id] || (it.kind === 'ti' && st.ti) || (it.kind === 'opt' && st.opt) || (it.kind === 'apt' && st.apt);
  const nextItem = () => allItems().find(it => !isDone(it));
  const groupDone = g => FLOW.find(x => x.g === g).items.filter(visible).every(isDone);

  // ---------- 机场选项（用 Flight Assist 自己的备降场计算） ----------
  function airports() {
    try {
      if (typeof S === 'undefined' || !S.ofp || !S.cur || !S.cur.pos) return null;
      const t0 = S.tview || now(), p = S.cur, gs = p.gs > 250 ? p.gs : 450;
      const arr = candidates().map(c => { const d = distNm(p.pos, c.pos); return { c, d, mins: d / gs * 60 + (d > 40 ? 12 : 0) }; });
      const usable = x => x.c.ek ? (catAt(x.c.ek, t0 + x.mins * MIN) || '-') !== '-' : x.c.ofp;
      const all = arr.filter(x => usable(x) || (x.c.roles || []).some(r => r === 'dest' || r === 'destAltn')).sort((a, b) => a.d - b.d);
      const near = all.filter(usable).slice(0, 4);
      const dest = arr.find(x => (x.c.roles || []).includes('dest'));
      return { t0, near, dest, all, by: i => arr.find(x => x.c.icao === i) };
    } catch (e) { return null; }
  }
  function aptRow(x, t0, pickable) {
    const eta = t0 + x.mins * MIN, a = assess(x.c, eta), cat = x.c.ek ? catAt(x.c.ek, eta) : null;
    const dot = { green: '#3fcf7f', amber: '#f3b13c', red: '#ff5d55' }[a.rate] || '#8d9ab3', on = st.apt === x.c.icao;
    return '<div class="nx-apt' + (on ? ' on' : '') + '"' + (pickable ? ' onclick="RMATE.apt(\'' + x.c.icao + '\')"' : '') + '><span class="nx-dot" style="background:' + dot + '"></span><b>' + x.c.icao + '</b> ' + esc(x.c.iata || '') + (cat ? ' <span class="nx-cat">' + cat + '</span>' : '') +
      '<span class="nx-d">' + Math.round(x.d) + ' nm · ' + Math.round(x.mins) + ' min</span>' + (on ? ' ✓' : '') + '<div class="nx-w">' + wxHtml(a, eta) + '</div></div>';
  }

  // ---------- 画面 ----------
  // ---------- 照着读的话术（英式、简洁；自动填航班、机场、时间；[ ] 是要你口头补的） ----------
  const PROB = {
    efire: { b: 'ENG FIRE', atc: 'engine fire', ops: 'an engine fire', crew: 'an engine fire', pa: 'a technical problem with one of our engines', sev: 'mayday', sp: 'Be ready for an evacuation on my command; if needed you will hear “Evacuate, evacuate, evacuate”.' },
    efail: { b: 'ENG FAIL', atc: 'engine failure', ops: 'an engine failure', crew: 'an engine failure', pa: 'a technical problem with one of our engines', sev: 'pan', sp: 'We expect a normal landing; no evacuation is expected.' },
    smoke: { b: 'SMOKE', atc: 'smoke on board', ops: 'smoke on board', crew: 'smoke on board', pa: 'a technical issue on board', sev: 'mayday', sp: 'Keep an eye on the cabin and tell me straight away if you see or smell smoke. Be ready for an evacuation on my command.' },
    depr: { b: 'DEPRESS', atc: 'rapid depressurisation, emergency descent', ops: 'a rapid depressurisation', crew: 'a loss of cabin pressure', pa: 'a problem with the cabin pressure', sev: 'mayday', sp: 'Check the cabin and crew once we are level at a safe altitude, and report any injuries.' },
    med: { b: 'MEDICAL', atc: 'medical emergency on board', ops: 'a medical emergency', crew: 'a medical emergency', pa: 'a passenger who needs urgent medical attention', sev: 'pan', sp: 'Please arrange for the person to be met by medical staff on arrival.' },
    hyd: { b: 'HYD', atc: 'hydraulic failure', ops: 'a hydraulic failure', crew: 'a hydraulic problem', pa: 'a technical problem', sev: 'pan', sp: 'We may need a longer landing roll and may stop on the runway; no evacuation is expected.' }
  };
  const ph = t => '<span class="ph">[' + t + ']</span>';
  function ctx() {
    const o = typeof S !== 'undefined' && S.ofp, f = o && o.flight, A = airports();
    const apt = st.opt === 'cont' ? (A && A.dest) : (A && st.apt ? A.by(st.apt) : null), pb = A && st.planB ? A.by(st.planB) : null;
    const name = (() => { try { return (JSON.parse(localStorage.getItem('fa.lbset') || '{}').name) || 'Jack Cao'; } catch (e) { return 'Jack Cao'; } })();
    const P = PROB[st.ptype] || { b: '', atc: st.ptext || ph('problem'), ops: st.ptext || ph('the problem'), crew: st.ptext || ph('the problem'), pa: 'a technical issue', sev: 'pan', sp: ph('special instructions') };
    let unit = ph('ATC unit');
    try { const L = firFor(elAt(now())); if (L && L.name) unit = L.name.replace(/\s*·.*$/, '').replace(/\s+(FIR|UIR|ACC)$/i, '').replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w/g, c => c.toLowerCase()) + ' Control'; } catch (e) {}
    const pos = (() => { try { const n = S.cur && S.cur.next; return n ? 'approaching ' + n.id : 'on our planned route'; } catch (e) { return 'on our planned route'; } })();
    const cityOf = x => x ? ((x.c.db && x.c.db[2]) || x.c.name || x.c.icao).replace(/\s*\(.*\)\s*/, ' ').trim() : ph('airport');
    const mins = apt ? Math.round(apt.mins) : null;
    return { f, A, apt, pb, P, name, unit, pos, cityOf, mins, eta: apt ? hm(A.t0 + apt.mins * MIN).replace(/[:Z]/g, '') : ph('ETA'), freighter: f && /F\b|77F|F$/.test(f.type || '') };
  }
  const SAY = {
    k1: c => { const plan = st.opt === 'cont' ? 'to continue to ' + (c.f ? c.f.arr : ph('destination')) + ' as planned' : 'to divert to ' + (c.apt ? c.apt.c.icao : ph('airport')) + (c.mins ? ', about ' + c.mins + ' minutes away' : '');
      return 'Quick summary: we’ve got ' + c.P.crew + ', the checklist is complete and we’re stable. My plan is ' + plan + (c.pb ? ', with ' + c.pb.c.icao + ' as Plan B' : '') + '. How do you see it? Anything I’ve missed, or any concerns?'; },
    k2: c => { const f = c.f, no = f ? f.no : ph('flight'), plan = st.opt === 'cont' ? 'to continue to ' + (f ? f.arr : ph('destination')) : 'to divert to ' + (c.apt ? c.apt.c.icao + ', estimating ' + c.eta + ' Zulu' : ph('airport'));
      return 'VPNC, this is Captain ' + c.name + ', Emirates ' + no.replace(/^EK/, '') + (f ? ', ' + f.reg + ', ' + f.dep + ' to ' + f.arr : '') + '. We have ' + c.P.ops + '. The non-normal checklist is complete and the aircraft is stable, ' + c.pos + '. Our plan is ' + plan + (c.pb ? ', with ' + c.pb.c.icao + ' as Plan B' : '') + '. Fuel on board ' + ph('FOB') + ' tonnes. Request your agreement and any company instructions' + (st.opt !== 'cont' && c.apt ? ', and please arrange handling at ' + c.apt.c.icao : '') + '.'; },
    k3: c => { const cs = 'Emirates ' + (c.f ? c.f.digits : ph('flight')), icao = c.apt ? c.apt.c.icao : ph('airport');
      if (st.opt === 'cont') return c.unit + ', ' + cs + ', for information, we have ' + c.P.atc + '. Checklist complete, aircraft stable. We intend to continue to ' + (c.f ? c.f.arr : ph('destination')) + '. Request no delay.';
      const head = c.P.sev === 'mayday' ? 'MAYDAY, MAYDAY, MAYDAY' : 'PAN PAN, PAN PAN, PAN PAN';
      return head + ', ' + c.unit + ', ' + cs + ', ' + c.P.atc + ', request ' + (c.P.sev === 'mayday' ? 'immediate ' : '') + 'diversion to ' + icao + ', request direct routing and descent, ' + ph('POB') + ' persons on board, fuel endurance ' + ph('hours') + '.\n\nThen: ' + cs + ', request radar vectors for the ILS at ' + icao + ', and emergency services on arrival.'; },
    p1: c => { const city = st.opt === 'cont' ? (c.f ? c.f.arr : ph('destination')) : c.cityOf(c.apt), m = c.mins;
      return 'N — Nature: we’ve had ' + c.P.crew + '. It’s been dealt with and the aircraft is under control.\nI — Intentions: we’re ' + (st.opt === 'cont' ? 'continuing to ' : 'diverting to ') + city + '.\nT — Time: about ' + (m || ph('minutes')) + ' minutes to landing. ' + (m && m > 20 ? 'I need the cabin secure in ' + (m - 10) + ' minutes.' : m ? 'I need the cabin secure as soon as possible.' : 'I need the cabin secure in ' + ph('minutes') + ' minutes.') + '\nS — Special: ' + c.P.sp + ' I’ll make a PA shortly.\nPlease repeat that back to me.'; },
    p2: c => { const city = st.opt === 'cont' ? (c.f ? c.f.arr : ph('destination')) : c.cityOf(c.apt);
      return 'Ladies and gentlemen, this is the Captain speaking. We have ' + c.P.pa + '. It has been dealt with, and the aircraft is under control. ' + (st.opt === 'cont' ? 'We will continue to ' + city + ' as planned.' : 'As a precaution, we are diverting to ' + city + ', and we expect to land in about ' + (c.mins || ph('minutes')) + ' minutes.') + ' The cabin crew will now prepare the cabin. Please stay in your seat with your seatbelt fastened, and follow their instructions. Thank you.'; },
    p3: c => { const f = c.f; return 'EK' + (f ? f.digits + ' ' + f.reg : ph('flight reg')) + ' DIVERTING ' + (c.apt ? c.apt.c.icao : ph('ICAO')) + ' DUE ' + (c.P.b || (st.ptext || 'TECH PROBLEM').toUpperCase()) + '. ETA ' + c.eta + 'Z. FOB ' + ph('t') + '. POB ' + ph('n') + '. REQ HANDLING' + (c.P.b === 'MEDICAL' ? ' AND MEDICAL ASSISTANCE' : '') + '. CAPT ' + c.name.toUpperCase() + '.'; }
  };
  const SAYH = { k1: ['问 F/O 的意见（照着说）', 'Ask the F/O'], k2: ['打给 VPNC（卫星电话 / 无线电）', 'Call VPNC'], k3: ['跟 ATC 说', 'Tell ATC'], p1: ['给 Purser 的 NITS 简令', 'NITS brief to the Purser'], p2: ['PA 广播', 'PA'], p3: ['DIV report（ACARS 自由电报）', 'DIV report (ACARS)'] };
  function sayBox(id) { if (!SAY[id]) return ''; const c = ctx(); let txt = esc(SAY[id](c)).replace(/&lt;span class=&quot;ph&quot;&gt;\[(.*?)\]&lt;\/span&gt;/g, '<span class="ph">[$1]</span>').replace(/\n/g, '<br>');
    const fr = c.freighter && (id === 'p1' || id === 'p2') ? '<div class="ldim">' + T('货机：没有乘务长 / 旅客时，对押运员（supernumerary）说。', 'Freighter: brief the supernumeraries instead.') + '</div>' : '';
    return '<div class="nx-say" onclick="event.stopPropagation()"><div class="nx-sh">📣 ' + T(SAYH[id][0], SAYH[id][1]) + '</div><div class="nx-st">' + txt + '</div>' + fr + '</div>'; }

  function render() {
    const box = document.getElementById('nnc-pg'); if (!box) return;
    const nx = nextItem(), A = airports();
    const head = '<div class="nx-top"><div><b>🚨 RMATE</b> <span class="ldim">' + T('非正常处置', 'Non-normal handling') + '</span></div>' +
      (st.t0 ? '<div class="nx-clock">' + T('开始', 'Start') + ' ' + hm(st.t0) + ' · ' + T('已过', 'elapsed') + ' <b id="nx-el"></b></div>' : '') + '</div>';
    let h = head;
    FLOW.forEach(g => {
      const its = g.items.filter(visible), gd = groupDone(g.g), active = nx && nx.g === g.g;
      h += '<div class="nx-g' + (gd ? ' done' : '') + (active ? ' act' : '') + (g.key ? ' key' : '') + '"><div class="nx-gh"><span class="nx-L">' + g.g + '</span><b>' + T(g.zh, g.en) + '</b>' + (gd ? ' <span class="nx-ok">✓</span>' : '') + '</div>';
      if (gd && !active && !g.key && g.g !== 'N') { h += '</div>'; return; }   // 做完的段落收起来（E 和正常程序一直展开）
      its.forEach(it => {
        const d = st.done[it.id], sk = st.skip[it.id], cur = nx && nx.id === it.id;
        if (it.kind === 'head') { h += '<div class="nx-sub">' + T(it.zh, it.en) + (it.id === 'c0' && st.apt ? ' · <b>' + st.apt + '</b>' : it.id === 'c0' && st.opt === 'cont' && A && A.dest ? ' · <b>' + A.dest.c.icao + '</b>' : '') + '</div>'; return; }
        if (it.kind === 'ti') {
          h += '<div class="nx-i' + (cur ? ' cur' : '') + (st.ti ? ' ok' : '') + '"><div class="nx-t">' + T(it.zh, it.en) + '</div><div class="nx-ch">' +
            ['MI', 'NNC'].map(v => '<span class="' + (st.ti === v ? 'on' : '') + '" onclick="RMATE.ti(\'' + v + '\')">' + (v === 'MI' ? T('记忆项目 M.I', 'Memory items') : 'NNC') + '</span>').join('') + '</div></div>'; return; }
        if (it.kind === 'opt') {
          h += '<div class="nx-i big' + (cur ? ' cur' : '') + (st.opt ? ' ok' : '') + '"><div class="nx-t">' + T(it.zh, it.en) + '</div>' + OPTS.map(o => '<div class="nx-o' + (st.opt === o.v ? ' on' : '') + '" onclick="RMATE.opt(\'' + o.v + '\')"><b>' + T(o.zh, o.en) + '</b><div class="ldim">' + T(o.sub[0], o.sub[1]) + '</div></div>').join('') +
            (st.opt === 'cont' && A && A.dest ? '<div class="nx-ctx">' + T('目的地', 'Destination') + '：' + aptRow(A.dest, A.t0, false) + '</div>' : '') + '</div>'; return; }
        if (it.kind === 'can') {
          const prim = st.opt === 'cont' ? (A && A.dest) : (A && st.apt ? A.by(st.apt) : null), pb = A && st.planB ? A.by(st.planB) : null;
          if (!prim) { h += '<div class="nx-i big"><div class="nx-t">' + T(it.zh, it.en) + '</div><div class="ldim">' + T('先在上面选一个方向和机场', 'Choose a direction and an airport above first') + '</div></div>'; return; }
          const opts = (A.all || []).filter(x => x.c.icao !== prim.c.icao).slice(0, 8);
          const info = (x, r) => { if (!x) return ''; const eta = A.t0 + x.mins * MIN, a = assess(x.c, eta);
            if (r === 'fuel') return Math.round(x.d) + ' nm · ' + Math.round(x.mins) + ' min';
            if (r === 'wx') return '<span style="color:' + ({ green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)' }[a.rate] || 'var(--dim)') + '">●</span> ' + wxHtml(a, eta);
            if (r === 'stop' && a.rw && a.rw.pick) return T('跑道 ', 'RWY ') + esc(a.rw.pick.id);
            return ''; };
          const cell = (side, x, r) => { const v = st.can[side][r]; return '<td class="nx-c ' + (v || '') + '"' + (x ? ' onclick="RMATE.cell(\'' + side + '\',\'' + r + '\')"' : '') + '><span class="nx-cv">' + (v === 'ok' ? '✓' : v === 'no' ? '✗' : '') + '</span><div class="nx-ci">' + info(x, r) + '</div></td>'; };
          const okAll = side => ROWS.every(r => st.can[side][r[0]] === 'ok'), anyNo = side => ROWS.some(r => st.can[side][r[0]] === 'no');
          h += '<div class="nx-i big' + (cur ? ' cur' : '') + (canDone() ? ' ok' : '') + '"><div class="nx-t">' + T(it.zh, it.en) + '</div>' +
            '<table class="nx-can"><tr><th></th><th>' + prim.c.icao + ' <span class="ldim">' + esc(prim.c.iata || '') + '</span>' + (okAll('A') ? ' ✅' : anyNo('A') ? ' ⚠️' : '') + '</th><th>' +
            '<select onchange="RMATE.planB(this.value)"><option value="">' + T('选 Plan B…', 'Pick Plan B…') + '</option>' + opts.map(x => '<option value="' + x.c.icao + '"' + (st.planB === x.c.icao ? ' selected' : '') + '>' + x.c.icao + ' ' + (x.c.iata || '') + ' · ' + Math.round(x.d) + ' nm</option>').join('') + '</select>' + (pb && okAll('B') ? ' ✅' : pb && anyNo('B') ? ' ⚠️' : '') + '</th></tr>' +
            ROWS.map(r => '<tr><td class="nx-rl">' + T(r[1], r[2]) + '</td>' + cell('A', prim, r[0]) + (pb ? cell('B', pb, r[0]) : '<td class="nx-c na"></td>') + '</tr>').join('') + '</table>' +
            '<div class="ldim" style="margin-top:6px">' + T('点格子：✓ 可以 → ✗ 不行 → 清空。左右两个机场每一项都要过一遍。', 'Tap a cell: ✓ OK → ✗ No → clear. Go through every row for both airports.') + '</div></div>';
          return; }
        if (it.kind === 'apt') {
          h += '<div class="nx-i big' + (cur ? ' cur' : '') + (st.apt ? ' ok' : '') + '"><div class="nx-t">' + T(it.zh, it.en) + '</div>' +
            (A ? (A.near.length ? A.near.map(x => aptRow(x, A.t0, true)).join('') : '<div class="ldim">' + T('附近没有可用机场', 'No usable airport nearby') + '</div>') : '<div class="ldim">' + T('先载入 OFP 才能列出机场', 'Load an OFP to list airports') + '</div>') +
            (st.opt === 'imm' ? '<div class="ldim" style="margin-top:4px">' + T('Immediacy：选最近能安全落地的那个。', 'Immediacy: the nearest one you can land at safely.') + '</div>' : '') + '</div>'; return; }
        const extra = it.id === 'a1' ? '<div class="nx-pb" onclick="event.stopPropagation()">' + Object.keys(PROB).map(k => '<span class="' + (st.ptype === k ? 'on' : '') + '" onclick="RMATE.prob(\'' + k + '\')">' + PROB[k].b + '</span>').join('') + '<input placeholder="' + T('或者自己写，例如 L PACK FAIL', 'or type it, e.g. L PACK FAIL') + '" value="' + esc(st.ptype ? '' : (st.ptext || '')) + '" onchange="RMATE.prob(null,this.value)"></div>' : '';
        h += '<div class="nx-i' + (cur ? ' cur' : '') + (d ? ' ok' : '') + (sk ? ' sk' : '') + '" onclick="RMATE.tick(\'' + it.id + '\')"><span class="nx-box">' + (d ? '✓' : sk ? '–' : '') + '</span><div class="nx-t">' + T(it.zh, it.en) + extra + (SAY[it.id] && !sk ? sayBox(it.id) : '') +
          (it.note && (cur || !d) ? '<div class="nx-n">' + T(it.note[0], it.note[1]) + '</div>' : '') + '</div>' + (d ? '<span class="nx-tm">' + hm(d) + '</span>' : '') +
          (!d && !sk ? '<span class="nx-skip" onclick="event.stopPropagation();RMATE.skip(\'' + it.id + '\')">' + T('跳过', 'Skip') + '</span>' : '') + '</div>';
      });
      h += '</div>';
    });
    if (!nx) h += '<div class="nx-end">✅ ' + T('全部完成——落地后做个讲评。', 'All done — debrief after landing.') + '</div>';
    box.innerHTML = h;
    tickEl();
    const c = box.querySelector('.nx-i.cur'); if (c && !render.noScroll) c.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function tickEl() { const e = document.getElementById('nx-el'); if (e && st.t0) { const m = Math.floor((Date.now() - st.t0) / 60000); e.textContent = Math.floor(m / 60) + ':' + z2(m % 60); } }
  setInterval(tickEl, 15000);
  const start = () => { if (!st.t0) st.t0 = Date.now(); };
  window.RMATE = {
    open() { start(); save(); render(); document.getElementById('nnc').classList.add('open'); },
    close() { document.getElementById('nnc').classList.remove('open'); },
    reset() { if (!confirm(T('清空这次的处置记录，重新开始？', 'Clear and start over?'))) return; st = fresh(); start(); save(); render(); document.getElementById('nnc-pg').scrollTop = 0; },
    tick(id) { start(); if (st.done[id]) delete st.done[id]; else { st.done[id] = Date.now(); delete st.skip[id]; } save(); render(); },
    skip(id) { start(); st.skip[id] = Date.now(); save(); render(); },
    ti(v) { start(); st.ti = v; st.done.t1 = st.done.t1 || Date.now(); save(); render(); },
    opt(v) { start(); if (st.opt !== v) { st.can = { A: {}, B: {} }; st.planB = null; } st.opt = v; if (v === 'cont') st.apt = null; st.done.e2 = st.done.e2 || Date.now(); save(); render(); },
    prob(k, txt) { start(); if (k) { st.ptype = st.ptype === k ? null : k; st.ptext = ''; } else { st.ptype = null; st.ptext = (txt || '').trim(); } save(); render.noScroll = true; render(); render.noScroll = false; },
    apt(icao) { start(); if (st.apt !== icao) { st.apt = icao; st.can.A = {}; if (st.planB === icao) { st.planB = null; st.can.B = {}; } } st.done.e3 = Date.now(); save(); render(); },
    planB(icao) { start(); st.planB = icao || null; st.can.B = {}; save(); render.noScroll = true; render(); render.noScroll = false; },
    cell(side, r) { start(); const v = st.can[side][r]; st.can[side][r] = v === 'ok' ? 'no' : v === 'no' ? undefined : 'ok'; if (!st.can[side][r]) delete st.can[side][r]; save(); render.noScroll = true; render(); render.noScroll = false; }
  };
})();
