/* 墨水屏 / 老安卓版（Yota 等）：把副屏页面转成老 WebView（Android 4.4 起）能跑的写法，输出到 panel-eink/
   用法：node tools/mkeink.js   （先在 tools/ 里 npm i）
   · JS 转成 ES5（Babel），加上 Promise / fetch / Object.assign 等补丁（legacy.js）
   · 版本号和 panel/files.json 一样，App 从 panel-eink/files.json 自动更新 */
'use strict';
const fs = require('fs'), path = require('path'), babel = require('@babel/core');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'panel'), OUT = path.join(ROOT, 'panel-eink');
const NM = path.join(__dirname, 'node_modules');
const es5 = code => babel.transformSync(code, { babelrc: false, configFile: false, sourceType: 'script', compact: false, comments: false,
  presets: [[require.resolve('@babel/preset-env', { paths: [__dirname] }), { targets: { chrome: '30' }, modules: false, loose: true }]] }).code;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, 'vendor'), { recursive: true });
// 原样拷贝的
['manifest.json', 'land.json', 'apt.json', 'fir.json'].forEach(f => fs.copyFileSync(path.join(SRC, f), path.join(OUT, f)));
['pdf.min.js', 'pdf.worker.min.js'].forEach(f => fs.copyFileSync(path.join(SRC, 'vendor', f), path.join(OUT, 'vendor', f)));
// 转写的
const js = { 'intel.js': path.join(SRC, 'intel.js'), 'lb.js': path.join(SRC, 'lb.js'), 'pkg.js': path.join(SRC, 'pkg.js'), 'ofp.js': path.join(ROOT, 'assist', 'ofp.js'), 'wx.js': path.join(ROOT, 'assist', 'wx.js') };
Object.keys(js).forEach(f => fs.writeFileSync(path.join(OUT, f), es5(fs.readFileSync(js[f], 'utf8'))));
// 补丁：Element.closest / matches、TextDecoder（只要 UTF-8）
const extra = `
(function(){var E=Element.prototype;if(!E.matches)E.matches=E.webkitMatchesSelector||E.msMatchesSelector;
if(!E.closest)E.closest=function(s){var e=this;while(e&&e.nodeType===1){if(e.matches(s))return e;e=e.parentNode;}return null;};
if(typeof TextDecoder==='undefined'){window.TextDecoder=function(){};TextDecoder.prototype.decode=function(u){u=u||new Uint8Array(0);var s='';for(var i=0;i<u.length;i+=8192)s+=String.fromCharCode.apply(null,u.subarray(i,i+8192));try{return decodeURIComponent(escape(s));}catch(e){return s;}};}
if(typeof TextEncoder==='undefined'){window.TextEncoder=function(){};TextEncoder.prototype.encode=function(t){var s=unescape(encodeURIComponent(t)),u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u;};}
})();`;
fs.writeFileSync(path.join(OUT, 'legacy.js'), [fs.readFileSync(path.join(NM, 'core-js-bundle', 'minified.js'), 'utf8'), fs.readFileSync(path.join(NM, 'regenerator-runtime', 'runtime.js'), 'utf8'),
  fs.readFileSync(path.join(NM, 'whatwg-fetch', 'dist', 'fetch.umd.js'), 'utf8'), extra].join('\n;\n'));
// 页面：里面那段大脚本转写；最前面先载入 legacy.js
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const i0 = html.lastIndexOf('<script>'), i1 = html.indexOf('</script>', i0);
html = html.slice(0, i0) + '<script>' + es5(html.slice(i0 + 8, i1)) + html.slice(i1);
html = html.replace('<script src="vendor/pdf.min.js"></script>', '<script src="legacy.js"></script>\n<script src="vendor/pdf.min.js"></script>');
fs.writeFileSync(path.join(OUT, 'index.html'), html);
// 自动更新清单（版本号跟普通版一样）
const v = JSON.parse(fs.readFileSync(path.join(SRC, 'files.json'), 'utf8')).v;
fs.writeFileSync(path.join(OUT, 'files.json'), JSON.stringify({ v, files: ['index.html', 'legacy.js', 'manifest.json', 'ofp.js', 'wx.js', 'land.json', 'apt.json', 'intel.js', 'lb.js', 'pkg.js', 'fir.json', 'vendor/pdf.min.js', 'vendor/pdf.worker.min.js'] }) + '\n');
console.log('panel-eink v=' + v, fs.readdirSync(OUT).join(' '));
