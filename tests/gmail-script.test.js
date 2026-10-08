// Usage: node tests/gmail-script.test.js [http://127.0.0.1:8787]
// Gmail betiği (Google Apps Script): uygulamanın ürettiği kod, Google hizmetleri taklit edilerek Node'da çalıştırılır.
// E-postayı doğru çözer (windows-1254 / UTF-8, base64url ya da bayt dizisi, iç içe parçalar), stil ve öznitelikleri atar,
// aynı e-postayı iki kez göndermez, hata alınca sonraki çalışmada yeniden dener.
// Eşitleme sunucusu çalışıyorsa betik gerçek bağlantıya gönderir: işlem satırları saklanır, kampanya saklanmaz, yeniden kurulumda tekrar yok.
const http = require('http'), fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), { execFileSync } = require('child_process');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..'), BASE = process.argv[2] || process.env.SYNC_BASE || 'http://127.0.0.1:8787';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = q.url.split('?')[0]; if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const b64u = b => Buffer.from(b).toString('base64url');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const signed = buf => Array.from(buf).map(b => (b > 127 ? b - 256 : b));   // Apps Script baytları (Java byte[])
const TR1254 = { 'Ç': 0xC7, 'ç': 0xE7, 'Ğ': 0xD0, 'ğ': 0xF0, 'İ': 0xDD, 'ı': 0xFD, 'Ö': 0xD6, 'ö': 0xF6, 'Ş': 0xDE, 'ş': 0xFE, 'Ü': 0xDC, 'ü': 0xFC };
const enc1254 = s => Buffer.from([...s].map(c => TR1254[c] || c.charCodeAt(0)));

// --- Örnek e-postalar ---
const H = (name, value) => ({ name, value });
const style = '<style type="text/css">' + 'td.k{font-family:Arial;color:#333;padding:4px}'.repeat(900) + '</style>';
const htmlTxn = '<html><head><meta charset="windows-1254"><title>Akbank</title>' + style + '</head><body style="margin:0"><table width="600" cellpadding="0" style="border:1px solid #ccc">' +
  '<tr><td class="k"><img src="https://www.akbank.com/logo.png" alt="Akbank"></td></tr><tr><td class="k">Sayın AYSE Y.,</td></tr>' +
  '<tr><td class="k">Kredi kartınızla aşağıdaki işlem gerçekleşmiştir.</td></tr><tr><td class="k">Kart No</td><td class="k">5400 **** **** 9036</td></tr>' +
  '<tr><td class="k">İşyeri</td><td class="k">ŞİŞLİ ECZANESİ</td></tr><tr><td class="k">Tutar</td><td class="k">312,75 TL</td></tr>' +
  '<!-- izleme --><tr><td class="k">Bu e-posta otomatik olarak gönderilmiştir, lütfen yanıtlamayınız.</td></tr></table></body></html>';
