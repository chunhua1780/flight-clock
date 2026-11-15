/* 面试题库：每个题目在哪本手册哪一节（你整理的 Interview references）。
   资料是加密放在网站上的（AES-256-GCM，钥匙是你的口令），这台 iPad 用存着的口令解开，存在本机，离线可用。
   中文、英文都能搜：每条都有中文标题、中英文关键词和常见问法（联网用 AI 整理过）。有网时还可以「🤖 AI 找」。
   用主页面的全局：clockUrl, th, esc, toast */
(function () {
  'use strict';
  const lsGet = k => { try { return localStorage.getItem('fa.' + k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem('fa.' + k, v); } catch (e) {} };
  let D = null; try { D = JSON.parse(lsGet('ivdb') || 'null'); } catch (e) {}
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const T = (z, e) => typeof tt === 'function' ? tt(z, e) : z;   // 纯文字（用在输入框提示、状态行）

  async function load(force) {
    if (D && !force) return D;
    const pw = lsGet('key'); if (!pw) throw new Error(T('这台设备还没填口令', 'No password on this device'));
    const r = await fetch('data/iv.enc.json?_=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status);
    const e = await r.json(), enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(e.s), iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    let gz; try { gz = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(e.iv) }, key, b64(e.c)); } catch (x) { throw new Error(T('口令不对，解不开', 'Wrong password — cannot decrypt')); }
    const txt = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    D = JSON.parse(txt); lsSet('ivdb', txt); return D;
  }

  // ---------- 离线搜索 ----------
  const STOP = new Set('the a an of to in on for and or is are what how when where which who why do does you your with at by be if can should would about from as it this that we our i'.split(' '));
  const CJK = /[㐀-鿿]/;
  const stem = w => w.replace(/(ings?|ed|es|s)$/, '');
  function score(it, q) {
    const ql = q.toLowerCase().trim(); if (!ql) return 0;
    const en = (it.ev + ' ' + (it.kw || []).join(' ') + ' ' + it.loc).toLowerCase(), refs = it.refs.join(' ').toLowerCase(), qs = (it.q || []).join(' ').toLowerCase();
    const zh = (it.zh || '') + ' ' + (it.kz || []).join(' '), all = en + ' ' + refs + ' ' + qs + ' ' + zh.toLowerCase();
    let s = 0;
    if (all.indexOf(ql) >= 0) s += 12;                                         // 整句出现
    // 编号（8.3.20、21-52-05）
    (ql.match(/\d+(?:[.\-]\d+)+/g) || []).forEach(n => { if (refs.indexOf(n) >= 0 || en.indexOf(n) >= 0) s += 10; });
    // 英文词
    ql.split(/[^a-z0-9]+/).filter(w => w.length > 1 && !STOP.has(w)).forEach(w => { const st = stem(w);
      if (new RegExp('\\b' + st).test(it.ev.toLowerCase())) s += 6; else if (en.indexOf(st) >= 0) s += 4; else if (refs.indexOf(st) >= 0) s += 3; else if (qs.indexOf(st) >= 0) s += 1.5; });
    // 中文：关键词整个出现、再按两个字两个字比
    if (CJK.test(q)) {
      (it.kz || []).forEach(k => { if (k.length >= 2 && q.indexOf(k) >= 0) s += 6; });
      if (it.zh && q.indexOf(it.zh.split(/[ (（]/)[0]) >= 0) s += 6;
      const z = q.replace(/[^㐀-鿿A-Za-z0-9]/g, '');
      for (let i = 0; i < z.length - 1; i++) { const bg = z.slice(i, i + 2); if (!CJK.test(bg)) continue; if ((it.zh || '').indexOf(bg) >= 0) s += 2; else if (zh.indexOf(bg) >= 0) s += 1.2; else if (qs.indexOf(bg) >= 0) s += 0.6; }
    }
    return s;
  }
  function search(q) { if (!D) return []; return D.items.map(it => ({ it, s: score(it, q) })).filter(x => x.s >= 2).sort((a, b) => b.s - a.s).slice(0, 10); }

  // ---------- 联网：AI 找（意思相近也能找到） ----------
  async function aiFind(q) {
    const list = D.items.map(it => it.i + '|' + it.loc + '|' + it.ev + '|' + (it.zh || '') + '|' + it.refs.join('; ')).join('\n');
    const r = await fetch(clockUrl() + '?k=' + encodeURIComponent(lsGet('key')), { method: 'POST', body: JSON.stringify({ action: 'rank', q, list }) });
    const j = JSON.parse(await r.text()); if (!j.ok) throw new Error(j.error || 'AI'); return j.r || [];
  }

  // ---------- 界面 ----------
  function card(it, why) {
    return '<div class="ivc"><div class="ivh"><span class="ivloc">' + esc(it.loc) + '</span> <b>' + esc(it.ev) + '</b>' + (it.zh ? '<div class="ivzh">' + esc(it.zh) + '</div>' : '') + '</div>' +
      '<div class="ivref">' + it.refs.map(r => '📖 ' + esc(r)).join('<br>') + '</div>' + (why ? '<div class="ivwhy">🤖 ' + esc(why) + '</div>' : '') + '</div>';
  }
  async function open() {
    let ov = document.getElementById('ivov'); if (ov) ov.remove();
    ov = document.createElement('div'); ov.id = 'ivov';
    ov.innerHTML = '<div class="bar"><b style="font-size:16px">📚 ' + th('面试题库', 'Interview references') + '</b><span style="flex:1"></span><button class="btn sm" onclick="document.getElementById(\'ivov\').remove()">✕</button></div>' +
      '<div class="ivin"><div style="display:flex;gap:8px"><input id="ivq" placeholder="' + T('中文或英文，例如：低能见度起飞 / 机组喝酒 / bomb threat', 'Chinese or English, e.g. low visibility take-off') + '" style="flex:1;font-size:16px;padding:9px;border-radius:10px;border:1px solid var(--line);background:var(--input);color:var(--text)">' +
      '<button class="btn sm pri" id="ivai">🤖 ' + th('AI 找', 'AI search') + '</button></div><div id="ivst" class="small" style="color:var(--dim);margin:6px 2px"></div><div id="ivres"></div></div>';
    document.body.appendChild(ov);
    const st = document.getElementById('ivst'), res = document.getElementById('ivres'), qi = document.getElementById('ivq');
    try { if (!D) st.textContent = '⏳ ' + T('正在解开题库…', 'Decrypting…'); await load(false); st.textContent = T('共 ' + D.items.length + ' 条 · 离线可用', D.items.length + ' topics · works offline'); }
    catch (e) { st.textContent = '⚠️ ' + e.message + (navigator.onLine ? '' : ' · ' + T('第一次要联网打开', 'first time needs network')); return; }
    const show = () => { const q = qi.value; if (!q.trim()) { res.innerHTML = groups(); return; } const L = search(q); res.innerHTML = L.length ? L.map(x => card(x.it)).join('') : '<div class="small" style="color:var(--dim)">' + th('没找到。换个说法，或点「🤖 AI 找」（要联网）', 'Nothing found — rephrase or tap AI search (online)') + '</div>'; };
    qi.oninput = show; show(); qi.focus();
    document.getElementById('ivai').onclick = async () => {
      const q = qi.value.trim(); if (!q) return; if (!navigator.onLine) { toast(T('AI 找要联网', 'AI search needs network')); return; }
      st.textContent = '⏳ ' + T('AI 在找…', 'AI searching…');
      try { const r = await aiFind(q); const by = {}; D.items.forEach(it => by[it.i] = it);
        res.innerHTML = r.filter(x => by[x.i]).map(x => card(by[x.i], x.why)).join('') || th('AI 也没找到相关的', 'AI found nothing related'); st.textContent = '🤖 ' + T('AI 找到的（按相关程度）', 'AI results (most relevant first)'); }
      catch (e) { st.textContent = '⚠️ ' + e.message; }
    };
  }
  // 没输入时：按阶段列出全部
  function groups() {
    const g = {}; D.items.forEach(it => (g[it.loc] = g[it.loc] || []).push(it));
    return Object.keys(g).map(k => '<details><summary><b>' + esc(k) + '</b> · ' + g[k].length + '</summary>' + g[k].map(it => card(it)).join('') + '</details>').join('');
  }
  window.IVDB = { open, load, search };
})();
