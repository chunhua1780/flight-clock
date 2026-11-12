/* OFP 库：这台 iPad 上可以存好几份 OFP（例如一天来回两班），点顶上的航班名切换；
   有网时从邮箱（自己的 Gmail，经自己的 Apps Script）取 OFP 的 PDF，和排班对上（航班号 + 目的地 + 日期）才收；
   上一班飞完自动换到下一班。全部存在 IndexedDB，离线可用。 */
(function () {
  'use strict';
  const T = (zh, en) => typeof tt === 'function' ? tt(zh, en) : zh;
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((ok, no) => { const r = indexedDB.open('fa-ofplib', 1); r.onupgradeneeded = () => r.result.createObjectStore('ofp', { keyPath: 'k' }); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }));
  const tx = async (mode, fn) => { const d = await db(); return new Promise((ok, no) => { const t = d.transaction('ofp', mode), st = t.objectStore('ofp'); const r = fn(st); t.oncomplete = () => ok(r && r.result); t.onerror = () => no(t.error); }); };
  const all = async () => { try { return (await tx('readonly', s => s.getAll())) || []; } catch (e) { return []; } };
  const get = async k => { try { return await tx('readonly', s => s.get(k)); } catch (e) { return null; } };
  const put = e => tx('readwrite', s => s.put(e)).catch(() => {});
  const del = k => tx('readwrite', s => s.delete(k)).catch(() => {});
  const keyOf = r => r.flight.no + '|' + r.flight.date + '|' + r.flight.dep;
  const last4 = d => String(d || '').replace(/\D/g, '').slice(-4).replace(/^0+/, '');
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem('fa.' + k); localStorage.setItem('fa.' + k, v); } catch (e) { return null; } };

  // 存一份（读入 / 粘贴 / 邮件来的都走这里）
  async function save(text, src, name, parsed) {
    const r = parsed || OFP.parse(text); if (!r || !r.ok) return null;
    const k = keyOf(r), old = await get(k), f = r.flight;
    const e = Object.assign(old || {}, { k, no: f.no, digits: f.digits, date: f.date, dep: f.dep, arr: f.arr, depI: f.depIata, arrI: f.arrIata, reg: f.reg, std: r.times.std || f.dateUTC, trip: r.times.trip || 0, text, name: name || (old && old.name) || '', src: src || (old && old.src) || 'manual', at: Date.now() });
    await put(e);
    // 太旧的（10 天前）清掉
    (await all()).forEach(x => { if (x.std && Date.now() - x.std > 10 * 864e5 && x.k !== e.k) del(x.k); });
    return e;
  }
  // 当前这一班的起飞时间 / 过点修正跟着这份 OFP 存（切回来还在）
  async function snap(k, atd, fix) { if (!k) return; const e = await get(k); if (!e) return; e.atd = atd || null; e.fix = fix || null; await put(e); }
  const remember = () => snap(ls('ofpk'), S.atd, S.fix);
  async function activate(k, quiet) {
    const e = await get(k); if (!e) return false;
    if (!useText(e.text)) return false;   // useText 会先记下上一班的起飞时间，再把这一班设为当前
    setATD(e.atd || null);
    if (e.fix) { S.fix = e.fix; ls('fix', JSON.stringify(e.fix)); if (typeof fixBar === 'function') fixBar(); tick(); }
    if (!quiet) toast('✈️ ' + T('已切换到 ', 'Switched to ') + e.no + ' ' + e.dep + '→' + e.arr, 3000);
    menu(false); return true;
  }
  const endOf = e => (e.std || 0) + ((e.trip || 0) + 120) * 60e3;            // 计划落地后 2 小时算这一班结束
  // 自动：现在这一班已经飞完、库里有下一班 → 换过去；还没有任何 OFP → 用最近的那一班
  async function auto() {
    const L = (await all()).filter(e => endOf(e) > Date.now()).sort((a, b) => a.std - b.std); if (!L.length) return;
    const curK = ls('ofpk'), cur = curK ? await get(curK) : null, next = L[0];
    if (!S.ofp || !cur || (endOf(cur) < Date.now() && next.k !== cur.k)) await activate(next.k, !S.ofp);
  }

  // ---------- 邮箱 ----------
  // 只认 OFP：Lido 的文件名（EK.9873.11Nov2026.CAN.DWC.pdf）或者邮件主题 / 文件名里有 OFP；别的私人文件不显示、不下载
  const LIDO = /EK\.?\s?(\d{3,4})\.(\d{2}[A-Za-z]{3}\d{4})\.([A-Z]{3})\.([A-Z]{3})/;
  const isOfp = f => LIDO.test(f.name || '') || /\bOFP\b/i.test(f.name || '') || /\bOFP\b/i.test(f.subject || '');
  // 邮箱来源：先走 Google 后台；连不上（例如在中国）就走你的 GitHub 私有仓库（后台每 10 分钟把 OFP 复制过去）
  const GH = () => ({ tok: ls('ghtok') || '', repo: ls('ghrepo') || 'chunhua1780/flight-box' });
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
  let SRC = 'google';
  async function listMail(days) {
    if (ls('key')) { try { const j = await withTimeout(postK({ action: 'ofpmail', days }), 12000); if (j && j.ok) { SRC = 'google'; return j; } } catch (e) {} }
    const g = GH(); if (!g.tok) return { ok: false, error: T('连不上 Google（在中国？）。设置里填了 GitHub 同步码就能在中国收 OFP。', 'Cannot reach Google. Add the GitHub sync key in Settings to receive OFPs in China.') };
    try { const r = await withTimeout(fetch('https://api.github.com/repos/' + g.repo + '/contents/ofp/index.json?_=' + Date.now(), { headers: { Authorization: 'Bearer ' + g.tok, Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' }), 20000);
      if (r.status === 404) return { ok: true, files: [], legs: [], src: 'github' };
      if (!r.ok) return { ok: false, error: 'GitHub ' + r.status };
      const idx = await r.json(); SRC = 'github';
      return { ok: true, src: 'github', legs: [], files: idx.map(x => ({ id: 'gh:' + x.path, name: x.name, subject: x.subject || 'OFP', t: x.t, size: x.size, roster: true })) };
    } catch (e) { return { ok: false, error: T('Google 和 GitHub 都连不上', 'Neither Google nor GitHub is reachable') }; }
  }
  async function getFile(id) {
    if (/^gh:/.test(id)) { const g = GH(); const r = await fetch('https://api.github.com/repos/' + g.repo + '/contents/' + id.slice(3), { headers: { Authorization: 'Bearer ' + g.tok, Accept: 'application/vnd.github.raw+json' } });
      if (!r.ok) throw new Error('GitHub ' + r.status); return new Uint8Array(await r.arrayBuffer()); }
    const a = await postK({ action: 'ofpget', id }); if (!a.ok || !a.b64) throw new Error(a.error || T('下载失败', 'Download failed'));
    return Uint8Array.from(atob(a.b64), c => c.charCodeAt(0));
  }
  const postK = body => fetch(clockUrl() + '?k=' + encodeURIComponent(ls('key')), { method: 'POST', body: JSON.stringify(body) }).then(r => r.text()).then(t => { try { return JSON.parse(t); } catch (e) { return { ok: false, error: t.slice(0, 120) }; } });
  // 最近 6 天的 OFP 列表：iPad 上已有的 + 邮箱里还没下载的，点哪份用哪份；「📧 收邮件」再查一次
  let ML = (() => { try { return JSON.parse(ls('maillist') || '[]'); } catch (e) { return []; } })(), MLmsg = '';
  async function pick(refresh) {
    const box = document.getElementById('mailpick'); if (!box) return;
    box.classList.add('open'); await drawPick();
    if (refresh === false) return;
    if (!navigator.onLine) { MLmsg = '📵 ' + T('离线：显示的是上次收到的', 'Offline — showing the last list'); drawPick(); return; }
    MLmsg = '⏳ ' + T('正在收邮件…', 'Checking mail…'); drawPick();
    const j = await listMail(6);
    if (!j.ok) { MLmsg = '⚠️ ' + (j.error || ''); drawPick(); return; }
    const legs = j.legs || [], seenK = new Set();
    ML = (j.files || []).filter(isOfp).filter(f => { const k = f.name + '|' + f.size; if (seenK.has(k)) return false; seenK.add(k); return true; })
      .map(f => { const m = LIDO.exec(f.name || ''); return Object.assign({}, f, { roster: f.roster || !!(m && legs.some(l => last4(l.digits) === last4(m[1]) && l.dest === m[4])) }); });
    ls('maillist', JSON.stringify(ML)); MLmsg = (j.src === 'github' ? '🌏 ' + T('经 GitHub 收到（Google 连不上）', 'via GitHub (Google unreachable)') + ' · ' : '') + T('刚刚收过', 'checked just now');
    drawPick();
    mail(true);   // 排班上的顺便自动下载
  }
  async function drawPick() {
    const box = document.getElementById('mailpick'); if (!box) return;
    const lib = (await all()).filter(e => Date.now() - (e.std || 0) < 6 * 864e5 || endOf(e) > Date.now()).sort((a, b) => a.std - b.std), cur = ls('ofpk');
    const libNames = new Set(lib.map(e => e.name).filter(Boolean)), z2 = n => String(n).padStart(2, '0');
    const when = t => { const d = new Date(t); return z2(d.getDate()) + '/' + z2(d.getMonth() + 1) + ' ' + z2(d.getHours()) + ':' + z2(d.getMinutes()); };
    const hm = t => t ? z2(new Date(t).getUTCHours()) + z2(new Date(t).getUTCMinutes()) + 'Z' : '';
    const rowsLib = lib.map(e => '<div class="mp-i lib' + (e.k === cur ? ' on' : '') + '" data-k="' + esc(e.k) + '"><div class="mp-t"><b>' + esc(e.no) + '</b> ' + esc(e.date) + ' · ' + esc(e.dep) + '→' + esc(e.arr) + ' · STD ' + hm(e.std) + (e.k === cur ? ' <span class="mp-b g">' + T('正在用', 'in use') + '</span>' : ' <span class="mp-b">' + T('在 iPad 上', 'on iPad') + '</span>') + (e.src === 'mail' ? ' 📧' : '') + '</div></div>').join('');
    const mailOnly = ML.filter(f => !libNames.has(f.name));
    const rowsMail = mailOnly.map(f => { const m = LIDO.exec(f.name || '');
      return '<div class="mp-i" data-id="' + esc(f.id) + '" data-n="' + esc(f.name) + '"><div class="mp-t">' + (m ? '<b>EK' + m[1] + '</b> ' + m[2].slice(0, 5).toUpperCase() + ' · ' + m[3] + '→' + m[4] : '<b>' + esc(f.name) + '</b>') +
        (f.roster ? ' <span class="mp-b g">' + T('排班上有', 'on roster') + '</span>' : '') + ' <span class="mp-b m">' + T('邮箱里，点一下下载', 'in mail — tap to download') + '</span></div>' +
        '<div class="mp-s">' + esc(f.subject || '') + ' · ' + T('收到', 'received') + ' ' + when(f.t) + ' · ' + (f.size / 1e6).toFixed(1) + ' MB</div></div>'; }).join('');
    box.innerHTML = '<div class="mp-h">✈️ ' + T('最近 6 天的 OFP', 'OFPs — last 6 days') + '<button class="btn sm" style="margin-left:auto" onclick="OFL.pick()">📧 ' + T('收邮件', 'Check mail') + '</button><span class="mp-x" onclick="OFL.pickClose()">✕</span></div>' +
      (rowsLib + rowsMail || '<div class="mp-e">' + T('还没有 OFP。在 Lido 里把 OFP 发到你的邮箱，再点「收邮件」。', 'No OFP yet. Email the OFP from Lido, then tap “Check mail”.') + '</div>') +
      (MLmsg ? '<div class="mp-m">' + MLmsg + '</div>' : '');
    box.querySelectorAll('.mp-i.lib').forEach(el => el.onclick = () => activate(el.dataset.k));
    box.querySelectorAll('.mp-i:not(.lib)').forEach(el => el.onclick = async () => {
      if (el.classList.contains('busy')) return; el.classList.add('busy'); const s0 = el.querySelector('.mp-s'); s0.textContent = '⏳ ' + T('下载中…（大文件要 10–30 秒）', 'Downloading… (10–30 s)');
      let bin; try { bin = await getFile(el.dataset.id); } catch (e) { el.classList.remove('busy'); s0.textContent = '⚠️ ' + e.message; return; }
      s0.textContent = '⏳ ' + T('读取中…', 'Reading…');
      const ok = await useFile(new File([bin], el.dataset.n || 'ofp.pdf'), el.dataset.n);
      if (ok) { const k = ls('ofpk'); if (k) { const e = await get(k); if (e) { e.name = el.dataset.n; e.src = 'mail'; await put(e); } } drawPick(); }
      else { el.classList.remove('busy'); s0.textContent = '⚠️ ' + T('这个文件读不出 OFP', 'Could not read an OFP from this file'); }
    });
  }


  // ---------- 自动收：排班上的 OFP 自动下载到 iPad（Google 或 GitHub） ----------
  let mailBusy = false, mailMsg = '';
  async function mail(quiet) {
    if (mailBusy) return;
    if (!navigator.onLine || (!ls('key') && !ls('ghtok'))) { mailMsg = !navigator.onLine ? T('离线', 'offline') : T('没填口令', 'no key'); menuRefresh(); if (!quiet) toast(mailMsg); return; }
    mailBusy = true; let got = 0;
    try {
      const j = await listMail(6);
      if (!j.ok) { mailMsg = '⚠️ ' + (j.error || ''); if (!quiet) toast(mailMsg, 5000); return; }
      const legs = j.legs || [], seen = new Set(JSON.parse(ls('mailseen') || '[]')), libNames = new Set((await all()).map(e => e.name).filter(Boolean));
      const onRoster = (digits, dest, std) => !legs.length ? true : legs.some(l => last4(l.digits) === last4(digits) && l.dest === dest && (std == null || Math.abs(l.std - std) < 12 * 36e5));
      for (const f of (j.files || []).filter(isOfp).slice(0, 12)) {
        if (seen.has(f.id) || libNames.has(f.name)) continue;
        const m = LIDO.exec(f.name || ''); if (j.src !== 'github' && (!m || !onRoster(m[1], m[4]))) continue;   // 只自动收排班上的
        let bin; try { bin = await getFile(f.id); } catch (e) { continue; }
        let text = ''; try { text = (await DOCR.readAny(new Blob([bin]), f.name, pdfText)).text; } catch (e) { continue; }
        const r = OFP.parse(text); seen.add(f.id);
        if (!r.ok || (j.src !== 'github' && !onRoster(r.flight.digits, r.flight.arrIata, r.times.std || r.flight.dateUTC))) continue;
        const e = await save(text, 'mail', f.name, r); if (e) { libNames.add(f.name); got++; }
      }
      ls('mailseen', JSON.stringify([...seen].slice(-200)));
      mailMsg = got ? '📧 ' + T('收到 ' + got + ' 份 OFP', got + ' OFP(s) received') : T('没有新的 OFP', 'No new OFP');
      if (got) { toast(mailMsg, 3500); await auto(); const b = document.getElementById('mailpick'); if (b && b.classList.contains('open')) drawPick(); }
      else if (!quiet) toast(mailMsg, 2500);
    } catch (e) { mailMsg = T('没连上', 'Could not connect'); if (!quiet) toast(mailMsg); }
    finally { mailBusy = false; menuRefresh(); }
  }

  // ---------- 顶上航班名：点开选哪一份 OFP ----------
  let open = false;
  async function menuRefresh() { if (open) menu(true); }
  async function menu(show) {
    open = show; const m = document.getElementById('ofpmenu'); if (!m) return;
    if (!show) { m.classList.remove('open'); return; }
    const L = (await all()).sort((a, b) => a.std - b.std), cur = ls('ofpk'), z2 = n => String(n).padStart(2, '0');
    const hm = t => t ? z2(new Date(t).getUTCHours()) + z2(new Date(t).getUTCMinutes()) + 'Z' : '';
    m.innerHTML = '<div class="oh">' + T('这台 iPad 上的 OFP', 'OFPs on this iPad') + '</div>' +
      (L.length ? L.map(e => '<div class="oi' + (e.k === cur ? ' on' : '') + (endOf(e) < Date.now() ? ' old' : '') + '" onclick="OFL.activate(\'' + e.k + '\')"><b>' + esc(e.no) + '</b> ' + esc(e.date) + ' · ' + esc(e.dep) + '→' + esc(e.arr) + ' · STD ' + hm(e.std) +
        (e.src === 'mail' ? ' <span class="os">📧</span>' : '') + (e.k === cur ? ' ✓' : '') + '<span class="ox" onclick="event.stopPropagation();OFL.remove(\'' + e.k + '\')">✕</span></div>').join('') : '<div class="oe">' + T('还没有', 'None yet') + '</div>') +
      '<div class="ob"><button class="btn sm" onclick="OFL.menu(false);openLoad();OFL.pick()">📧 ' + T('从邮箱选', 'Pick from mail') + '</button><button class="btn sm" onclick="openLoad();OFL.menu(false)">＋ ' + T('载入 / 粘贴', 'Load / paste') + '</button></div>' +
      (mailMsg ? '<div class="om2">' + esc(mailMsg) + '</div>' : '');
    m.classList.add('open');
  }
  async function remove(k) { if (!confirm(T('从这台 iPad 删除这份 OFP？', 'Remove this OFP from this iPad?'))) return; await del(k); if (ls('ofpk') === k) ls('ofpk', ''); menu(true); }

  window.OFL = { save, activate, auto, mail, menu, remove, all, keyOf, remember, snap, get, pick, pickClose: () => { const b = document.getElementById('mailpick'); if (b) b.classList.remove('open'); } };
  document.addEventListener('click', e => { if (open && !e.target.closest('#ofpmenu') && !e.target.closest('#t-fl')) menu(false); });
  window.addEventListener('online', () => mail(true));
  setTimeout(() => { auto(); mail(true); }, 5000);
  setInterval(() => { auto(); }, 5 * 60e3);
  setInterval(() => mail(true), 10 * 60e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { auto(); mail(true); } });
})();