const plainNoAmount = 'Bu e-postayı görüntülemek için HTML destekli bir e-posta programı kullanın.';
const MSGS = {
  // Çok parçalı: düz metinde tutar yok → HTML parçası (windows-1254, base64url metin) kullanılır
  m1: { id: 'm1', internalDate: String(Date.now() - 600000), payload: { mimeType: 'multipart/alternative', headers: [H('From', 'Akbank <bilgilendirme@akbank.com>'), H('Subject', 'Kredi Kartı Harcama Bilgilendirmesi')], parts: [
    { mimeType: 'text/plain', headers: [H('Content-Type', 'text/plain; charset="UTF-8"')], body: { data: b64u(Buffer.from(plainNoAmount)) } },
    { mimeType: 'text/html', headers: [H('Content-Type', 'text/html; charset="windows-1254"')], body: { data: b64u(enc1254(htmlTxn)).replace(/=+$/, '') } }] } },
  // Tek parça düz metin; gövde bayt dizisi olarak gelir (gelişmiş hizmetin bazı sürümleri)
  m2: { id: 'm2', payload: { mimeType: 'text/plain', headers: [H('From', '"Akbank" <info@akbank.com>'), H('Subject', 'Hesap Hareketi'), H('Content-Type', 'text/plain; charset=utf-8')],
    body: { data: signed(Buffer.from('Sayın AYSE Y.,\nAkbank 1234 nolu hesabınıza 03.10.2026 tarihinde AHMET DEMİR tarafından 750,00 TL FAST gelmiştir.\nİyi günler dileriz.')) } } },
  // İç içe (mixed > alternative): tutar geçen düz metin tercih edilir; ek dosya yok sayılır
  m3: { id: 'm3', payload: { mimeType: 'multipart/mixed', headers: [H('From', 'Akbank <bilgilendirme@akbank.com>'), H('Subject', 'İnternet Alışverişi')], parts: [
    { mimeType: 'multipart/alternative', parts: [
      { mimeType: 'text/plain', headers: [H('Content-Type', 'text/plain; charset=UTF-8')], body: { data: b64u(Buffer.from('Axess kartınızla TRENDYOL işyerinden 899,90 TL tutarında alışveriş yapılmıştır.')) } },
      { mimeType: 'text/html', headers: [H('Content-Type', 'text/html; charset=UTF-8')], body: { data: b64u(Buffer.from('<p>Axess kartınızla <b>TRENDYOL</b> işyerinden 899,90 TL tutarında alışveriş yapılmıştır.</p>')) } }] },
    { mimeType: 'application/pdf', filename: 'dekont.pdf', body: { attachmentId: 'att1', size: 1000 } }] } },
  // Kampanya e-postası: sunucu saklamaz ama betik yine "gönderildi" sayar (bir daha denemez)
  m4: { id: 'm4', payload: { mimeType: 'text/html', headers: [H('From', 'Akbank <kampanya@akbank.com>'), H('Subject', 'Size özel fırsat'), H('Content-Type', 'text/html; charset=UTF-8')],
    body: { data: b64u(Buffer.from('<html><body><p>Axess ile market alışverişlerinizde 250 TL\'ye varan chip-para kazanın!</p><p>Bu e-posta bilgilendirme amaçlı gönderilmiştir.</p></body></html>')) } } }
};

