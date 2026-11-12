/* 飞行记录本（Logbook）：从 OFP 自动建一条记录；时间优先用家里时钟按 ADS-B 判断的滑出 / 起飞 / 落地，
   没有就用 Flight Assist 里确认的起飞时间和计划时间；全部可以手改。
   两种格式：中国民航（CCAR-61 飞行经历记录本内容）/ Jeppesen（EASA / ICAO 职业驾驶员记录本）。
   夜航时间按飞机每一分钟所在位置的太阳高度计算；起飞 / 落地按当时机场的昼夜。数据只存在这台设备上（可导出备份）。 */
(function () {
  'use strict';
  const MINms = 60e3, KEY = 'fa.logbook', SKEY = 'fa.lbset';
  const z2 = n => String(n).padStart(2, '0');
  const ld = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || '') || d; } catch (e) { return d; } };
  const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let LB = ld(KEY, []), SET = Object.assign({ fmt: 'caac', role: 'CAPT', name: '', lic: '', night: 'auto', bf: {} }, ld(SKEY, {}));
  if (!SET.bf) SET.bf = {};
  const save = () => { sv(KEY, LB); cloudSoon(); }, saveSet = () => { sv(SKEY, SET); cloudSoon(); };
  // ---------- 云端（你 Google Drive 里的表格，经自己的 Apps Script）：改了就自动同步，新设备打开就下载 ----------
  let SY = ld('fa.lbsync', { h: {}, setH: '', setU: 0, at: 0, url: '' }), cloudT = 0, cloudBusy = false, cloudMsg = '';
  const hsh = x => { const t = JSON.stringify(x); let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return String(h >>> 0); };
  const strip = e => { const o = Object.assign({}, e); delete o.u; return o; };
  function cloudSoon() { clearTimeout(cloudT); cloudT = setTimeout(() => cloud(true), 4000); }
  async function cloud(quiet) {
    if (cloudBusy) return; const key = (typeof lsGet === 'function') && lsGet('key');
    if (!navigator.onLine) { cloudMsg = 'off'; chip(); if (!quiet) toast('📵 ' + T('当前无网络，回头有网会自动同步', 'Offline — will sync when online')); return; }
    if (!key) { cloudMsg = 'nokey'; chip(); if (!quiet) toast(T('这台设备还没填时钟后台口令', 'No backend password on this device')); return; }
    cloudBusy = true; cloudMsg = 'busy'; chip();
    try {
      const now = Date.now(), have = new Set(LB.map(e => e.k)), send = [];
      LB.forEach(e => { if (SY.h[e.k] !== hsh(strip(e))) { e.u = now; send.push(e); } });
      Object.keys(SY.h).forEach(k => { if (!have.has(k)) send.push({ k, del: true, u: now }); });
      // 第一次同步（新设备）：设置以云端为准，不上传本机的默认设置
      const first = !SY.at, sh = hsh(SET); if (!first && sh !== SY.setH) SY.setU = now;
      const r = await fetch(clockUrl() + '?k=' + encodeURIComponent(key), { method: 'POST', body: JSON.stringify({ action: 'lbsync', entries: send, set: first ? null : SET, setU: first ? 0 : SY.setU, table: first && !LB.length ? null : rowsOf() }) });
      const raw = await r.text(); let j; try { j = JSON.parse(raw); } catch (e) { j = { ok: false, error: raw.slice(0, 160) }; }
      if (!j.ok) { cloudMsg = /缺少航班|数据格式|lbsync/.test(j.error || '') ? 'old' : /permission|权限|authoriz|Spreadsheet/i.test(j.error || '') ? 'auth' : 'err'; chip(); if (!quiet) toast(cloudTip(), 6000); return; }
      // 服务器已经按「新的赢」合并好：以它为准
      const mine = new Map(LB.map(e => [e.k, e])); LB = [];
      const dels = []; (j.entries || []).forEach(e => { if (e.del) { dels.push(e.k); return; } const l = mine.get(e.k); LB.push(l && (l.u || 0) > (e.u || 0) ? l : e); });
      LB.sort((a, b) => (a.offB || a.date) - (b.offB || b.date));
      if (j.set && +j.setU && (first || +j.setU > (SY.setU || 0))) { SET = Object.assign(SET, j.set); if (!SET.bf) SET.bf = {}; sv(SKEY, SET); }
      SY = { h: {}, setH: hsh(SET), setU: +j.setU || SY.setU, at: now, url: j.url || SY.url, del: dels }; LB.forEach(e => { SY.h[e.k] = hsh(strip(e)); });
      if (!+j.setU) { SY.setH = ''; cloudSoon(); }   // 云端还没有设置：下一次把本机的设置传上去
      sv(KEY, LB); sv('fa.lbsync', SY); cloudMsg = 'ok'; chip();
      if ($('lb').classList.contains('open') && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#lb-pg'))) render();
      if (!quiet) toast('☁️ ' + T('已保存到云端', 'Saved to the cloud') + '（' + LB.length + '）', 2500);
    } catch (e) { cloudMsg = 'err'; chip(); if (!quiet) toast('⚠️ ' + T('没连上后台，回头会再试', 'Could not reach the backend — will retry')); }
    finally { cloudBusy = false; }
  }
  const cloudTip = () => ({ old: T('后台是旧版：请用新的 Code.gs 更新并重新部署', 'Backend is old — update Code.gs and redeploy'), auth: T('后台还没授权建表格：Apps Script 里选 setupLogbook → 运行 → 允许', 'Authorise the backend: run setupLogbook in Apps Script'), err: T('同步没成功，回头会自动再试', 'Sync failed — will retry'), off: T('离线：有网时自动同步', 'Offline — syncs when online'), nokey: T('这台设备还没填后台口令', 'No backend password on this device') }[cloudMsg] || '');
  function chip() {
    const c = document.getElementById('lb-cloud'); if (!c) return;
    const t = SY.at ? z2(new Date(SY.at).getUTCHours()) + ':' + z2(new Date(SY.at).getUTCMinutes()) + 'Z' : '';
    c.className = 'lcloud ' + (cloudMsg || (SY.at ? 'ok' : ''));
    c.innerHTML = cloudMsg === 'busy' ? '☁️ ' + T('同步中…', 'Syncing…') : (cloudMsg === 'ok' || (!cloudMsg && SY.at)) ? '☁️ ' + T('已同步', 'Synced') + ' ' + t : cloudMsg === 'off' ? '☁️ ' + T('离线', 'Offline') + (t ? ' · ' + T('上次', 'last') + ' ' + t : '') : cloudMsg ? '⚠️ ' + cloudTip() : '☁️ ' + T('云端', 'Cloud');
    const a = document.getElementById('lb-sheet'); if (a) { a.style.display = SY.url ? '' : 'none'; if (SY.url) a.href = SY.url; }
  }
  const T = (zh, en) => typeof tt === 'function' ? tt(zh, en) : zh;

  // ---------- 太阳高度（NOAA 简化算法，精度 ±0.2°，够判断昼夜） ----------
  function sunAlt(lat, lon, t) {
    const d = t / 864e5 - 10957.5, g = (357.529 + 0.98560028 * d) * Math.PI / 180, q = 280.459 + 0.98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * Math.PI / 180, e = (23.439 - 0.00000036 * d) * Math.PI / 180;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = (18.697374558 + 24.06570982441908 * d) % 24, ha = ((gmst * 15 + lon) * Math.PI / 180) - ra;
    const la = lat * Math.PI / 180;
    return Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha)) * 180 / Math.PI;
  }
  // 夜间定义：中国民航 = 日落到日出（太阳中心 −0.833°）；EASA / ICAO = 昏影终到晨光始（−6°）
  const thr = () => (SET.night === 'sun' ? -0.833 : SET.night === 'civil' ? -6 : SET.fmt === 'caac' ? -0.833 : -6);
  const isNight = (lat, lon, t) => sunAlt(lat, lon, t) < thr();

  // 某个时刻飞机在哪：起飞前在起飞机场，落地后在落地机场，空中按 OFP 航路（实际空中时间按比例拉伸）
  function posAt(e, t) {
    if (t <= e.to || !e.pts || e.pts.length < 2) return t <= e.to || !e.pts ? e.dp : e.ap;
    if (t >= e.ldg) return e.ap;
    const P = e.pts, plan = P[P.length - 1][2] || 1, m = (t - e.to) / Math.max(MINms, e.ldg - e.to) * plan;
    for (let i = 1; i < P.length; i++) if (P[i][2] >= m) { const a = P[i - 1], b = P[i], f = (m - a[2]) / Math.max(.01, b[2] - a[2]); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
    return e.ap;
  }
  // 起落是谁的：pfTo 起飞、pfLdg 落地（旧记录只有 pf = 两个都是）
  const pfTo = e => e.pfTo != null ? !!e.pfTo : !!e.pf, pfLdg = e => e.pfLdg != null ? !!e.pfLdg : !!e.pf;
  const pfMode = e => !e ? 'none' : pfTo(e) && pfLdg(e) ? 'both' : pfTo(e) ? 'to' : pfLdg(e) ? 'ldg' : 'none';
  function setPf(e, m) { if (!e) return; e.pfTo = m === 'both' || m === 'to'; e.pfLdg = m === 'both' || m === 'ldg'; e.pf = e.pfTo || e.pfLdg; save(); }
  const pfName = m => ({ both: T('起飞 + 落地', 'T/O + landing'), to: T('只起飞', 'T/O only'), ldg: T('只落地', 'Landing only'), none: T('不是我飞的', 'not mine') }[m]);
  // 计算：总时间、空中时间、夜航、起降昼夜
  function calc(e) {
    const ok = e.offB && e.to && e.ldg && e.onB && e.onB > e.offB;
    const r = { blk: ok ? Math.round((e.onB - e.offB) / MINms) : 0, air: e.to && e.ldg && e.ldg > e.to ? Math.round((e.ldg - e.to) / MINms) : 0, night: 0, toN: false, ldN: false };
    r.block = SET.ftime === 'air' ? r.air : r.blk;   // 飞行时间：按规章 = 撤轮挡到挡轮挡；公司要求的话可改成起飞到落地
    if (!ok) return r;
    const t0 = SET.ftime === 'air' ? e.to : e.offB, t1 = SET.ftime === 'air' ? e.ldg : e.onB;
    for (let t = t0 + 30e3; t < t1; t += MINms) { const p = posAt(e, t); if (p && isNight(p[0], p[1], t)) r.night++; }
    if (e.dp) r.toN = isNight(e.dp[0], e.dp[1], e.to);
    if (e.ap) r.ldN = isNight(e.ap[0], e.ap[1], e.ldg);
    const pt = pfTo(e), pl = pfLdg(e), cap = (e.role || SET.role) === 'CAPT';
    Object.assign(r, { pic: cap ? r.block : 0, cop: cap ? 0 : r.block, ifr: r.block, toD: pt && !r.toN ? 1 : 0, toNn: pt && r.toN ? 1 : 0, ldD: pl && !r.ldN ? 1 : 0, ldNn: pl && r.ldN ? 1 : 0 });
    return r;
  }
  const hm = m => m ? Math.floor(m / 60) + ':' + z2(m % 60) : '';
  const hhmm = t => t ? z2(new Date(t).getUTCHours()) + z2(new Date(t).getUTCMinutes()) : '';
  const hcol = t => t ? z2(new Date(t).getUTCHours()) + ':' + z2(new Date(t).getUTCMinutes()) : '';
  const dstr = t => { if (!t) return ''; const d = new Date(t); return d.getUTCFullYear() + '-' + z2(d.getUTCMonth() + 1) + '-' + z2(d.getUTCDate()); };
  const dshort = t => { if (!t) return ''; const d = new Date(t); return z2(d.getUTCDate()) + '/' + z2(d.getUTCMonth() + 1) + '/' + String(d.getUTCFullYear()).slice(2); };

  // ---------- 从 OFP 建 / 更新这一班 ----------
  // 估算（只在 ADS-B 没有时用）：777 滑出至少 15 分钟（按 OFP 的 TAXI，最多 30）；落地后滑入 10 分钟
  const TXO = m => Math.max(15, Math.min(30, m || 15)), TXI = 10;
  function keyOf(o) { return o.flight.no + '|' + o.flight.date + '|' + o.flight.dep; }
  function fromOfp() {
    if (typeof S === 'undefined' || !S.ofp) return null;
    const o = S.ofp, f = o.flight, k = keyOf(o);
    let e = LB.find(x => x.k === k);
    if (!e && (SY.del || []).indexOf(k) >= 0) return null;   // 删掉过的不要自动再建
    const std = o.times.std || f.dateUTC, taxi = TXO(o.times.taxi) * MINms, trip = (o.times.trip || 0) * MINms;   // 滑出时间按 OFP 的 TAXI，最多 30 分钟
    const ap = c => (S.AP && S.AP[c]) ? [S.AP[c][3], S.AP[c][4]] : null;
    const dp = (S.pts && S.pts[0] && S.pts[0].pos) || (typeof apPos === 'function' ? apPos(f.dep) : null) || ap(f.dep);
    const aq = (S.pts && S.pts.length && S.pts[S.pts.length - 1].pos) || (typeof apPos === 'function' ? apPos(f.arr) : null) || ap(f.arr);
    if (!e) {
      e = { k, flt: f.no, cs: 'UAE' + f.digits, date: std, dep: f.dep, arr: f.arr, depI: f.depIata, arrI: f.arrIata, type: f.type || '', reg: (f.reg || '').replace(/-/g, ''), role: SET.role, pf: false, pic: '', rmk: '', src: {} };
      LB.push(e); LB.sort((a, b) => (a.offB || a.date) - (b.offB || b.date));
    }
    e.dp = dp; e.ap = aq; e.std = std; e.taxiP = TXO(o.times.taxi);
    e.pts = (S.pts || []).filter((p, i, A) => i === 0 || i === A.length - 1 || i % Math.ceil(A.length / 120) === 0).map(p => [+p.pos[0].toFixed(3), +p.pos[1].toFixed(3), p.t]);
    // 时间：手改 > ADS-B > Flight Assist 确认的起飞时间 > 计划
    const put = (f2, v, src) => { const rank = { man: 3, adsb: 2, est: 1.5, fa: 1, plan: 0 }; if (v && (!e[f2] || (rank[src] >= (rank[e.src[f2]] || 0)))) { e[f2] = v; e.src[f2] = src; } };
    const to0 = S.atd || null;
    put('to', to0 || std + taxi, to0 ? 'fa' : 'plan');
    put('offB', (to0 || std + taxi) - taxi, to0 ? 'fa' : 'plan');
    put('ldg', (e.to || std + taxi) + trip, to0 ? 'fa' : 'plan');
    put('onB', (e.ldg || std + taxi + trip) + TXI * MINms, to0 ? 'fa' : 'plan');
    save(); return e;
  }
  // 家里时钟用 ADS-B 判断的时间
  let busy = false;
  async function adsb(e, quiet) {
    if (!e || busy || !navigator.onLine) { if (!quiet && !navigator.onLine) toast('📵 ' + T('当前无网络', 'No network')); return false; }
    busy = true;
    try {
      const u = clockUrl() + '?action=logtimes&o=' + encodeURIComponent(e.depI) + '&d=' + encodeURIComponent(e.arrI) + '&t=' + (e.std || e.date) + '&_=' + Date.now();
      const j = await (await fetch(u, { cache: 'no-store' })).json();
      if (!j.ok) { if (!quiet) toast(/bad|action/.test(j.error || '') ? T('时钟后台是旧版：请更新 Code.gs 并重新部署', 'Backend is old — update Code.gs') : '⚠️ ' + (j.error || 'error')); return false; }
      if (!j.found || !j.status || !(j.status.off || j.status.on)) { if (!quiet) toast(T('时钟还没有这一班的 ADS-B 起降时间', 'No ADS-B times for this flight yet'), 4000); return false; }
      const st = j.status, put = (f, v, src) => { if (v && e.src[f] !== 'man' && !(src === 'est' && e.src[f] === 'adsb')) { e[f] = v; e.src[f] = src || 'adsb'; } };
      put('to', st.off); put('ldg', st.on);
      // 撤轮挡：ADS-B 看到开始滑行（往前推 2 分钟算推出）；看不到（地面信号常常收不到）→ 起飞时间 − OFP 滑行时间，最多 30 分钟
      // 撤轮挡：优先 ADS-B 看到的第一次移动（推出）→ 开始滑行前 2 分钟 → 都没有才估算
      const ok1 = v => v && st.off && st.off - v > 0 && st.off - v < 180 * MINms;   // 滑出可能很久：最多认 3 小时
      const tx = ok1(st.move) ? st.move : ok1(st.taxi) ? st.taxi - 2 * MINms : null;
      if (tx) put('offB', tx, 'adsb'); else if (st.off) put('offB', st.off - TXO(e.taxiP) * MINms, 'est');
      // 挡轮挡：优先 ADS-B 看到在目的地停稳；没有才按落地后 10 分钟估算
      const ib = st.in && st.on && st.in - st.on > 0 && st.in - st.on < 180 * MINms ? st.in : null;
      // 没看到停稳：落地后至少 10 分钟；ADS-B 后来还看到在地面滑行，就至少到那个时候
      const lg = st.lastGnd && st.on && st.lastGnd > st.on && st.lastGnd - st.on < 180 * MINms ? st.lastGnd + MINms : 0;
      if (ib) put('onB', ib, 'adsb'); else if (st.on) put('onB', Math.max(st.on + TXI * MINms, lg), 'est');
      if (st.reg && !e.reg) e.reg = st.reg;
      save(); if (!quiet) toast('✅ ' + T('已读取 ADS-B 起降时间', 'ADS-B times loaded'), 2500); return true;
    } catch (err) { if (!quiet) toast('⚠️ ' + T('没连上时钟后台', 'Could not reach the backend')); return false; }
    finally { busy = false; }
  }

  // ---------- 页面 ----------
  let editK = null;
  const roleN = r => ({ CAPT: T('机长', 'Captain'), FO: T('副驾驶', 'First Officer'), SO: T('第二副驾驶', 'Second Officer') }[r] || r);
  const srcTag = s => s === 'est' ? '<span class="lsrc e">' + T('估算', 'est.') + '</span>' : s === 'adsb' ? '<span class="lsrc a">ADS-B</span>' : s === 'man' ? '<span class="lsrc m">' + T('手改', 'edited') + '</span>' : s === 'fa' ? '<span class="lsrc f">ATD</span>' : '<span class="lsrc p">' + T('计划', 'plan') + '</span>';
  function editor(e) {
    if (!e) return '<div class="lcard"><b>' + T('还没有这一班', 'No flight yet') + '</b><div class="ldim">' + (curKey() ? T('这一班的记录删掉了。', 'This flight was deleted.') + ' <button class="btn sm" onclick="LBK.redo()">' + T('重新建立', 'Re-create') + '</button>' : T('先在「载入 OFP」里读入飞行计划，这里会自动建一条记录。', 'Load an OFP first — a record is created automatically.')) + '</div></div>';
    const r = calc(e), fld = (f, lab) => '<label class="lt"><span>' + lab + '</span><input class="num" data-f="' + f + '" value="' + hhmm(e[f]) + '" inputmode="numeric" maxlength="4">' + srcTag(e.src[f]) + '</label>';
    return '<div class="lcard"><div class="lhd"><b>' + esc(e.flt) + '</b> · ' + dstr(e.offB || e.date) + ' · ' + esc(e.dep) + ' → ' + esc(e.arr) + ' · ' + esc(e.type) + ' · <input class="lreg" data-f="reg" value="' + esc(e.reg) + '">' +
      '<span style="flex:1"></span><button class="btn sm" onclick="LBK.adsb()">⟳ ' + T('读取 ADS-B 时间', 'Load ADS-B times') + '</button></div>' +
      '<div class="lrow">' + fld('offB', T('撤轮挡', 'Off-block')) + fld('to', T('起飞', 'Take-off')) + fld('ldg', T('落地', 'Landing')) + fld('onB', T('挡轮挡', 'On-block')) + '<span class="ldim" style="align-self:center">UTC</span></div>' +
      '<div class="lrow">' +
      '<span class="pfx"><span class="sw' + (pfMode(e) !== 'none' ? ' on' : '') + '" onclick="LBK.pf()"><b></b>' + T('起落', 'T/O & landing') + '</span>' +
      '<span class="pfopt">' + ['both', 'to', 'ldg'].map(m => '<span class="' + (pfMode(e) === m ? 'on' : '') + '" onclick="LBK.pfSet(\'' + m + '\')">' + pfName(m) + '</span>').join('') + '</span></span>' +
      '<label class="lt"><span>' + T('职务', 'Role') + '</span><select data-f="role">' + ['CAPT', 'FO', 'SO'].map(x => '<option value="' + x + '"' + ((e.role || SET.role) === x ? ' selected' : '') + '>' + roleN(x) + '</option>').join('') + '</select></label>' +
      ((e.role || SET.role) === 'CAPT' ? '' : '<label class="lt"><span>' + T('机长姓名', 'PIC name') + '</span><input data-f="pic" value="' + esc(e.pic || '') + '" style="width:140px"></label>') +
      '<label class="lt" style="flex:1"><span>' + T('备注', 'Remarks') + '</span><input data-f="rmk" value="' + esc(e.rmk || '') + '" style="width:100%"></label></div>' +
      '<div class="lsum">' + T('飞行时间', 'Block') + ' <b>' + hm(r.block) + '</b> · ' + T('空中', 'Air') + ' <b>' + hm(r.air) + '</b> · ' + T('夜航', 'Night') + ' <b>' + (hm(r.night) || '0:00') + '</b> · ' +
      T('起飞', 'T/O') + ' ' + (r.toN ? '🌙 ' + T('夜', 'night') : '☀️ ' + T('昼', 'day')) + ' · ' + T('落地', 'Ldg') + ' ' + (r.ldN ? '🌙 ' + T('夜', 'night') : '☀️ ' + T('昼', 'day')) +
      (pfMode(e) === 'none' ? ' <span class="ldim">（' + T('起落没打开：不计起落次数', 'T/O & landing off: not counted') + '）</span>' : ' <span class="ldim">（' + T('计入：', 'Counted: ') + pfName(pfMode(e)) + '）</span>') +
      (editK && editK !== curKey() ? ' <button class="btn sm" style="margin-left:8px" onclick="LBK.del()">🗑 ' + T('删除这条', 'Delete') + '</button> <button class="btn sm" onclick="LBK.edit(null)">' + T('完成', 'Done') + '</button>' : '') + '</div></div>';
  }
  function settings() {
    return '<details class="lcard"' + (SET.name ? '' : ' open') + '><summary><b>⚙ ' + T('设置', 'Settings') + '</b> <span class="ldim">' + roleN(SET.role) + (SET.name ? ' · ' + esc(SET.name) : '') + '</span></summary><div class="lrow" style="margin-top:8px">' +
      '<label class="lt"><span>' + T('我的职务', 'My role') + '</span><select data-s="role">' + ['CAPT', 'FO', 'SO'].map(x => '<option value="' + x + '"' + (SET.role === x ? ' selected' : '') + '>' + roleN(x) + '</option>').join('') + '</select></label>' +
      '<label class="lt"><span>' + T('姓名', 'Name') + '</span><input data-s="name" value="' + esc(SET.name) + '" style="width:150px"></label>' +
      '<label class="lt"><span>' + T('执照号 / 员工号', 'Licence / staff no.') + '</span><input data-s="lic" value="' + esc(SET.lic) + '" style="width:130px"></label>' +
      '<label class="lt"><span>' + T('飞行时间记法', 'Flight time') + '</span><select data-s="ftime">' + [['block', T('撤轮挡→挡轮挡（ICAO / 民航局 / GCAA 规定）', 'Block: off-block → on-block (ICAO/EASA/GCAA)')], ['air', T('起飞→落地（空中时间）', 'Airborne: take-off → landing')]].map(x => '<option value="' + x[0] + '"' + ((SET.ftime || 'block') === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
      '<label class="lt"><span>' + T('夜间定义', 'Night') + '</span><select data-s="night">' + [['auto', T('按格式（民航：日落-日出；Jeppesen：昏影-晨光）', 'By format')], ['sun', T('日落到日出', 'Sunset–sunrise')], ['civil', T('昏影终到晨光始（太阳 −6°）', 'Civil twilight (−6°)')]].map(x => '<option value="' + x[0] + '"' + (SET.night === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
      '</div><div style="margin-top:12px"><b>' + T('以前累计的飞行经历（承前）', 'Previous experience (brought forward)') + '</b> <span class="ldim">' + T('时间写「小时:分钟」，例如 8520:35', 'Times as h:mm, e.g. 8520:35') + '</span></div><div class="lrow">' +
      BF.map(([k, zh, en, n]) => '<label class="lt"><span>' + T(zh, en) + '</span><input data-bf="' + k + '" value="' + esc(n ? (SET.bf[k] || '') : hm(SET.bf[k] || 0)) + '" style="width:' + (n ? 70 : 100) + 'px" inputmode="decimal"></label>').join('') + '</div>' +
      grand() + '<div class="ldim" style="margin-top:6px">' + T('记录只存在这台设备上，请定期点「备份」导出。', 'Records are stored on this device only — export a backup regularly.') + '</div></details>';
  }
  const BF = [['block', '总飞行时间', 'Total time'], ['pic', '机长时间', 'PIC'], ['cop', '副驾驶时间', 'Co-pilot'], ['night', '夜航时间', 'Night'], ['ifr', '仪表时间', 'IFR'], ['toD', '起飞 昼', 'T/O day', 1], ['toNn', '起飞 夜', 'T/O night', 1], ['ldD', '着陆 昼', 'Ldg day', 1], ['ldNn', '着陆 夜', 'Ldg night', 1]];
  const pmin = v => { v = String(v || '').trim(); if (!v) return 0; let m; if ((m = /^(\d+)[:：h ](\d{1,2})$/.exec(v))) return +m[1] * 60 + +m[2]; if (/^\d+(\.\d+)?$/.test(v)) return Math.round(+v * 60); return null; };
  const sumAll = () => { const o = {}; LB.forEach(e => { const r = calc(e); BF.forEach(([k]) => { o[k] = (o[k] || 0) + (r[k] || 0); }); }); return o; };
  function grand() { const s0 = sumAll(), g = k => (SET.bf[k] || 0) + (s0[k] || 0);
    return '<div class="lgrand">' + T('总计（承前 + 记录本）', 'Grand total (b/f + logbook)') + '：' + T('总时间', 'Total') + ' <b>' + (hm(g('block')) || '0:00') + '</b> · ' + T('机长', 'PIC') + ' <b>' + (hm(g('pic')) || '0:00') + '</b> · ' + T('副驾驶', 'Co-pilot') + ' <b>' + (hm(g('cop')) || '0:00') + '</b> · ' + T('夜航', 'Night') + ' <b>' + (hm(g('night')) || '0:00') + '</b> · ' + T('起飞', 'T/O') + ' <b>' + (g('toD') + g('toNn')) + '</b> · ' + T('着陆', 'Ldg') + ' <b>' + (g('ldD') + g('ldNn')) + '</b>（' + T('夜', 'night') + ' ' + g('ldNn') + '）</div>'; }
  function table() {
    const rows = LB.slice().sort((a, b) => (a.offB || a.date) - (b.offB || b.date)), R = rows.map(e => [e, calc(e)]);
    const tot = k => R.reduce((s, x) => s + (x[1][k] || 0), 0);
    if (!rows.length) return '<div class="ldim" style="padding:12px">' + T('还没有记录。', 'No records yet.') + '</div>';
    const ed = e => ' onclick="LBK.edit(\'' + e.k.replace(/'/g, '') + '\')"';
    if (SET.fmt === 'caac') {
      const H = '<tr><th rowspan="2">日期</th><th rowspan="2">航班号</th><th rowspan="2">航空器型别</th><th rowspan="2">登记号</th><th colspan="2">航段</th><th colspan="4">时刻（UTC）</th><th colspan="2">飞行时间</th><th colspan="2">驾驶员资格时间</th><th rowspan="2">夜航</th><th rowspan="2">仪表</th><th colspan="2">起飞</th><th colspan="2">着陆</th><th rowspan="2">备注</th></tr>' +
        '<tr><th>起飞地点</th><th>着陆地点</th><th>撤轮挡</th><th>起飞</th><th>着陆</th><th>挡轮挡</th><th>总时间</th><th>空中</th><th>机长</th><th>副驾驶</th><th>昼</th><th>夜</th><th>昼</th><th>夜</th></tr>';
      const B = R.map(([e, r]) => '<tr' + ed(e) + '><td>' + dstr(e.offB || e.date) + '</td><td>' + esc(e.flt) + '</td><td>' + esc(e.type) + '</td><td>' + esc(e.reg) + '</td><td>' + esc(e.dep) + '</td><td>' + esc(e.arr) + '</td><td>' + hcol(e.offB) + '</td><td>' + hcol(e.to) + '</td><td>' + hcol(e.ldg) + '</td><td>' + hcol(e.onB) + '</td><td class="b">' + hm(r.block) + '</td><td>' + hm(r.air) + '</td><td>' + hm(r.pic) + '</td><td>' + hm(r.cop) + '</td><td>' + hm(r.night) + '</td><td>' + hm(r.ifr) + '</td><td>' + (r.toD || '') + '</td><td>' + (r.toNn || '') + '</td><td>' + (r.ldD || '') + '</td><td>' + (r.ldNn || '') + '</td><td>' + esc([e.role !== 'CAPT' && e.pic ? '机长 ' + e.pic : '', e.rmk].filter(Boolean).join(' · ')) + '</td></tr>').join('');
      const fr = (lab, g, cls) => '<tr class="' + cls + '"><td colspan="10">' + lab + '</td><td class="b">' + hm(g('block')) + '</td><td>' + hm(g('air')) + '</td><td>' + hm(g('pic')) + '</td><td>' + hm(g('cop')) + '</td><td>' + hm(g('night')) + '</td><td>' + hm(g('ifr')) + '</td><td>' + g('toD') + '</td><td>' + g('toNn') + '</td><td>' + g('ldD') + '</td><td>' + g('ldNn') + '</td><td></td></tr>';
      const bfk = k => k === 'air' ? 0 : (SET.bf[k] || 0);
      const F = fr('本册合计（' + rows.length + ' 段）', tot, 'tot') + (BF.some(([k]) => SET.bf[k]) ? fr('以前累计（承前）', bfk, 'bf') + fr('总计', k => tot(k) + bfk(k), 'tot') : '');
      return '<h1>飞行经历记录本</h1><div class="lmeta">驾驶员：' + esc(SET.name || '—') + ' · 执照号：' + esc(SET.lic || '—') + ' · 时间为 UTC · 夜间：' + (thr() < -3 ? '昏影终至晨光始' : '日落至日出') + '</div><table class="lbt">' + H + B + F + '</table>';
    }
    const H = '<tr><th rowspan="2">DATE<br><small>dd/mm/yy</small></th><th colspan="2">DEPARTURE</th><th colspan="2">ARRIVAL</th><th colspan="2">AIRCRAFT</th><th colspan="2">SINGLE PILOT TIME</th><th rowspan="2">MULTI-PILOT TIME</th><th rowspan="2">TOTAL TIME OF FLIGHT</th><th rowspan="2">NAME PIC</th><th colspan="2">LANDINGS</th><th colspan="2">OPERATIONAL CONDITION TIME</th><th colspan="4">PILOT FUNCTION TIME</th><th rowspan="2">REMARKS AND ENDORSEMENTS</th></tr>' +
      '<tr><th>PLACE</th><th>TIME</th><th>PLACE</th><th>TIME</th><th>MAKE, MODEL</th><th>REGISTRATION</th><th>SE</th><th>ME</th><th>DAY</th><th>NIGHT</th><th>NIGHT</th><th>IFR</th><th>PILOT IN COMMAND</th><th>CO-PILOT</th><th>DUAL</th><th>INSTRUCTOR</th></tr>';
    const B = R.map(([e, r]) => '<tr' + ed(e) + '><td>' + dshort(e.offB || e.date) + '</td><td>' + esc(e.dep) + '</td><td>' + hcol(e.offB) + '</td><td>' + esc(e.arr) + '</td><td>' + hcol(e.onB) + '</td><td>' + esc(e.type) + '</td><td>' + esc(e.reg) + '</td><td></td><td></td><td>' + hm(r.block) + '</td><td class="b">' + hm(r.block) + '</td><td>' + esc((e.role || SET.role) === 'CAPT' ? 'SELF' : (e.pic || '')) + '</td><td>' + (r.ldD || '') + '</td><td>' + (r.ldNn || '') + '</td><td>' + hm(r.night) + '</td><td>' + hm(r.ifr) + '</td><td>' + hm(r.pic) + '</td><td>' + hm(r.cop) + '</td><td></td><td></td><td>' + esc([e.flt, pfMode(e) === 'to' ? 'T/O only' : pfMode(e) === 'ldg' ? 'LDG only' : '', e.rmk].filter(Boolean).join(' · ')) + '</td></tr>').join('');
    const fr = (lab, g, cls) => '<tr class="' + cls + '"><td colspan="9">' + lab + '</td><td>' + hm(g('block')) + '</td><td class="b">' + hm(g('block')) + '</td><td></td><td>' + g('ldD') + '</td><td>' + g('ldNn') + '</td><td>' + hm(g('night')) + '</td><td>' + hm(g('ifr')) + '</td><td>' + hm(g('pic')) + '</td><td>' + hm(g('cop')) + '</td><td></td><td></td><td></td></tr>';
    const bfk = k => SET.bf[k] || 0;
    const F = fr('TOTAL THIS BOOK (' + rows.length + ')', tot, 'tot') + (BF.some(([k]) => SET.bf[k]) ? fr('TOTAL FROM PREVIOUS PAGES', bfk, 'bf') + fr('TOTAL TIME', k => tot(k) + bfk(k), 'tot') : '');
    return '<h1>PILOT LOGBOOK</h1><div class="lmeta">' + esc(SET.name || '—') + ' · ' + esc(SET.lic || '') + ' · times UTC · night: ' + (thr() < -3 ? 'end of evening to beginning of morning civil twilight' : 'sunset to sunrise') + '</div><table class="lbt">' + H + B + F + '</table>';
  }
  const curKey = () => (typeof S !== 'undefined' && S.ofp) ? keyOf(S.ofp) : null;
  function render() {
    const cur = curKey() ? (LB.find(x => x.k === curKey()) || fromOfp()) : null, e = editK ? LB.find(x => x.k === editK) : cur;
    $('lb-pg').innerHTML = '<div class="noprint">' + settings() + '<h3 style="margin:14px 0 6px">' + (editK && editK !== curKey() ? '✏️ ' + T('修改记录', 'Edit record') : '✈️ ' + T('这一班', 'This flight')) + '</h3>' + editor(e) + '</div><div class="lpaper">' + table() + '</div>';
    $('lb-fmt').querySelectorAll('span').forEach(x => x.classList.toggle('on', x.dataset.v === SET.fmt));
    // 输入框：改完马上保存
    $('lb-pg').querySelectorAll('[data-f]').forEach(inp => inp.onchange = () => {
      const f = inp.dataset.f, x = LB.find(q => q.k === (e && e.k)); if (!x) return;
      if (/^(offB|to|ldg|onB)$/.test(f)) { const v = inp.value.replace(/\D/g, ''); if (v.length !== 4 || +v.slice(0, 2) > 23 || +v.slice(2) > 59) { toast(T('请输入 4 位 UTC 时间，例如 0450', 'Enter 4-digit UTC, e.g. 0450')); inp.value = hhmm(x[f]); return; }
        const base = x[f] || x.std || x.date, d = new Date(base); d.setUTCHours(+v.slice(0, 2), +v.slice(2), 0, 0); let t = d.getTime(); if (t - base > 12 * 36e5) t -= 864e5; if (base - t > 12 * 36e5) t += 864e5; x[f] = t; x.src[f] = 'man'; }
      else x[f] = inp.value.trim();
      save(); render();
    });
    $('lb-pg').querySelectorAll('[data-bf]').forEach(inp => inp.onchange = () => { const k = inp.dataset.bf, n = BF.find(x => x[0] === k)[3];
      const v = n ? (inp.value.trim() === '' ? 0 : parseInt(inp.value, 10)) : pmin(inp.value); if (v == null || isNaN(v) || v < 0) { toast(T('格式不对：时间写 8520:35，次数写整数', 'Use h:mm for times, whole numbers for counts')); inp.value = ''; return; }
      SET.bf[k] = v; saveSet(); render(); });
    $('lb-pg').querySelectorAll('[data-s]').forEach(inp => inp.onchange = () => { SET[inp.dataset.s] = inp.value.trim(); saveSet(); if (inp.dataset.s === 'role' && e && !e.src.roleSet) { e.role = SET.role; save(); } render(); });
  }
  function rowsOf() {
    const R = LB.slice().sort((a, b) => (a.offB || a.date) - (b.offB || b.date)).map(e => [e, calc(e)]);
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const head = SET.fmt === 'caac' ? ['日期', '航班号', '机型', '登记号', '起飞地点', '着陆地点', '撤轮挡', '起飞', '着陆', '挡轮挡', '总时间', '空中', '机长', '副驾驶', '夜航', '仪表', '起飞昼', '起飞夜', '着陆昼', '着陆夜', '备注']
      : ['Date', 'Dep place', 'Dep time', 'Arr place', 'Arr time', 'Type', 'Reg', 'SP SE', 'SP ME', 'Multi-pilot', 'Total', 'Name PIC', 'Ldg day', 'Ldg night', 'Night', 'IFR', 'PIC', 'Co-pilot', 'Dual', 'Instructor', 'Remarks'];
    const rows = R.map(([e, r]) => SET.fmt === 'caac' ? [dstr(e.offB || e.date), e.flt, e.type, e.reg, e.dep, e.arr, hcol(e.offB), hcol(e.to), hcol(e.ldg), hcol(e.onB), hm(r.block), hm(r.air), hm(r.pic), hm(r.cop), hm(r.night), hm(r.ifr), r.toD || '', r.toNn || '', r.ldD || '', r.ldNn || '', e.rmk || '']
      : [dshort(e.offB || e.date), e.dep, hcol(e.offB), e.arr, hcol(e.onB), e.type, e.reg, '', '', hm(r.block), hm(r.block), (e.role || SET.role) === 'CAPT' ? 'SELF' : e.pic || '', r.ldD || '', r.ldNn || '', hm(r.night), hm(r.ifr), hm(r.pic), hm(r.cop), '', '', [e.flt, e.rmk].filter(Boolean).join(' · ')]);
    return [head].concat(rows);
  }
  function csv() { const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; return '\ufeff' + rowsOf().map(r => r.map(q).join(',')).join('\r\n'); }
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

  window.LBK = {
    open() { editK = null; fromOfp(); render(); chip(); $('lb').classList.add('open'); $('lb').scrollTop = 0; cloud(true); const e = LB.find(x => x.k === curKey()); if (e) adsb(e, true).then(ok => { if (ok) render(); }); },
    close() { $('lb').classList.remove('open'); try { pfUI(); } catch (e) {} },
    fmt(v) { SET.fmt = v; saveSet(); render(); },
    pf() { const e = LB.find(x => x.k === (editK || curKey())); if (!e) return; setPf(e, pfMode(e) === 'none' ? 'both' : 'none'); render(); },
    pfSet(m) { const e = LB.find(x => x.k === (editK || curKey())); if (!e) return; setPf(e, pfMode(e) === m ? 'none' : m); render(); },
    // 主页面上的「起落」开关用
    cur() { if (typeof S === 'undefined' || !S.ofp) return null; return LB.find(x => x.k === curKey()) || fromOfp(); },
    mode() { return pfMode(this.cur()); }, setMode(m) { const e = this.cur(); if (!e) return false; setPf(e, m); if ($('lb').classList.contains('open')) render(); return true; }, pfName,
    async adsb() { const e = LB.find(x => x.k === (editK || curKey())); if (await adsb(e, false)) render(); },
    edit(k) { editK = k; render(); if (k) $('lb').scrollTop = 0; },
    del() { if (!editK || !confirm(T('删除这条记录？', 'Delete this record?'))) return; SY.del = (SY.del || []).concat(editK); sv('fa.lbsync', SY); LB = LB.filter(x => x.k !== editK); save(); editK = null; render(); },
    redo() { const k = curKey(); SY.del = (SY.del || []).filter(x => x !== k); sv('fa.lbsync', SY); fromOfp(); render(); },
    csv() { download('logbook-' + SET.fmt + '-' + dstr(Date.now()) + '.csv', csv(), 'text/csv;charset=utf-8'); },
    backup() { download('logbook-backup-' + dstr(Date.now()) + '.json', JSON.stringify({ v: 1, set: SET, lb: LB }), 'application/json'); },
    restore(file) { const r = new FileReader(); r.onload = () => { try { const j = JSON.parse(r.result); if (!Array.isArray(j.lb)) throw 0; const have = new Set(LB.map(x => x.k)); j.lb.forEach(x => { if (!have.has(x.k)) LB.push(x); }); if (j.set) SET = Object.assign(SET, j.set); save(); saveSet(); render(); toast('✅ ' + T('已恢复 ', 'Restored ') + j.lb.length); } catch (e) { toast(T('文件不对', 'Not a logbook backup')); } }; r.readAsText(file); },
    sync() { if (typeof S !== 'undefined' && S.ofp) { const e = fromOfp(); if (e) adsb(e, true); } },   // OFP 载入 / 确认起飞时间后调用
    cloud() { cloud(false); }, calc, sunAlt, all: () => LB
  };
  window.addEventListener('online', () => cloud(true));
  setInterval(() => cloud(true), 15 * 60e3); setTimeout(() => cloud(true), 6000);
  // 有网时定期看看时钟有没有 ADS-B 时间（落地后自动补上）
  setInterval(() => { if (typeof S === 'undefined' || !S.ofp || !navigator.onLine) return; const e = LB.find(x => x.k === curKey()); const need = f => e && e.src[f] !== 'adsb' && e.src[f] !== 'man'; if (e && Date.now() > (e.to || 0) && (need('ldg') || need('offB') || need('onB')) && Date.now() - (e.ldg || e.to || 0) < 6 * 36e5) adsb(e, true).then(ok => { if (ok && $('lb').classList.contains('open')) render(); }); }, 10 * 60e3);
})();
