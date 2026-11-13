/* Flight Clock — 背景场景
 * 按「城市 + 当地太阳位置 + 天气」挑选背景照片，再叠加时段色调和天气动画（雨、雪、雷、雾、沙尘）。
 * 照片放在 bg/ 目录；没有照片的城市先试维基百科的城市照片，再不行用渐变天空。
 */
(function () {
  'use strict';
  const RAD = Math.PI / 180;

  // ---------- 太阳高度角（度） ----------
  function sunAlt(lat, lon, t) {
    const d = t / 864e5 - 10957.5;                       // J2000 起的天数
    const g = (357.529 + 0.98560028 * d) * RAD;
    const q = 280.459 + 0.98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
    const e = (23.439 - 0.00000036 * d) * RAD;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD;
    const dec = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = 18.697374558 + 24.06570982441908 * d;
    const H = (((gmst * 15 + lon - ra) % 360) + 360) % 360 * RAD;
    return Math.asin(Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(H)) / RAD;
  }
  // night / dawn / morning / day / evening / dusk
  function phaseOf(lat, lon, t) {
    const a = sunAlt(lat, lon, t), rising = sunAlt(lat, lon, t + 6e5) > a;
    if (a < -7) return 'night';
    if (a < 6) return rising ? 'dawn' : 'dusk';
    if (a < 16) return rising ? 'morning' : 'evening';
    return 'day';
  }

  // ---------- 天气分类 ----------
  // w: {code, vis(米), dust(μg/m³), pm10}
  function weatherCat(w) {
    if (!w || w.code == null) return 'clear';
    const c = w.code;
    if (w.dust != null && (w.dust >= 150 || (w.pm10 >= 250 && (w.vis == null || w.vis < 5000)))) return 'dust';
    if (c >= 95) return 'storm';
    if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
    if (c === 45 || c === 48 || (w.vis != null && w.vis < 1000)) return 'fog';
    if (w.dust != null && w.dust >= 60) return 'haze';
    if (c === 3) return 'overcast';
    if (c === 2) return 'cloudy';
    return 'clear';
  }
  const CAT_ZH = { dust: 'Dust storm', haze: 'Hazy' };

  // ---------- 照片库 ----------
  // pos = 照片的取景中心（分屏时保证地标在画面里）
  const LIB = {
    DXB: {
      alias: ['DWC', 'SHJ'],
      img: {
        dawn: { f: 'dxb-dawn.jpg', pos: '30% 50%' },
        day: { f: 'dxb-day.jpg', pos: '54% 40%' },
        dusk: { f: 'dxb-dusk.jpg', pos: '50% 50%' },
        night: { f: 'dxb-night.jpg', pos: '58% 45%' },
        dust: { f: 'dxb-dust.jpg', pos: '48% 50%' },
        overcast: { f: 'dxb-haze.jpg', pos: '51% 40%' },
        rain: { f: 'dxb-rain.jpg', pos: '68% 40%' },
      }
    },
    CAN: {
      alias: [],
      img: {
        day: { f: 'can-day.jpg', pos: '50% 45%' },
        dusk: { f: 'can-dusk.jpg', pos: '22% 50%' },
        night: { f: 'can-night.jpg', pos: '46% 45%' },
        overcast: { f: 'can-rain.jpg', pos: '28% 50%' },
        rain: { f: 'can-rain.jpg', pos: '28% 50%' },
        fog: { f: 'can-rain.jpg', pos: '28% 50%' },
      }
    }
  };
  let CREDITS = {};
  function libFor(code) {
    if (LIB[code]) return LIB[code];
    for (const k in LIB) if (LIB[k].alias.includes(code)) return LIB[k];
    return null;
  }

  // 天气专用照片只在白天用；晚上用夜景照片 + 天气动画
  const WX_KEYS = { dust: ['dust'], haze: [], fog: ['fog', 'overcast'], overcast: ['overcast'],
    rain: ['rain', 'overcast'], storm: ['storm', 'rain', 'overcast'], snow: ['snow', 'overcast'] };
  const PHASE_KEYS = { night: ['night', 'dusk', 'day'], dawn: ['dawn', 'dusk', 'day'], dusk: ['dusk', 'dawn', 'day'],
    morning: ['day', 'dawn'], evening: ['day', 'dusk'], day: ['day'] };

  function pick(code, phase, cat) {
    const lib = libFor(code);
    if (!lib) return null;
    const I = lib.img;
    let key = null;
    if (phase !== 'night' && WX_KEYS[cat]) key = WX_KEYS[cat].find(k => I[k]) || null;
    if (!key) key = PHASE_KEYS[phase].find(k => I[k]) || null;
    return key ? Object.assign({ key }, I[key]) : null;
  }

  // ---------- 维基百科城市照片（没有自带照片的城市） ----------
  const wikiMem = {}, wikiOk = {};
  function wikiImage(city, cb) {
    if (!city) return cb(null);
    const k = 'fc.wiki.' + city;
    if (wikiMem[city] !== undefined) return cb(wikiMem[city]);
    try { const c = localStorage.getItem(k); if (c) { wikiMem[city] = c === '-' ? null : c; return cb(wikiMem[city]); } } catch (e) {}
    wikiMem[city] = null;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tm = ctl && setTimeout(() => ctl.abort(), 8000);
    fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(city.replace(/ /g, '_')), ctl ? { signal: ctl.signal } : {})
      .then(r => r.json()).then(j => {
        const src = (j.originalimage && j.originalimage.width >= 1200 && j.originalimage.width > j.originalimage.height) ? j.originalimage.source : null;
        wikiMem[city] = src;
        try { localStorage.setItem(k, src || '-'); } catch (e) {}
        cb(src);
      }).catch(() => cb(null)).finally(() => tm && clearTimeout(tm));
  }

  // ---------- 渐变天空（最后的兜底） ----------
  const SKY = {
    night: 'linear-gradient(180deg,#03050c 0%,#0a1430 55%,#1b2340 100%)',
    dawn: 'linear-gradient(180deg,#1d2350 0%,#7a5a8c 45%,#f0a27a 85%,#f6c58e 100%)',
    morning: 'linear-gradient(180deg,#3d79b8 0%,#8db8de 60%,#f2d9b0 100%)',
    day: 'linear-gradient(180deg,#2f6db3 0%,#6aa4d8 55%,#b9d6ee 100%)',
    evening: 'linear-gradient(180deg,#3a5f9a 0%,#c98f6e 70%,#f0b27a 100%)',
    dusk: 'linear-gradient(180deg,#141838 0%,#5a3a6e 45%,#d7704e 85%,#f2a35c 100%)'
  };

  // ---------- 天气粒子动画 ----------
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fxList = new Set();
  let raf = 0, lastT = 0;
  function makeParticles(type, w, h) {
    const n = type === 'rain' || type === 'storm' ? Math.round(w * h / 9000) : type === 'snow' ? Math.round(w * h / 16000) : type === 'dust' ? Math.round(w * h / 5000) : 0;
    const P = [];
    for (let i = 0; i < Math.min(n, 400); i++) P.push({ x: Math.random() * w, y: Math.random() * h, z: Math.random() * 0.7 + 0.3, s: Math.random() });
    return P;
  }
  function stepFx(fx, dt) {
    const c = fx.canvas, g = fx.ctx, w = c.width, h = c.height, k = fx.dpr;
    g.clearRect(0, 0, w, h);
    const t = fx.type;
    if (t === 'rain' || t === 'storm') {
      g.strokeStyle = fx.night ? 'rgba(200,215,240,.38)' : 'rgba(225,235,250,.45)';
      g.lineWidth = 1.1 * k; g.beginPath();
      for (const p of fx.P) {
        const v = (900 + 700 * p.z) * k * dt, len = (14 + 18 * p.z) * k;
        p.y += v; p.x += v * 0.18;
        if (p.y > h) { p.y = -len; p.x = Math.random() * w * 1.1 - w * 0.1; }
        g.moveTo(p.x, p.y); g.lineTo(p.x - len * 0.18, p.y - len);
      }
      g.stroke();
      if (t === 'storm') {
        fx.flashIn -= dt;
        if (fx.flashIn <= 0) { fx.flash = 1; fx.flashIn = 5 + Math.random() * 12; }
        if (fx.flash > 0) { g.fillStyle = 'rgba(235,240,255,' + (0.55 * fx.flash) + ')'; g.fillRect(0, 0, w, h); fx.flash -= dt * (fx.flash > 0.6 ? 2.5 : 5); }
      }
    } else if (t === 'snow') {
      g.fillStyle = 'rgba(255,255,255,.85)';
      for (const p of fx.P) {
        p.y += (25 + 45 * p.z) * k * dt; p.x += Math.sin((p.y / k + p.s * 600) / 60) * 12 * k * dt;
        if (p.y > h) { p.y = -4; p.x = Math.random() * w; }
        g.beginPath(); g.arc(p.x, p.y, (1 + 2.2 * p.z) * k, 0, 6.283); g.fill();
      }
    } else if (t === 'dust') {
      for (const p of fx.P) {
        p.x += (90 + 260 * p.z) * k * dt; p.y += Math.sin((p.x / k + p.s * 900) / 90) * 10 * k * dt;
        if (p.x > w) { p.x = -4; p.y = Math.random() * h; }
        g.fillStyle = 'rgba(214,160,92,' + (0.18 + 0.35 * p.z) + ')';
        g.fillRect(p.x, p.y, (1 + 2 * p.z) * k, (1 + 1.2 * p.z) * k);
      }
    }
  }
  function loop(ts) {
    raf = 0;
    if (document.hidden || !fxList.size) return;
    const dt = Math.min(0.1, lastT ? (ts - lastT) / 1000 : 0.016);
    if (ts - lastT >= 30) {           // 约 30 帧/秒，省电
      lastT = ts;
      fxList.forEach(fx => { if (fx.canvas.isConnected && fx.canvas.offsetWidth) stepFx(fx, dt); });
    }
    raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf && !reduce) { lastT = 0; raf = requestAnimationFrame(loop); } }
  document.addEventListener('visibilitychange', kick);

  function setFx(sc, type, night) {
    const canvas = sc.querySelector('.sc-fx');
    let fx = sc._fx;
    if (!type || reduce) { if (fx) { fxList.delete(fx); sc._fx = null; } canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); return; }
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.round(canvas.offsetWidth * dpr), h = Math.round(canvas.offsetHeight * dpr);
    if (!fx || fx.type !== type || canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      if (fx) fxList.delete(fx);
      fx = sc._fx = { canvas, ctx: canvas.getContext('2d'), type, dpr, P: makeParticles(type, w, h), flash: 0, flashIn: 3 + Math.random() * 6, night };
      fxList.add(fx);
    }
    fx.night = night;
    kick();
  }

  // ---------- 场景 ----------
  function ensure(el) {
    if (!el.querySelector('.sc-img')) {
      el.innerHTML = '<div class="sc-img"></div><div class="sc-tint"></div><div class="sc-fog"></div><canvas class="sc-fx"></canvas><div class="sc-shade"></div>';
    }
  }
  // 返回 {credit, cat, phase}
  function update(el, code, ap, w, now, phaseOverride) {
    ensure(el);
    const phase = PHASE_KEYS[phaseOverride] ? phaseOverride : ap ? phaseOf(ap.lat, ap.lon, now) : 'day';
    const cat = weatherCat(w);
    const night = phase === 'night';
    let p = pick(code, phase, cat);
    let url = null, pos = '50% 50%', key = null, remote = null;
    // 图片库（每天换）优先；加载失败就用内置照片
    if (remoteFn && ap && ap.city) {
      remote = remoteFn(ap.city, phase, cat, () => update(el, code, ap, w, Date.now(), phaseOverride));
      if (remote && remote.failed) remote = null;
    }
    if (remote) {
      url = remote.url; p = null;
      // 搜索词里没有时段词（ph === false）时当作白天照片，让下面的逻辑按实际时段调暗或加暖色
      const phaseKey = remote.ph === false ? 'day' : (phase === 'night' ? 'night' : phase === 'dawn' || phase === 'dusk' ? phase : 'day');
      key = remote.wx ? cat : phaseKey;
      if (remote.wx && remote.ph === false && phase === 'night') key = 'day';
    }
    else if (p) { url = 'bg/' + p.f; pos = p.pos || pos; key = p.key; }
    else if (ap && ap.city) {
      const mem = wikiMem[ap.city];
      if (mem === undefined) wikiImage(ap.city, () => update(el, code, ap, w, Date.now(), phaseOverride));
      else if (mem) {   // 维基照片不知道是白天还是晚上：先检查，和当前时段对得上才用
        const vk = mem + '|' + phase + '|' + cat;
        if (phase === 'night') { url = mem; key = 'day'; }   // 晚上：照旧把白天照片调暗当夜景
        else if (wikiOk[vk] === true) { url = mem; key = 'day'; }
        else if (wikiOk[vk] === undefined && verifyFn) { wikiOk[vk] = 'pending'; verifyFn(mem, phase, cat).then(ok => { wikiOk[vk] = !!ok; if (ok) update(el, code, ap, w, Date.now(), phaseOverride); }).catch(() => { wikiOk[vk] = false; }); }
      }
    }
    // 时段色调：照片和实际时段不一致时补偿
    let filter = '', tint = '';
    if (url) {
      // 白天照片当夜景用：调暗 + 夜空蓝 + 底部一层暖光（像城市灯光）
      if (night && key !== 'night') { filter = 'brightness(.5) saturate(.75) contrast(1.1) hue-rotate(-6deg)'; tint = 'linear-gradient(180deg,rgba(6,12,40,.62) 0%,rgba(8,14,40,.42) 55%,rgba(255,170,80,.16) 100%)'; }
      else if ((phase === 'dawn' || phase === 'dusk') && key !== 'dawn' && key !== 'dusk' && key !== 'night') {
        filter = 'brightness(.7) saturate(1.1)';
        tint = phase === 'dawn' ? 'linear-gradient(180deg,rgba(60,50,120,.45),rgba(250,150,110,.30))' : 'linear-gradient(180deg,rgba(50,30,90,.45),rgba(240,120,70,.35))';
      }
      else if (phase === 'morning' && key === 'day') tint = 'linear-gradient(180deg,rgba(255,200,150,.10),rgba(255,170,100,.18))';
      else if (phase === 'evening' && key === 'day') tint = 'linear-gradient(180deg,rgba(255,170,110,.12),rgba(240,120,60,.24))';
    }
    // 天气滤镜（照片本身不是这种天气时）
    const wxImg = key && (key === cat || (cat === 'haze' && key === 'dust') || (WX_KEYS[cat] && WX_KEYS[cat].includes(key) && key !== 'day'));
    if (!wxImg) {
      if (cat === 'overcast' || cat === 'rain' || cat === 'storm' || cat === 'snow') filter += night ? ' grayscale(.3)' : ' grayscale(.45) brightness(.82)';   // 晚上已经调暗，别再压暗
      else if (cat === 'cloudy') filter += ' saturate(.85)';
      else if (cat === 'dust') filter += ' sepia(.75) saturate(1.3) brightness(.85) contrast(.8)';
      else if (cat === 'haze') filter += ' sepia(.35) contrast(.9)';
      else if (cat === 'fog') filter += ' contrast(.7) brightness(1.05)';
    }
    if (cat === 'dust') tint = 'linear-gradient(180deg,rgba(196,140,70,.45),rgba(170,110,50,.35))' + (tint ? ',' + tint : '');
    if (cat === 'haze') tint = 'linear-gradient(180deg,rgba(210,170,110,.25),rgba(190,150,90,.15))' + (tint ? ',' + tint : '');
    if (cat === 'storm') tint = 'linear-gradient(180deg,rgba(20,25,40,.45),rgba(20,25,40,.2))' + (tint ? ',' + tint : '');
    // 温度：很热偏暖、很冷偏冷（很淡）
    const temp = w && w.temp != null ? w.temp : null;
    if (temp != null && temp >= 38 && !night) tint = 'linear-gradient(180deg,rgba(255,180,100,.14),rgba(255,150,70,.08))' + (tint ? ',' + tint : '');
    else if (temp != null && temp <= 5) { tint = 'linear-gradient(180deg,rgba(150,190,255,.16),rgba(170,200,255,.10))' + (tint ? ',' + tint : ''); filter += ' saturate(.85)'; }

    const bg = url ? 'url("' + url + '")' : SKY[phase];
    const sig = [bg, pos, filter, tint, cat].join('|');
    if (el.dataset.sig !== sig) {
      el.dataset.sig = sig;
      // 一定要有一层照片（以前两次换图挤在一起时会被全部删掉 → 屏幕黑）
      let img = el.querySelector('.sc-img');
      if (!img) { img = document.createElement('div'); img.className = 'sc-img'; el.insertBefore(img, el.firstChild); }
      // 还没有任何照片时，先放这个时段的天空颜色，不让它黑着
      if (!img.style.backgroundImage || img.style.backgroundImage === 'none') { img.style.backgroundImage = SKY[phase]; img.classList.add('on'); }
      const apply = (layer) => { layer.style.backgroundPosition = pos; layer.style.filter = filter.trim(); el.querySelector('.sc-tint').style.background = tint || 'none';
        el.querySelector('.sc-fog').style.opacity = cat === 'fog' ? '1' : cat === 'haze' || cat === 'dust' ? '.45' : '0'; el.dataset.cat = cat; el.dataset.phase = phase; };
      // 过渡：新照片先在后台下载好，再淡入盖在旧照片上，淡入完成后只删掉「之前的」旧照片；没下载好就继续显示旧的
      const swapIn = (bgv) => {
        if (el.dataset.sig !== sig) return;                       // 过期的就不用了
        const olds = [...el.querySelectorAll('.sc-img')];
        const nu = document.createElement('div'); nu.className = 'sc-img'; nu.style.backgroundImage = bgv;
        el.insertBefore(nu, olds.length ? olds[olds.length - 1].nextSibling : el.firstChild);
        apply(nu);
        requestAnimationFrame(() => requestAnimationFrame(() => nu.classList.add('on')));
        setTimeout(() => olds.forEach(x => { if (x.parentNode && el.querySelectorAll('.sc-img').length > 1) x.remove(); }), 2400);
      };
      if (url) {
        const im = new Image();
        im.onload = () => {
          // iPad 有时下载完了图却是空的：确认真的有尺寸
          if (!im.naturalWidth) return im.onerror();
          const go = () => swapIn(bg);
          if (im.decode) im.decode().then(go, go); else go();       // 解码好再换，避免换的瞬间闪黑
        };
        im.onerror = () => {
          if (el.dataset.sig !== sig) return;
          if (remote) { remote.failed = true; el.dataset.sig = ''; update(el, code, ap, w, Date.now(), phaseOverride); return; }
          swapIn(SKY[phase]);
        };
        im.src = url;
      } else swapIn(bg);
    }
    setFx(el, cat === 'rain' ? 'rain' : cat === 'storm' ? 'storm' : cat === 'snow' ? 'snow' : cat === 'dust' ? 'dust' : null, night);
    let credit = null;
    if (remote) credit = remote.credit;
    else if (p) credit = CREDITS[p.f] || null;
    else if (url) credit = { by: 'Wikipedia', license: 'CC' };
    return { credit, cat, phase };
  }
  function clear(el) {
    if (el._fx) { fxList.delete(el._fx); el._fx = null; }
  }

  // 照片署名
  fetch('bg/credits.json').then(r => r.json()).then(j => { CREDITS = Object.assign(j, CREDITS); }).catch(() => {});
  // 内置城市照片库：bg/lib.json  { "LHR": { "f": "lhr.jpg", "pos": "50% 50%", "credit": {...} }, ... }（每个城市一张白天照片）
  fetch('bg/lib.json').then(r => r.json()).then(j => {
    for (const code in j) {
      const e = j[code];
      if (!LIB[code]) LIB[code] = { alias: e.alias || [], img: { day: { f: e.f, pos: e.pos || '50% 50%' } } };
      if (e.credit) CREDITS[e.f] = e.credit;
    }
  }).catch(() => {});

  let remoteFn = null, verifyFn = null;
  window.Scene = { setRemote: fn => { remoteFn = fn; }, setVerify: fn => { verifyFn = fn; }, update, clear, weatherCat, phaseOf, sunAlt, CAT_ZH, LIB };
})();
