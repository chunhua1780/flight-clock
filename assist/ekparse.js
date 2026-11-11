/* 公司机场授权表（OMA 12.2.5 Aerodrome Authorisation Table）解析
   直接粘贴手册里复制出来的表（每格一行）即可。数据只保存在这台设备上。 */
(function (root) {
  'use strict';
  const TYPES = ['A319', 'A350', 'A380', '777-200LR', '777-300ER', '777-300ERSF', '777F'];
  const CAT = /^(D|A1|A2|CA|EA|X|-{2,3}|–|—)$/;
  const REG = /^(ASIA|NAT|NAM|EUR|AFI|MID|PAC|CAR|SAM)$/;
  const SKIP = /^(ICAO|IATA|AERODROME|A319|A350|A380|777-200LR|777-300ER|777-300ERSF|777F|REGION|AIRFIELD CATEGORY|Remarks|Aerodrome not evaluated.*|EK Operations temporarily suspended\.?|\* ACN\/PCN.*|-{3}\s+Aerodrome not evaluated.*|X\s+EK Operations.*|12\.2\.\d.*)$/i;
  const normCat = c => /^(-+|–|—)$/.test(c) ? '-' : c;
  // 备注里写明按 UTC 时段变化的类别
  function timeWindow(rem) {
    let m = /(?:AVBL|Avbl as)\s+(A1|A2)\s+(\d{4})\s*[–-]\s*(\d{4})\s*UTC,?\s*other times\s+(CA|EA)/i.exec(rem);
    if (m) return { from: hm(m[2]), to: hm(m[3]), in: m[1].toUpperCase(), out: m[4].toUpperCase(), only: m[1].toUpperCase(), txt: m[1] + ' ' + m[2] + '–' + m[3] + 'Z，其他时间 ' + m[4] };
    m = /Downgraded to\s+(CA|EA)\s+(\d{4})\s*[–-]\s*(\d{4})\s*Z/i.exec(rem);
    if (m) return { from: hm(m[2]), to: hm(m[3]), in: m[1].toUpperCase(), out: null, only: null, txt: '每天 ' + m[2] + '–' + m[3] + 'Z 降为 ' + m[1] };
    return null;
  }
  const hm = s => +s.slice(0, 2) * 60 + +s.slice(2);
  const SIDS = /SIDs( and STARs)? for this airport are not available in B777 FMC.*$/i;

  function parseRaw(text) {
    let L = text.replace(/\r/g, '').split('\n').map(s => s.replace(/ /g, ' ').trim());
    const cut = L.findIndex(l => /^12\.2\.6\b/.test(l));               // 后面是按字母排的重复表
    if (cut > 0) L = L.slice(0, cut);
    L = L.filter(l => l && !SKIP.test(l));
    const ap = {}, bad = [];
    const isStart = i => /^[A-Z]{4}$/.test(L[i]) && /^([A-Z]{3}|No IATA code)$/i.test(L[i + 1] || '') && L[i + 2] != null && CAT.test(L[i + 3] || '');
    let i = 0;
    while (i < L.length) {
      if (!isStart(i)) { i++; continue; }
      const icao = L[i], iata = /^No IATA/i.test(L[i + 1]) ? '' : L[i + 1], name = L[i + 2];
      let j = i + 3; const c = [];
      while (c.length < 7 && CAT.test(L[j] || '')) c.push(normCat(L[j++]));
      if (c.length !== 7) { bad.push(icao); i++; continue; }
      const reg = REG.test(L[j] || '') ? L[j++] : '';
      const af = /^[AB]$/.test(L[j] || '') ? L[j++] : '';
      const rem = [];
      while (j < L.length && !isStart(j)) { if (!/^(X|-{2,3}|–|—)$/.test(L[j])) rem.push(L[j]); j++; }
      let f = '';
      const m = [];
      rem.join(' // ').split(/\s*\/\/\s*/).forEach(r => {
        const s = SIDS.exec(r);
        if (s) { f = s[1] ? 'SS' : (f || 'S'); r = r.replace(SIDS, '').trim(); }
        if (r) m.push(r);
      });
      const e = { i: iata, n: name, c, r: reg, a: af, m, f };
      const tw = timeWindow(m.join(' '));
      if (tw) e.tw = tw;
      if (!ap[icao]) ap[icao] = e;
      i = j;
    }
    return { types: TYPES, ap, n: Object.keys(ap).length, bad };
  }
  root.EKP = { parseRaw, TYPES };
  if (typeof module !== 'undefined') module.exports = root.EKP;
})(typeof window !== 'undefined' ? window : globalThis);
