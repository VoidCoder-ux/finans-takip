// graphify HTML içindeki betikleri okumaz. Bu araç index.html'deki uygulama kodunu graphify-src/index.html.js'e kopyalar
// (betik dışı satırlar boş bırakılır, böylece haritadaki satır numaraları index.html ile aynıdır), sonra haritayı günceller.
//   node tools/graphify-update.js            # kopyala + graphify update .
//   node tools/graphify-update.js --check    # kopya güncel mi (değilse çıkış kodu 1)
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const R = path.join(__dirname, '..'), SRC = path.join(R, 'index.html'), OUT = path.join(R, 'graphify-src', 'index.html.js');

function build() {
  const s = fs.readFileSync(SRC, 'utf8'), re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g, nl = (a, b) => '\n'.repeat(s.slice(a, b).split('\n').length - 1);
  let out = '// OTOMATİK ÜRETİLDİ: düzenlemeyin. Kaynak index.html; satır numaraları aynıdır. Yenilemek için: node tools/graphify-update.js', pos = 0, m;
  // İlk satır başlık; index.html'in ilk satırı betik değil
  pos = s.indexOf('\n');
  while ((m = re.exec(s))) { const st = m.index + m[0].indexOf('>') + 1; out += nl(pos, st) + m[1]; pos = st + m[1].length; }
  return out + nl(pos, s.length);
}

const text = build();
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== text) { console.log('graphify-src/index.html.js eski: node tools/graphify-update.js çalıştırın'); process.exit(1); }
  console.log('graphify-src güncel'); process.exit(0);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, text);
console.log('graphify-src/index.html.js yazıldı (' + text.split('\n').length + ' satır)');
try { execSync('command -v graphify', { stdio: 'ignore' }); } catch (e) { console.log('graphify kurulu değil; harita güncellenmedi (kurulum: uv tool install graphifyy)'); process.exit(0); }
execSync('graphify update .', { cwd: R, stdio: 'inherit' });
