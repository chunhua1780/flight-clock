/* 实时天气 + ATIS（有网时）：收到 OFP 后、之后每 15 分钟，从时钟后台取起飞 / 目的地 / 备降场的最新 METAR、TAF，
   有 D-ATIS 的机场（目前只有美国大机场）再取 ATIS，读出正在用的跑道。没网就用 OFP 里的，照常离线。
   用主页面的全局：S, lsGet, lsSet, clockUrl, th, thb, esc, hmZ, WX, atP, MIN, candidates, assess, renderList */
(function () {
  'use strict';
  let L = null; try { L = JSON.parse(lsGet('live') || 'null'); } catch (e) {}
  const keyOf = () => S.ofp ? S.ofp.flight.no + S.ofp.flight.date : '';
  const cur = () => (L && L.k === keyOf() && L.ap) || null;
  const stripM = s => String(s || '').replace(/^(METAR|SPECI)\s+(COR\s+)?[A-Z]{4}\s+/, '');
  const stripT = s => String(s || '').replace(/^TAF\s+((AMD|COR)\s+)?[A-Z]{4}\s+/, '');
  let busy = false, err = '';

  async function fetchLive(force) {
    const o = S.ofp; if (!o || busy || !navigator.onLine || !lsGet('key')) return;
    if (!force && L && L.k === keyOf() && Date.now() - L.t < 15 * 60e3) return;
    const ids = [o.flight.dep, o.flight.arr].concat((o.alternates || []).map(a => a.icao)).filter((x, i, a) => x && a.indexOf(x) === i).slice(0, 10);
    busy = true;
    try {
      const r = await fetch(clockUrl() + '?k=' + encodeURIComponent(lsGet('key')), { method: 'POST', body: JSON.stringify({ action: 'live', icaos: ids }) });
      const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = { ok: false, error: t.slice(0, 80) }; }
      if (j.ok && j.ap) { L = { k: keyOf(), t: Date.now(), ap: j.ap }; lsSet('live', JSON.stringify(L)); err = ''; if (typeof lastList !== 'undefined') lastList = 0; renderList(true); }
      else err = /unknown|action|未知/i.test(j.error || '') || !j.error ? 'old' : j.error;
    } catch (e) { err = 'net'; }
    busy = false;
  }

  // ATIS 文字里正在用的跑道：落地（ILS/APCH/LDG/ARR…）和起飞（DEPG/DEP/TKOF…）分开
  function atisRwy(tx) {
    const T = ' ' + String(tx || '').toUpperCase().replace(/\b(?:RUNWAYS?|RWYS?|RYS?)\b/g, 'RWY') + ' ';
    const grab = re => { const out = []; let m; const r = new RegExp(re.source, 'g');
      while ((m = r.exec(T))) (m[1].match(/\b\d{1,2}[LRC]?\b/g) || []).forEach(x => { x = x.length === 1 || /^\d[LRC]$/.test(x) ? '0' + x : x; if (out.indexOf(x) < 0) out.push(x); });
      return out; };
    const LIST = /RWY\s*((?:\d{1,2}[LRC]?(?:\s*(?:,|AND|&|\/|OR)\s*(?:RWY\s*)?)?)+)/;
    const arr = grab(new RegExp('(?:ILS|RNAV|RNP|GLS|VOR|LOC|VISUAL|VIS|APCH|APPROACH|APPS?|LDG|LNDG|LANDING|ARRIVALS?|ARR)[^.]{0,40}?' + LIST.source));
    const dep = grab(new RegExp('(?:DEPG|DEPARTING|DEPARTURES?|DEPS?|TKOF|TAKE ?OFF)[^.]{0,30}?' + LIST.source));
    if (!arr.length && !dep.length) { const all = grab(LIST); return { arr: all, dep: all }; }
    return { arr, dep };
  }
  function atisOf(icao, kind) {   // kind: 'arr' / 'dep'
    const a = cur() && cur()[icao]; if (!a || !a.atis || !a.atis.length) return null;
    const x = a.atis.find(z => z.type === kind) || a.atis.find(z => z.type === 'combined') || a.atis[0];
    return { code: x.code, time: x.time, text: x.text, rwy: atisRwy(x.text)[kind] || [] };
  }
  const same = (a, b) => String(a).replace(/^0/, '') === String(b).replace(/^0/, '');

  // 给 assess() 用：最新的 METAR / TAF（解析好的）
  function wx(icao) {
    const a = cur() && cur()[icao]; if (!a) return null;
    const now = Date.now();
    return { M: a.m ? WX.metar(stripM(a.m), now) : null, T: a.t ? WX.taf(stripT(a.t), now) : null, mt: a.mt, tt: a.tt };
  }
  // 给 assess() 用：ATIS 跑道（只在 3 小时以内用，ATIS 说的是现在）
  function pickRwy(rw, icao, t, kind) {
    if (!rw || !rw.all || Math.abs(t - Date.now()) > 3 * 3600e3) return;
    const A = atisOf(icao, kind); if (!A || !A.rwy.length) return;
    const e = rw.all.find(x => A.rwy.some(r => same(r, x.id))); if (e) { rw.pick = e; rw.atis = A.code || 'ATIS'; }
  }
  // 机场卡片里的一行：ATIS / 实时天气
  function line(icao, kind) {
    const A = atisOf(icao, kind), a = cur() && cur()[icao];
    if (A) return '<div class="small">📻 <b>ATIS ' + esc(A.code || '') + ' ' + esc(A.time || '') + 'Z</b> · ' + th('落地', 'ARR') + ' ' + (atisRwy(A.text).arr.join(' ') || '—') + ' · ' + th('起飞', 'DEP') + ' ' + (atisRwy(A.text).dep.join(' ') || '—') + '</div>';
    if (a && (a.m || a.t)) return '<div class="small" style="color:var(--dim)">🌐 ' + th('实时天气', 'Live WX') + (a.mt ? ' METAR ' + hmZ(a.mt).slice(0, 4) + 'Z' : '') + (a.t ? ' · TAF' : '') + ' · ' + th('这个机场网上没有 ATIS', 'no online ATIS here') + '</div>';
    return '';
  }

  // 目的地预达时的影响：天气、跑道风、NOTAM、ATIS —— 放在最上面
  function impact(compact) {
    const o = S.ofp; if (!o) return '';
    const c = candidates().find(x => x.icao === o.flight.arr); if (!c) return '';
    const eta = S.atd ? atP(o.times.trip) : o.times.sta, a = assess(c, eta), pk = a.rw && a.rw.pick, it = [];
    const add = (lv, zh, en) => it.push({ lv, zh, en });
    if (!a.w || a.src === 'none') add('amber', '预报没有覆盖预达时间 ' + hmZ(eta), 'No forecast covering ETA ' + hmZ(eta));
    else { const z = WX.say(a.w, 'zh'), e = WX.say(a.w, 'en'); add(a.rate === 'red' ? 'red' : a.rate === 'amber' ? 'amber' : 'ok', z.join('；'), e.join('; ')); }
    if (pk && pk.head != null) {
      const g = a.w && a.w.main && a.w.main.wind && a.w.main.wind.gust;
      if (pk.tail > 15) add('red', '跑道 ' + pk.id + ' 顺风 ' + pk.tail + ' 节（超过 15）', 'RWY ' + pk.id + ' tailwind ' + pk.tail + ' kt (>15)');
      else if (pk.tail > 10) add('amber', '跑道 ' + pk.id + ' 顺风 ' + pk.tail + ' 节', 'RWY ' + pk.id + ' tailwind ' + pk.tail + ' kt');
      if (pk.cross > 35) add('red', '跑道 ' + pk.id + ' 侧风 ' + pk.cross + ' 节（很大）', 'RWY ' + pk.id + ' crosswind ' + pk.cross + ' kt (strong)');
      else if (pk.cross > 25) add('amber', '跑道 ' + pk.id + ' 侧风 ' + pk.cross + ' 节', 'RWY ' + pk.id + ' crosswind ' + pk.cross + ' kt');
      if (g && g >= 25) add('amber', '阵风 ' + g + ' 节', 'Gusts ' + g + ' kt');
    }
    a.notes.filter(n => n.lv !== 'info').slice(0, 4).forEach(n => add(n.lv, n.zh, n.en || n.zh));
    const worst = it.some(x => x.lv === 'red') ? 'red' : it.some(x => x.lv === 'amber') ? 'amber' : 'ok';
    if (compact && worst === 'ok') return '';
    const col = { red: 'var(--red)', amber: 'var(--amber)', ok: 'var(--green)' }[worst];
    const src = cur() && cur()[o.flight.arr] && (cur()[o.flight.arr].t || cur()[o.flight.arr].m) ? '🌐 ' + th('实时预报', 'live forecast') + ' ' + hmZ(L.t).slice(0, 4) + 'Z' : '📄 ' + th('OFP 里的预报', 'OFP forecast') + (err === 'old' ? ' · ' + th('后台要更新才能查实时', 'update the backend for live data') : navigator.onLine ? '' : ' · ' + th('离线', 'offline'));
    return '<div class="ap" style="border-left:5px solid ' + col + ';cursor:default"><div class="h"><span class="id">🛬 ' + esc(o.flight.arr) + '</span><span style="flex:1">' + th('预达 ', 'ETA ') + hmZ(eta) + ' ' + th('时的影响', 'impact') + '</span>' +
      '<span class="small" style="cursor:pointer" onclick="event.stopPropagation();LIVE.fetch(true)">⟳</span></div>' +
      (pk ? '<div class="small"><b>' + (a.rw.atis ? 'ATIS ' + esc(a.rw.atis) + ' · ' + th('在用跑道', 'RWY in use') : th('预计跑道', 'Expected RWY')) + ' ' + esc(pk.id) + '</b>' + (pk.head != null ? ' · ' + th('逆风', 'head') + ' ' + pk.head + ' / ' + th('侧风', 'cross') + ' ' + pk.cross + (pk.tail ? ' / ' + th('顺风', 'tail') + ' ' + pk.tail : '') : '') + '</div>' : '') +
      it.map(x => '<div class="' + (x.lv === 'red' ? 't-red' : x.lv === 'amber' ? 't-amber' : '') + '" style="margin-top:3px">' + (x.lv === 'ok' ? '☁︎ ' : '● ') + thb(esc(x.zh), esc(x.en)) + '</div>').join('') +
      line(o.flight.arr, 'arr') + '<div class="small" style="color:var(--dim);margin-top:3px">' + src + '</div></div>';
  }

  window.LIVE = { fetch: fetchLive, wx, pickRwy, line, impact, atisRwy };
  window.addEventListener('online', () => fetchLive(false));
  setInterval(() => fetchLive(false), 5 * 60e3);
})();
