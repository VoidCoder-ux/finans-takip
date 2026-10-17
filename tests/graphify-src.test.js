// graphify-src/index.html.js (kod haritası için index.html'deki uygulama kodunun kopyası) güncel mi
const { execFileSync } = require('child_process'), path = require('path');
let ok = true;
try { execFileSync('node', [path.join(__dirname, '..', 'tools', 'graphify-update.js'), '--check'], { stdio: 'pipe' }); }
catch (e) { ok = false; }
console.log((ok ? '✓' : '✗') + ' graphify-src/index.html.js index.html ile aynı' + (ok ? '' : ' (yenilemek için: node tools/graphify-update.js)'));
console.log('\n' + (ok ? 1 : 0) + ' passed, ' + (ok ? 0 : 1) + ' failed');
process.exit(ok ? 0 : 1);
