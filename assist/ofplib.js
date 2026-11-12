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
      const nameOk = n => { const m = /EK\.?\s?(\d{3,4})\.(\d{2}[A-Za-z]{3}\d{4})\.([A-Z]{3})\.([A-Z]{3})/.exec(n || ''); if (!m || !legs.length) return true; return legs.some(l => last4(l.digits) === last4(m[1]) && l.dest === m[4]); };
      for (const f of (j.files || []).slice(0, 8)) {
        if (seen.has(f.id) || !nameOk(f.name)) continue;
        mailMsg = T('下载 ', 'Downloading ') + f.name; menuRefresh();
        const a = await post({ action: 'ofpget', id: f.id }); if (!a.ok || !a.b64) continue;
        const bin = Uint8Array.from(atob(a.b64), c => c.charCodeAt(0));
        let text = ''; try { text = await pdfText(bin.buffer); } catch (e) { continue; }
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
      '<div class="ob"><button class="btn sm" onclick="OFL.mail()">📧 ' + T('检查邮箱', 'Check mail') + '</button><button class="btn sm" onclick="openLoad();OFL.menu(false)">＋ ' + T('载入 / 粘贴', 'Load / paste') + '</button></div>' +
      (mailMsg ? '<div class="om2">' + esc(mailMsg) + '</div>' : '');
    m.classList.add('open');
  }
  async function remove(k) { if (!confirm(T('从这台 iPad 删除这份 OFP？', 'Remove this OFP from this iPad?'))) return; await del(k); if (ls('ofpk') === k) ls('ofpk', ''); menu(true); }

  window.OFL = { save, activate, auto, mail, menu, remove, all, keyOf, remember, snap, get };
  document.addEventListener('click', e => { if (open && !e.target.closest('#ofpmenu') && !e.target.closest('#t-fl')) menu(false); });
  window.addEventListener('online', () => mail(true));
  setTimeout(() => { auto(); mail(true); }, 5000);
  setInterval(() => { auto(); }, 5 * 60e3);
  setInterval(() => mail(true), 15 * 60e3);
})();
