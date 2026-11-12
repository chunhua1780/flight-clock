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
  const postK = body => fetch(clockUrl() + '?k=' + encodeURIComponent(ls('key')), { method: 'POST', body: JSON.stringify(body) }).then(r => r.text()).then(t => { try { return JSON.parse(t); } catch (e) { return { ok: false, error: t.slice(0, 120) }; } });
  // 从邮箱里自己选一份 OFP
  async function pick() {
    const box = document.getElementById('mailpick'); if (!box) return;
    box.classList.add('open');
    if (!navigator.onLine) { box.innerHTML = '<div class="mp-h">📧 ' + T('邮箱里的 OFP', 'OFPs in your mail') + '<span class="mp-x" onclick="OFL.pickClose()">✕</span></div><div class="mp-e">📵 ' + T('当前无网络', 'No network') + '</div>'; return; }
    if (!ls('key')) { box.innerHTML = '<div class="mp-h">📧 ' + T('邮箱里的 OFP', 'OFPs in your mail') + '<span class="mp-x" onclick="OFL.pickClose()">✕</span></div><div class="mp-e">' + T('这台设备还没填后台口令', 'No backend password on this device') + '</div>'; return; }
    box.innerHTML = '<div class="mp-h">📧 ' + T('邮箱里的 OFP', 'OFPs in your mail') + '<span class="mp-x" onclick="OFL.pickClose()">✕</span></div><div class="mp-e">⏳ ' + T('正在看邮箱…', 'Checking mail…') + '</div>';
    const j = await postK({ action: 'ofpmail', days: 10 });
    if (!j.ok) { box.querySelector('.mp-e').textContent = '⚠️ ' + (j.error || ''); return; }
    const legs = j.legs || [], lib = new Set((await all()).map(e => e.name).filter(Boolean)), seenId = new Set();
    const L = (j.files || []).filter(isOfp).filter(f => { const k = f.name + '|' + f.size; if (seenId.has(k)) return false; seenId.add(k); return true; });   // 同一份转发多次只列一次
    const z2 = n => String(n).padStart(2, '0'), when = t => { const d = new Date(t); return z2(d.getDate()) + '/' + z2(d.getMonth() + 1) + ' ' + z2(d.getHours()) + ':' + z2(d.getMinutes()); };
    box.innerHTML = '<div class="mp-h">📧 ' + T('邮箱里的 OFP（最近 10 天）', 'OFPs in your mail (last 10 days)') + '<span class="mp-x" onclick="OFL.pickClose()">✕</span></div>' +
      (L.length ? L.map(f => { const m = LIDO.exec(f.name || ''), rost = m && legs.some(l => last4(l.digits) === last4(m[1]) && l.dest === m[4]);
        return '<div class="mp-i" data-id="' + esc(f.id) + '" data-n="' + esc(f.name) + '"><div class="mp-t">' + (m ? '<b>EK' + m[1] + '</b> ' + m[2].slice(0, 5).toUpperCase() + ' · ' + m[3] + '→' + m[4] : '<b>' + esc(f.name) + '</b>') +
          (rost ? ' <span class="mp-b g">' + T('排班上有', 'on roster') + '</span>' : '') + (lib.has(f.name) ? ' <span class="mp-b">' + T('已在 iPad 上', 'on this iPad') + '</span>' : '') + '</div>' +
          '<div class="mp-s">' + esc(f.subject || '') + ' · ' + T('收到', 'received') + ' ' + when(f.t) + ' · ' + (f.size / 1e6).toFixed(1) + ' MB</div></div>'; }).join('')
        : '<div class="mp-e">' + T('最近 10 天邮箱里没有 OFP。在 Lido 里把 OFP 发到你的邮箱，再点上面的 ✕ 重新打开。', 'No OFP in the last 10 days. Email the OFP from Lido to yourself.') + '</div>');
    box.querySelectorAll('.mp-i').forEach(el => el.onclick = async () => {
      if (el.classList.contains('busy')) return; el.classList.add('busy'); const s0 = el.querySelector('.mp-s'); s0.textContent = '⏳ ' + T('下载中…（大文件要 10–30 秒）', 'Downloading… (10–30 s)');
      const a = await postK({ action: 'ofpget', id: el.dataset.id });
      if (!a.ok || !a.b64) { el.classList.remove('busy'); s0.textContent = '⚠️ ' + (a.error || T('下载失败', 'Download failed')); return; }
      s0.textContent = '⏳ ' + T('读取中…', 'Reading…');
      const bin = Uint8Array.from(atob(a.b64), c => c.charCodeAt(0));
      const ok = await useFile(new File([bin], el.dataset.n || 'ofp.pdf'), el.dataset.n);
      if (ok) { const k = ls('ofpk'); if (k) { const e = await get(k); if (e) { e.name = el.dataset.n; e.src = 'mail'; await put(e); } } box.classList.remove('open'); }
      else { el.classList.remove('busy'); s0.textContent = '⚠️ ' + T('这个文件读不出 OFP', 'Could not read an OFP from this file'); }
    });
  }
  let mailBusy = false, mailMsg = '';
  async function mail(quiet) {
    if (mailBusy) return; if (!navigator.onLine || !ls('key')) { mailMsg = !navigator.onLine ? T('离线', 'offline') : T('没填口令', 'no key'); menuRefresh(); if (!quiet) toast(mailMsg); return; }
    mailBusy = true; mailMsg = T('正在查邮箱…', 'Checking mail…'); menuRefresh();
    const post = body => fetch(clockUrl() + '?k=' + encodeURIComponent(ls('key')), { method: 'POST', body: JSON.stringify(body) }).then(r => r.text()).then(t => { try { return JSON.parse(t); } catch (e) { return { ok: false, error: t.slice(0, 120) }; } });
    let got = 0;
    try {
      const j = await post({ action: 'ofpmail', days: 4 });
      if (!j.ok) { mailMsg = /缺少航班|数据格式/.test(j.error || '') ? T('后台是旧版：请更新 Code.gs', 'Backend is old — update Code.gs') : '⚠️ ' + (j.error || ''); if (!quiet) toast(mailMsg, 5000); return; }
      const seen = new Set(JSON.parse(ls('mailseen') || '[]')), legs = j.legs || [];
      const mine = r => { const f = r.flight, std = r.times.std || f.dateUTC;
        if (!legs.length) return Math.abs(std - Date.now()) < 3 * 864e5;                       // 读不到排班：只看日期
        return legs.some(l => last4(l.digits) === last4(f.digits) && (l.dest === f.arrIata || l.dest === f.arr) && Math.abs(l.std - std) < 12 * 36e5); };
      const nameOk = n => { const m = LIDO.exec(n || ''); if (!m || !legs.length) return !!m; return legs.some(l => last4(l.digits) === last4(m[1]) && l.dest === m[4]); };
      for (const f of (j.files || []).filter(isOfp).slice(0, 8)) {
        if (seen.has(f.id) || !nameOk(f.name)) continue;
        mailMsg = T('下载 ', 'Downloading ') + f.name; menuRefresh();
        const a = await post({ action: 'ofpget', id: f.id }); if (!a.ok || !a.b64) continue;
        const bin = Uint8Array.from(atob(a.b64), c => c.charCodeAt(0));
        let text = ''; try { text = (await DOCR.readAny(new Blob([bin]), f.name, pdfText)).text; } catch (e) { continue; }   // PDF / Word / RTF / 文字都行
        const r = OFP.parse(text); seen.add(f.id);
        if (!r.ok || !mine(r)) continue;                                                       // 不是 OFP / 不是排班上的航班：不收
        await save(text, 'mail', f.name, r); got++;
      }
      ls('mailseen', JSON.stringify([...seen].slice(-200)));
      mailMsg = got ? '📧 ' + T('收到 ' + got + ' 份 OFP', got + ' OFP(s) received') : T('邮箱里没有新的 OFP', 'No new OFP in mail');
      if (got) { toast(mailMsg, 3500); await auto(); } else if (!quiet) toast(mailMsg, 2500);
    } catch (e) { mailMsg = T('没连上后台', 'Could not reach the backend'); if (!quiet) toast(mailMsg); }
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
  setInterval(() => mail(true), 15 * 60e3);
})();
