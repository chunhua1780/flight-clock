// 打包时钟：内联 scene.js、打乱代码、加网址锁，写到私有仓库 flight-box/clock/app.html（公开网站上不再放时钟源代码）
// 用法：node tools/mkclock.js <版本号> <javascript-obfuscator 所在目录>
const fs = require('fs'), path = require('path');
const V = process.argv[2], OB = require(path.join(process.argv[3], 'javascript-obfuscator'));
const root = path.join(__dirname, '..');
let h = fs.readFileSync(path.join(root, 'app.html'), 'utf8').replace(/__APP_VER__/g, V);
const scene = fs.readFileSync(path.join(root, 'scene.js'), 'utf8');
h = h.replace(/<script src="scene\.js[^"]*"><\/script>/, () => '<script>' + scene + '</script>');
const lock = "(function(){var ok=false;try{ok=window.parent!==window&&/(^|\\.)chunhua1780\\.github\\.io$/.test(window.parent.location.hostname)}catch(e){}if(!ok){document.documentElement.innerHTML='';throw new Error('x')}})();";
h = h.replace(/<head[^>]*>/i, m => m + '<script>' + lock + '</script>');
let n = 0;
h = h.replace(/<script>([\s\S]*?)<\/script>/g, (m, js) => { n++;
  const o = OB.obfuscate(js, { compact: true, stringArray: true, stringArrayThreshold: 0.75, stringArrayEncoding: ['base64'], identifierNamesGenerator: 'hexadecimal', renameGlobals: false, selfDefending: false, controlFlowFlattening: false, deadCodeInjection: false, target: 'browser' }).getObfuscatedCode();
  return '<script>' + o.replace(/<\/script/gi, '<\\/script') + '</script>'; });
h = h.replace(/<!--[\s\S]*?-->/g, '');
const out = '/home/user/flight-box/clock/app.html'; fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, h);
console.log('scripts', n, 'bytes', h.length);
