/* 公司 OFP 解读（OM 10.1.7「EK-OFP Decodes」）：机长把手册原文粘贴进来，在这台 iPad 上解析成词条。
   这个文件只有解析方法，没有任何手册内容。 */
(function (root) {
  'use strict';
  // 手册里的标签 → 统一的键
  function canon(k, first) {
    k = k.trim();
    if (/^EK\d+$/.test(k)) return 'FLIGHT';
    if (/^UAE\d+/.test(k)) return 'CALLSIGN';
    if (/^\d{2}[A-Z]{3}$/.test(k)) return 'DATE';
    if (/^[A-Z]{4}\/[A-Z]{3}-[A-Z]{4}\/[A-Z]{3}$/.test(k)) return 'ROUTEPAIR';
    if (/^\d{3}-\d{3}/.test(k)) return 'TYPE';
    if (/^[A-Z]{6}[A-Z]*\d$/.test(k)) return 'COMPANY ROUTE';
    if (/^[A-Z]{4}\/\d{2}[LRC]?\s+\S/.test(k)) return 'ROUTE SUMMARY';
    if (/^[A-Z]{4}\/\d{2}[LRC]?$/.test(k)) return 'DEPLINE';
    if (/^OFP\b/.test(k)) return 'OFP';
    if (/^CONT\b/.test(k)) return 'CONT';
    if (/^ADDNL\b/.test(k)) return 'ADDNL';
    if (/TANKERING/.test(k)) return 'TANKERING';
    if (/^[A-Z]{4}\s+ATIS$/.test(k)) return 'ATIS';
    if (/^-+[A-Z ]+(FIR|UIR)\//.test(k)) return 'FIRLINE';
    if (/^\S*\/ENTRY\d|^ENTRY\d/.test(k)) return 'ENTRY';
    if (/^\S*\/EXIT\d|^EXIT\d/.test(k)) return 'EXIT';
    if (/^ETP/.test(k)) return 'ETP';
    if (/^[A-Z0-9]+\s+[A-Z]{4}\/\d{2}/.test(k)) return 'ARRLINE';
    if (/^…|^\.\.\./.test(k)) return 'DESTMIN';
    if (/^WPT\/AWY$/.test(k)) return 'WPT';
    if (/^ALTERNATE SUMMARY/.test(k)) return 'DEST ALTN';
    if (/^EK-COMPANY FREQ/.test(k)) return 'COMPANY INFO';
    if (/^RWY/.test(k)) return 'RWY';
    if (/^STATCON/.test(k)) return 'STATCONT';
    return k.replace(/\s+/g, ' ').toUpperCase();
  }
  function parse(text) {
    const L = String(text || '').replace(/\r/g, '').split('\n').map(l => l.replace(/ /g, ' '));
    const items = []; let cur = null;
    L.forEach(l => {
      const t = l.trim();
      if (/^\d+\.\d+\.\d+/.test(t)) { cur = null; return; }          // 章节标题（10.1.7.2 — …）
      const n = /^(\d{1,3}[A-Z]?)\.\s*(.*)$/.exec(t);
      if (n && (n[2] === '' || /^\S/.test(n[2])) && (!n[2] || n[2].length < 300)) { cur = { no: n[1], lines: n[2] ? [n[2]] : [] }; items.push(cur); return; }
      if (cur && t) cur.lines.push(t);
    });
    const e = {};
    items.forEach(it => {
      if (!it.lines.length) return;
      const body = it.lines.join('\n');
      if (/^Intentionally/i.test(body)) return;
      const first = it.lines[0];
      let key, desc;
      const c = /^(.+?):\s*(.*)$/.exec(first);
      if (c && c[1].length < 60) { key = canon(c[1]); desc = [c[2]].concat(it.lines.slice(1)).join('\n').trim(); }
      else { key = canon(first); desc = it.lines.slice(1).join('\n').trim() || first; }
      const add = k => { if (!e[k]) e[k] = { no: it.no, label: c ? c[1] : first, en: desc }; };
      add(key);
      if (key === 'WPT') { add('AWY'); }
      if (key === 'ADDNL') { if (!e.EXTRA) e.EXTRA = { no: it.no, label: 'EXTRA', en: desc }; }
      if (key === 'SR/TDEV') { add('SR'); add('TDEV'); }
    });
    return { e, n: Object.keys(e).length };
  }
  root.OMP = { parse, canon };
  if (typeof module !== 'undefined') module.exports = root.OMP;
})(typeof window !== 'undefined' ? window : globalThis);