// --- Google hizmetleri (taklit) ---
function google(fetchImpl) {
  const st = { props: {}, triggers: [], queries: [], gets: [], posts: [], logs: [], inbox: ['m1', 'm2', 'm3', 'm4'] };
  const blob = bytes => ({ getDataAsString: cs => new TextDecoder(cs || 'utf-8').decode(Buffer.from(bytes.map(b => b & 255))) });
  const ctx = {
    console: { log: m => st.logs.push(String(m)), warn: m => st.logs.push('UYARI ' + m) },
    JSON, Date, Math, String, Array, Object, Number, RegExp,
    ScriptApp: {
      getProjectTriggers: () => st.triggers.slice(),
      deleteTrigger: t => { st.triggers = st.triggers.filter(x => x !== t); },
      newTrigger: name => ({ timeBased: () => ({ everyMinutes: n => ({ create: () => { const t = { getHandlerFunction: () => name, minutes: n }; st.triggers.push(t); return t; } }) }) })
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in st.props ? st.props[k] : null), setProperty: (k, v) => { st.props[k] = String(v); } }) },
    Gmail: { Users: { Messages: {
      list: (u, o) => { st.queries.push([u, o.q, o.maxResults]); const from = +(o.pageToken || 0), m = st.inbox.slice(from, from + o.maxResults).map(id => ({ id, threadId: 't' + id })); const r = m.length ? { messages: m } : {}; if (from + o.maxResults < st.inbox.length) r.nextPageToken = String(from + o.maxResults); return r; },
      get: (u, id, o) => { st.gets.push([id, o.format]); return JSON.parse(JSON.stringify(MSGS[id])); }
    } } },
    Utilities: {
      base64DecodeWebSafe: s => { if (/[^A-Za-z0-9_=-]/.test(s) || s.length % 4) throw new Error('geçersiz base64'); return signed(Buffer.from(s, 'base64url')); },
      newBlob: bytes => blob(bytes)
    },
    UrlFetchApp: { fetch: (url, o) => { const r = fetchImpl(url, o); st.posts.push({ url, method: o.method, type: o.contentType, mute: o.muteHttpExceptions, body: JSON.parse(o.payload), code: r.code, reply: r.text }); return { getResponseCode: () => r.code, getContentText: () => r.text }; } }
  };
  vm.createContext(ctx);
  return { st, ctx };
}

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base); await page.waitForTimeout(300);
  const FAKE = 'https://ornek.workers.dev/v1/sms/' + 'A'.repeat(43);
  const { code, manifest, evil } = await page.evaluate(u => ({ code: App.BankSms.mailScript(u), manifest: App.BankSms._mailManifest, evil: App.BankSms.mailScript("https://x/v1/sms/a';kur();//\nvar y=1") }), FAKE);
  await browser.close(); srv.close();

  // Ayar dosyası: yalnız okuma izni; e-posta silme/gönderme izni yok
  const m = JSON.parse(manifest);
  eq('manifest scopes: read-only Gmail, outgoing request, trigger', m.oauthScopes.sort(), ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/script.external_request', 'https://www.googleapis.com/auth/script.scriptapp']);
  eq('manifest enables the advanced Gmail service, V8', [m.dependencies.enabledAdvancedServices, m.runtimeVersion], [[{ userSymbol: 'Gmail', serviceId: 'gmail', version: 'v1' }], 'V8']);
  eq('script carries the link once', [code.split(FAKE).length - 1, /var ARAMA = 'from:akbank newer_than:2d';/.test(code)], [1, true]);
  eq('script uses no write/delete Gmail call', /Messages\.(trash|delete|modify|send|batch)|GmailApp|MailApp/.test(code), false);
  { const gx = google(() => ({ code: 200, text: '{}' })); vm.runInContext(evil, gx.ctx);
    eq('a link with quotes/newlines cannot break out of the string', [vm.runInContext('BAGLANTI', gx.ctx), gx.st.triggers.length, gx.st.posts.length], ["https://x/v1/sms/a;kur();//var y=1", 0, 0]); }

  // --- Betiği çalıştır (sahte bağlantı: hep 200) ---
  const ok = () => ({ code: 200, text: '{"stored":true}' });
  const g = google(ok);
  vm.runInContext(code, g.ctx, { filename: 'Kod.gs' });
  vm.runInContext('kur()', g.ctx);
  eq('kur: one 5-minute trigger for kontrolEt', g.st.triggers.map(t => [t.getHandlerFunction(), t.minutes]), [['kontrolEt', 5]]);
  eq('kur: sends a connection test first', [g.st.posts[0].url, /^AILEKASASI-TEST 1,00 TL \d+$/.test(g.st.posts[0].body.text), g.st.posts[0].body.source], [FAKE, true, undefined]);
  eq('search query', g.st.queries[0], ['me', 'from:akbank newer_than:2d', 50]);
  const mails = g.st.posts.slice(1);
  eq('every e-mail posted as JSON with its Gmail id', mails.map(p => [p.body.id, p.body.source, p.method, p.type, p.mute]), [['m1', 'email', 'post', 'application/json', true], ['m2', 'email', 'post', 'application/json', true], ['m3', 'email', 'post', 'application/json', true], ['m4', 'email', 'post', 'application/json', true]]);
  const t1 = mails[0].body.text;
  eq('m1: sender and subject first', t1.split('\n').slice(0, 2), ['Akbank <bilgilendirme@akbank.com>', 'Kredi Kartı Harcama Bilgilendirmesi']);
  eq('e-mail time sent along (Gmail internalDate); 0 when missing', mails.map(p => p.body.date), [Number(MSGS.m1.internalDate), 0, 0, 0]);
  eq('m1: HTML part used (plain part had no amount), windows-1254 decoded', [t1.includes('ŞİŞLİ ECZANESİ'), t1.includes('312,75 TL'), t1.includes('Sayın AYSE'), t1.includes(plainNoAmount)], [true, true, true, false]);
  eq('m1: style, head, comments and attributes removed (small payload)', [/<style|td\.k|izleme|class=|logo\.png/.test(t1), t1.length < 1200], [false, true]);
  eq('m2: byte-array body decoded (UTF-8)', mails[1].body.text, '"Akbank" <info@akbank.com>\nHesap Hareketi\nSayın AYSE Y.,\nAkbank 1234 nolu hesabınıza 03.10.2026 tarihinde AHMET DEMİR tarafından 750,00 TL FAST gelmiştir.\nİyi günler dileriz.');
  eq('m3: nested parts, plain text with amount preferred, attachment ignored', mails[2].body.text, 'Akbank <bilgilendirme@akbank.com>\nİnternet Alışverişi\nAxess kartınızla TRENDYOL işyerinden 899,90 TL tutarında alışveriş yapılmıştır.');
  eq('sent ids remembered', JSON.parse(g.st.props.gonderilen), ['m1', 'm2', 'm3', 'm4']);
  const n = g.st.posts.length;
  vm.runInContext('kontrolEt()', g.ctx);
  eq('next run (5 min later): nothing sent again', [g.st.posts.length - n, g.st.gets.length], [0, 4]);

  // Sunucu hata verirse (ör. 500) işaretlenmez, sonraki çalışmada yeniden denenir
  let down = true;
  const g2 = google(() => (down ? { code: 500, text: 'hata' } : ok()));
  vm.runInContext(code, g2.ctx); g2.st.inbox = ['m2'];
  vm.runInContext('kontrolEt()', g2.ctx);
  eq('failed post not marked as sent', [JSON.parse(g2.st.props.gonderilen), g2.st.logs.some(l => /1 hata/.test(l))], [[], true]);
  down = false; vm.runInContext('kontrolEt()', g2.ctx);
  eq('retried and marked on the next run', [g2.st.posts.map(p => p.code), JSON.parse(g2.st.props.gonderilen)], [[500, 200], ['m2']]);
  // Bir e-posta okunamazsa diğerleri yine gönderilir
  const g3 = google(ok); vm.runInContext(code, g3.ctx); g3.st.inbox = ['bozuk', 'm3'];
  vm.runInContext('kontrolEt()', g3.ctx);
  eq('one unreadable e-mail does not stop the others', JSON.parse(g3.st.props.gonderilen), ['m3']);
  // Hatırlanan kimlik listesi sınırlı
  const g4 = google(ok); vm.runInContext(code, g4.ctx); g4.st.props.gonderilen = JSON.stringify(Array.from({ length: 500 }, (_, i) => 'eski' + i)); g4.st.inbox = ['m3'];
  vm.runInContext('kontrolEt()', g4.ctx);
  eq('remembered ids capped at 500 (newest kept)', [JSON.parse(g4.st.props.gonderilen).length, JSON.parse(g4.st.props.gonderilen).pop()], [500, 'm3']);
  // 2 günde 50'den çok e-posta: sonraki sayfalar da okunur; çalışma başına en çok 100 yeni, kalanı sonraki çalışmalarda (hiçbiri kaçmaz)
  { const g6 = google(ok); vm.runInContext(code, g6.ctx); g6.st.inbox = Array.from({ length: 260 }, (_, i) => 'k' + i);
    g6.ctx.Gmail.Users.Messages.get = () => JSON.parse(JSON.stringify(MSGS.m3));
    const sent = () => JSON.parse(g6.st.props.gonderilen).length, runs = [];
    for (let i = 0; i < 4; i++) { vm.runInContext('kontrolEt()', g6.ctx); runs.push(sent()); }
    eq('260 e-mails in 2 days: 100 + 100 + 60 over three runs, none missed', [runs, new Set(JSON.parse(g6.st.props.gonderilen)).size], [[100, 200, 260, 260], 260]); }
  eq('empty search result is fine', (() => { const g5 = google(ok); vm.runInContext(code, g5.ctx); g5.st.inbox = []; vm.runInContext('kontrolEt()', g5.ctx); return [g5.st.posts.length, g5.st.props.gonderilen]; })(), [0, '[]']);

  // --- Gerçek sunucuya (wrangler dev) ---
  let cfg = null; try { cfg = await (await fetch(BASE + '/v1/config')).json(); } catch (e) {}
  if (!cfg || !cfg.smsInbox) console.log('Eşitleme sunucusu yok (' + BASE + '); gerçek gönderim atlandı.');
  else {
    const api = async (method, p, token, body) => { const r = await fetch(BASE + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body == null ? undefined : JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, body: j }; };
    const id = b64u(crypto.randomBytes(16)), token = b64u(crypto.randomBytes(32)), key = b64u(crypto.randomBytes(32)), V = '/v1/vault/' + id;
    await api('PUT', V, token, { baseVersion: 0, data: 'QUJD' });
    await api('PUT', V + '/sms-key/gmailbox_u_self', token, { keyHash: sha('ft-sms|' + key) });
    const url = BASE + '/v1/sms/' + key;
    const realCode = code.split(FAKE).join(url);
    // UrlFetchApp gibi eşzamanlı gönderim (curl)
    const curl = (u, o) => { const out = execFileSync('curl', ['-s', '--noproxy', '*', '-X', 'POST', '-H', 'Content-Type: ' + o.contentType, '--data-binary', '@-', '-w', '\n%{http_code}', u], { input: o.payload, encoding: 'utf8' }); const i = out.lastIndexOf('\n'); return { code: +out.slice(i + 1), text: out.slice(0, i) }; };
    const gr = google(curl); vm.runInContext(realCode, gr.ctx); vm.runInContext('kur()', gr.ctx);
    eq('real server: test + 4 e-mails accepted (200)', gr.st.posts.map(p => p.code), [200, 200, 200, 200, 200]);
    eq('real server: campaign e-mail not stored, the rest stored', gr.st.posts.map(p => JSON.parse(p.reply)), [{ stored: true }, { stored: true }, { stored: true }, { stored: true }, { stored: false, reason: 'no_amount' }]);
    const items = (await api('GET', V + '/inbox', token)).body.items.map(i => i.text);
    eq('real server: stored texts are short and without greeting/footer', [items.length, items.every(t => t.length < 400 && !/Sayın|yanıtlamayınız|İyi günler|<|>/.test(t))], [4, true]);
    const tr = new Date(Number(MSGS.m1.internalDate) + 3 * 3600_000), p2 = x => String(x).padStart(2, '0');
    eq('real server: card e-mail keeps the transaction lines and the e-mail time', items[1], 'Akbank\nKredi Kartı Harcama Bilgilendirmesi\nKredi kartınızla aşağıdaki işlem gerçekleşmiştir.\nKart No: 5400 **** **** 9036\nİşyeri: ŞİŞLİ ECZANESİ\nTutar: 312,75 TL\nE-posta tarihi: ' + p2(tr.getUTCDate()) + '.' + p2(tr.getUTCMonth() + 1) + '.' + tr.getUTCFullYear() + ' ' + p2(tr.getUTCHours()) + ':' + p2(tr.getUTCMinutes()));
    // Betik silinip yeniden kurulsa (hatırlanan liste boş) aynı e-postalar ikinci kez saklanmaz
    const again = google(curl); vm.runInContext(realCode, again.ctx); vm.runInContext('kontrolEt()', again.ctx);
    eq('re-installed script: same e-mails not stored twice', again.st.posts.map(p => JSON.parse(p.reply).reason), ['duplicate', 'duplicate', 'duplicate', 'no_amount']);
    eq('real server: inbox unchanged', (await api('GET', V + '/inbox', token)).body.items.length, 4);
    await api('DELETE', V, token);
  }
  eq('no page errors', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
