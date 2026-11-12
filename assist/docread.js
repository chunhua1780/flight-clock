/* 读任何文档里的文字：按内容（不是按文件名）判断格式。
   PDF（所有版本，含加密，要密码会问）· Word .docx / 旧版 .doc · RTF · OpenDocument .odt · HTML · TXT（UTF-8 / UTF-16 / 西欧编码）。
   全部在这台设备上处理，不上传。 */
(function () {
  'use strict';
  const td = (b, enc) => { try { return new TextDecoder(enc, { fatal: false }).decode(b); } catch (e) { return ''; } };
  const head = (u8, n) => String.fromCharCode(...u8.subarray(0, n));

  // ---------- ZIP（docx / odt 都是 zip）：用浏览器自带的解压 ----------
  async function unzip(u8, want) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let e = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('ZIP 坏了');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = {};
    for (let k = 0; k < n; k++) {
      const meth = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = td(u8.subarray(p + 46, p + 46 + nl), 'utf-8'); p += 46 + nl + xl + cl;
      if (!want.test(name)) continue;
      const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), data = u8.subarray(ds, ds + csz);
      if (meth === 0) out[name] = data;
      else if (meth === 8) { if (typeof DecompressionStream === 'undefined') throw new Error('这台设备的浏览器太旧，读不了 Word 文件'); out[name] = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); }
    }
    return out;
  }
  const xml = s => new DOMParser().parseFromString(s, 'application/xml');
  // Word .docx：段落 → 一行；保留空格、制表、换行（OFP 是等宽排版）
  function docxText(x) {
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', lines = [];
    const walk = (n, buf) => { for (const c of n.childNodes) { if (c.nodeType !== 1) continue; const t = c.localName;
      if (t === 't') buf.push(c.textContent); else if (t === 'tab') buf.push('\t'); else if (t === 'br' || t === 'cr') buf.push('\n');
      else if (t === 'p') { const b = []; walk(c, b); lines.push(b.join('')); } else if (t === 'tc') { const b = []; walk(c, b); buf.push(b.join(' ') + '  '); }
      else if (t === 'tr') { const b = []; walk(c, b); lines.push(b.join('')); } else walk(c, buf); } };
    walk(x.getElementsByTagNameNS(W, 'body')[0] || x.documentElement, []);
    return lines.join('\n');
  }
  // OpenDocument .odt
  function odtText(x) {
    const lines = [];
    const walk = (n, buf) => { for (const c of n.childNodes) { if (c.nodeType === 3) { buf.push(c.nodeValue); continue; } if (c.nodeType !== 1) continue; const t = c.localName;
      if (t === 's') buf.push(' '.repeat(+(c.getAttribute('text:c') || 1))); else if (t === 'tab') buf.push('\t'); else if (t === 'line-break') buf.push('\n');
      else if (t === 'p' || t === 'h') { const b = []; walk(c, b); lines.push(b.join('')); } else walk(c, buf); } };
    const body = x.getElementsByTagName('office:body')[0] || x.documentElement; walk(body, []);
    return lines.join('\n');
  }
  // RTF
  function rtfText(s) {
    let out = '', i = 0, depth = 0; const skip = []; let skipping = false;
    while (i < s.length) {
      const c = s[i];
      if (c === '{') { depth++; if (s.startsWith('{\\*', i) || /^\{\\(fonttbl|colortbl|stylesheet|info|pict|header|footer)/.test(s.slice(i, i + 14))) { skip.push(depth); skipping = true; } i++; continue; }
      if (c === '}') { if (skip.length && skip[skip.length - 1] === depth) { skip.pop(); skipping = skip.length > 0; } depth--; i++; continue; }
      if (c === '\\') {
        const m = /^\\([a-z]+)(-?\d+)? ?|^\\'([0-9a-f]{2})|^\\(.)/i.exec(s.slice(i, i + 40));
        if (m) { i += m[0].length; if (skipping) continue;
          if (m[3]) out += String.fromCharCode(parseInt(m[3], 16));
          else if (m[4]) out += m[4] === '~' ? ' ' : /[\\{}]/.test(m[4]) ? m[4] : '';
          else if (m[1] === 'par' || m[1] === 'line') out += '\n'; else if (m[1] === 'tab') out += '\t';
          else if (m[1] === 'u' && m[2]) { out += String.fromCharCode((+m[2] + 65536) % 65536); if (s[i] === '?') i++; }
          continue; }
      }
      if (!skipping && c !== '\r' && c !== '\n') out += c; i++;
    }
    return out;
  }
  // HTML：保留 <pre> 和换行
  function htmlText(s) {
    const d = new DOMParser().parseFromString(s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n$&'), 'text/html');
    d.querySelectorAll('script,style').forEach(n => n.remove());
    return (d.body ? d.body.textContent : s).replace(/ /g, ' ');
  }
  // 旧版 Word .doc（二进制）：把里面成段的文字找出来（UTF-16 和单字节两种都试，取像 OFP 的那种）
  function docText(u8) {
    const runs = (txt) => (txt.match(/[\x09\x0a\x0d\x20-\x7e -ɏ]{4,}/g) || []).join('\n');
    const a = runs(td(u8, 'utf-16le')), b = runs(td(u8, 'windows-1252'));
    const score = t => (t.match(/\b(OFP|AWY|TRM|FUEL|TRIP|NOTAM|ALTN)\b/g) || []).length;
    return (score(a) >= score(b) ? a : b).replace(/\r/g, '\n');
  }
  function textOf(u8) {
    if (u8[0] === 0xff && u8[1] === 0xfe) return td(u8.subarray(2), 'utf-16le');
    if (u8[0] === 0xfe && u8[1] === 0xff) return td(u8.subarray(2), 'utf-16be');
    let t = td(u8, 'utf-8'); if ((t.match(/�/g) || []).length > 20) t = td(u8, 'windows-1252');
    return t.replace(/^﻿/, '');
  }

  // 主入口：Blob / File → 文字
  async function readAny(blob, name, pdfToText) {
    const u8 = new Uint8Array(await blob.arrayBuffer()), h = head(u8, 8), nm = (name || '').toLowerCase();
    if (h.indexOf('%PDF') >= 0 || head(u8, 1024).indexOf('%PDF-') >= 0) return { kind: 'PDF', text: await pdfToText(u8.buffer) };
    if (h.indexOf('PK\x03\x04') === 0) {
      const f = await unzip(u8, /^(word\/document\.xml|content\.xml)$/);
      if (f['word/document.xml']) return { kind: 'Word', text: docxText(xml(td(f['word/document.xml'], 'utf-8'))) };
      if (f['content.xml']) return { kind: 'ODT', text: odtText(xml(td(f['content.xml'], 'utf-8'))) };
      throw new Error('这个压缩文件里没有文档');
    }
    if (u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0) return { kind: 'Word (.doc)', text: docText(u8) };
    if (/^\{\\rtf/.test(h)) return { kind: 'RTF', text: rtfText(textOf(u8)) };
    if (/^image\//.test(blob.type || '') || /^(\x89PNG|\xff\xd8\xff|GIF8)/.test(h)) throw new Error('这是图片，不是文字或 PDF（截图读不了，要复制 PDF 本身）');
    const t = textOf(u8);
    if (/^\s*<(!doctype|html|body|div|table|pre|p)\b/i.test(t) || /\.html?$/.test(nm)) return { kind: 'HTML', text: htmlText(t) };
    return { kind: 'TXT', text: t };
  }
  window.DOCR = { readAny, htmlText, rtfText };
})();
