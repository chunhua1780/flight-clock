/* RMATE 非正常处置检查单（教员的流程）：R 识别 · M 保持控制 · A 分析 · T 处置 · E 评估 → 执行 → 正常程序 → 落地。
   每一项点一下打勾（记下 UTC 时间），不适用的点「跳过」；T 做完自动进入 E。进度存在这台 iPad 上，刷新不丢。 */
(function () {
  'use strict';
  const T = (zh, en) => typeof tt === 'function' ? tt(zh, en) : zh;
  const KEY = 'fa.nnc';
  let st = load();
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || fresh(); } catch (e) { return fresh(); } }
  function fresh() { return { t0: null, done: {}, skip: {}, ti: null, opt: null, apt: null }; }
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
      { id: 'c0', kind: 'head', zh: '★ CAN WE?（对选定的机场）', en: '★ CAN WE? (for the chosen airport)' },
      { id: 'c1', zh: '— Make it？油够不够飞到（fuel）', en: '— Make it? (fuel)' },
      { id: 'c2', zh: '— App？天气能不能进近（Wx）', en: '— Approach? (Wx)' },
      { id: 'c3', zh: '— Stop？跑道停得住吗（OPT）', en: '— Stop? (OPT)' },
      { id: 'c4', zh: '— G/A？复飞能力够吗', en: '— Go-around?' },
      { id: 'c5', zh: '— Plan B？不行的话下一个去哪', en: '— Plan B?' },
      { id: 'w1', zh: 'Wx · Wt → OPT：用实际天气和重量算性能', en: 'Wx · Wt → OPT: performance with actual weather and weight' },
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
  const isDone = it => it.kind === 'head' || st.done[it.id] || st.skip[it.id] || (it.kind === 'ti' && st.ti) || (it.kind === 'opt' && st.opt) || (it.kind === 'apt' && st.apt);
  const nextItem = () => allItems().find(it => !isDone(it));
  const groupDone = g => FLOW.find(x => x.g === g).items.filter(visible).every(isDone);

  // ---------- 机场选项（用 Flight Assist 自己的备降场计算） ----------
  function airports() {
    try {
      if (typeof S === 'undefined' || !S.ofp || !S.cur || !S.cur.pos) return null;
      const t0 = S.tview || now(), p = S.cur, gs = p.gs > 250 ? p.gs : 450;
      const arr = candidates().map(c => { const d = distNm(p.pos, c.pos); return { c, d, mins: d / gs * 60 + (d > 40 ? 12 : 0) }; });
      const usable = x => x.c.ek ? (catAt(x.c.ek, t0 + x.mins * MIN) || '-') !== '-' : x.c.ofp;
      const near = arr.filter(usable).sort((a, b) => a.d - b.d).slice(0, 4);
      const dest = arr.find(x => (x.c.roles || []).includes('dest'));
      return { t0, near, dest };
    } catch (e) { return null; }
  }
  function aptRow(x, t0, pickable) {
    const eta = t0 + x.mins * MIN, a = assess(x.c, eta), cat = x.c.ek ? catAt(x.c.ek, eta) : null;
    const dot = { green: '#3fcf7f', amber: '#f3b13c', red: '#ff5d55' }[a.rate] || '#8d9ab3', on = st.apt === x.c.icao;
    return '<div class="nx-apt' + (on ? ' on' : '') + '"' + (pickable ? ' onclick="RMATE.apt(\'' + x.c.icao + '\')"' : '') + '><span class="nx-dot" style="background:' + dot + '"></span><b>' + x.c.icao + '</b> ' + esc(x.c.iata || '') + (cat ? ' <span class="nx-cat">' + cat + '</span>' : '') +
      '<span class="nx-d">' + Math.round(x.d) + ' nm · ' + Math.round(x.mins) + ' min</span>' + (on ? ' ✓' : '') + '<div class="nx-w">' + wxHtml(a, eta) + '</div></div>';
  }

  // ---------- 画面 ----------
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
        if (it.kind === 'apt') {
          h += '<div class="nx-i big' + (cur ? ' cur' : '') + (st.apt ? ' ok' : '') + '"><div class="nx-t">' + T(it.zh, it.en) + '</div>' +
            (A ? (A.near.length ? A.near.map(x => aptRow(x, A.t0, true)).join('') : '<div class="ldim">' + T('附近没有可用机场', 'No usable airport nearby') + '</div>') : '<div class="ldim">' + T('先载入 OFP 才能列出机场', 'Load an OFP to list airports') + '</div>') +
            (st.opt === 'imm' ? '<div class="ldim" style="margin-top:4px">' + T('Immediacy：选最近能安全落地的那个。', 'Immediacy: the nearest one you can land at safely.') + '</div>' : '') + '</div>'; return; }
        h += '<div class="nx-i' + (cur ? ' cur' : '') + (d ? ' ok' : '') + (sk ? ' sk' : '') + '" onclick="RMATE.tick(\'' + it.id + '\')"><span class="nx-box">' + (d ? '✓' : sk ? '–' : '') + '</span><div class="nx-t">' + T(it.zh, it.en) +
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
    opt(v) { start(); st.opt = v; if (v === 'cont') st.apt = null; st.done.e2 = st.done.e2 || Date.now(); save(); render(); },
    apt(icao) { start(); st.apt = icao; st.done.e3 = Date.now(); save(); render(); }
  };
})();
