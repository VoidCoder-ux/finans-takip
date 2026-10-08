// Usage: node tests/sms-e2e.test.js [http://127.0.0.1:8787]
// Banka SMS gelen kutusu: Kestirmeler'in POST ettiği SMS saklanır, kasa sahibi çeker ve siler; şifre/kod SMS'leri saklanmaz.
// Banka e-postası (Gmail betiği): gövdeden yalnız işlem satırları saklanır; kampanya e-postası saklanmaz; aynı e-posta iki kez eklenmez.
// Sunucu çalışmıyorsa atlanır.
const crypto = require('crypto');
const BASE = process.argv[2] || process.env.SYNC_BASE || 'http://127.0.0.1:8787';
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const b64u = b => Buffer.from(b).toString('base64url');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
async function api(method, path, token, body, headers) {
  const r = await fetch(BASE + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}, headers || {}), body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}

(async () => {
  let cfg;
  try { cfg = await (await fetch(BASE + '/v1/config')).json(); } catch (e) { console.log('Sunucu çalışmıyor (' + BASE + '); test atlandı.'); process.exit(0); }
  eq('config advertises SMS inbox', cfg.smsInbox, true);
  const id = b64u(crypto.randomBytes(16)), token = b64u(crypto.randomBytes(32)), other = b64u(crypto.randomBytes(32));
  const key = b64u(crypto.randomBytes(32)), key2 = b64u(crypto.randomBytes(32)), stranger = b64u(crypto.randomBytes(32));
  await api('PUT', '/v1/vault/' + id, token, { baseVersion: 0, data: 'QUJD' });
  const V = '/v1/vault/' + id;
  eq('register SMS key needs vault token', (await api('PUT', V + '/sms-key/u_self', null, { keyHash: sha('ft-sms|' + key) })).status, 401);
  eq('register SMS key with wrong token', (await api('PUT', V + '/sms-key/u_self', other, { keyHash: sha('ft-sms|' + key) })).status, 403);
  eq('bad key hash rejected', (await api('PUT', V + '/sms-key/u_self', token, { keyHash: 'abc' })).status, 400);
  eq('register SMS key (u_self)', (await api('PUT', V + '/sms-key/u_self', token, { keyHash: sha('ft-sms|' + key) })).status, 200);
  eq('register SMS key (u_partner)', (await api('PUT', V + '/sms-key/u_partner', token, { keyHash: sha('ft-sms|' + key2) })).status, 200);

  const spend = 'YAPI KREDI: 1234 ile biten kartinizla 28.09.2026 14:32 MIGROS TIC A.S. isyerinde 245,50 TL harcama yapilmistir.';
  eq('unknown key → 404', (await api('POST', '/v1/sms/' + stranger, null, { text: spend })).status, 404);
  eq('GET not allowed on SMS url', (await api('GET', '/v1/sms/' + key)).status, 405);
  eq('JSON body stored', (await api('POST', '/v1/sms/' + key, null, { text: spend })).body, { stored: true });
  eq('same SMS again within minutes → not stored twice', (await api('POST', '/v1/sms/' + key, null, { text: spend })).body, { stored: false, reason: 'duplicate' });
  const salary = 'Akbank: Hesabiniza 01.10.2026 tarihinde 45.000,00 TL maas odemesi yatirilmistir.';
  eq('form body stored (partner key)', (await api('POST', '/v1/sms/' + key2, null, 'text=' + encodeURIComponent(salary), { 'Content-Type': 'application/x-www-form-urlencoded' })).body, { stored: true });
  const plain = 'Hesabinizdan AHMET YILMAZ adina 1.500,00 TL FAST ile gonderilmistir.';
  eq('plain text body stored', (await api('POST', '/v1/sms/' + key, null, plain, { 'Content-Type': 'text/plain' })).body, { stored: true });
  eq('OTP SMS never stored', (await api('POST', '/v1/sms/' + key, null, { text: 'MIGROS 245,50 TL islem icin 3D sifreniz: 482913. Kimseyle paylasmayin.' })).body, { stored: false, reason: 'secret' });
  eq('verification code never stored', (await api('POST', '/v1/sms/' + key, null, { text: 'Akbank dogrulama kodunuz 551203. Tutar 99,00 TL' })).body, { stored: false, reason: 'secret' });
  eq('message without amount not stored', (await api('POST', '/v1/sms/' + key, null, { text: 'Yeni kampanyamizi kacirmayin!' })).body, { stored: false, reason: 'no_amount' });
  eq('personal chat with an amount not stored', (await api('POST', '/v1/sms/' + key, null, { text: 'Aksam gelirken 100 TL getirir misin?' })).body, { stored: false, reason: 'not_bank' });
  eq('oversized message rejected', (await api('POST', '/v1/sms/' + key, null, { text: 'x'.repeat(130000) })).status, 413);
  eq('long text without a transaction not stored', (await api('POST', '/v1/sms/' + key, null, { text: 'x'.repeat(9000) })).body, { stored: false, reason: 'no_amount' });
  eq('warning line "sifrenizi paylasmayin" does not drop a real spend SMS', (await api('POST', '/v1/sms/' + key, null, { text: '4321 ile biten kartinizdan 99,90 TL harcama yapildi. Sifrenizi kimseyle paylasmayiniz.' })).body, { stored: true });

  eq('inbox needs vault token', (await api('GET', V + '/inbox', other)).status, 403);
  const inbox = await api('GET', V + '/inbox', token);
  eq('inbox lists stored SMS with owner label', inbox.body.items.map(i => [i.label, i.text.slice(0, 12)]), [['u_self', spend.slice(0, 12)], ['u_partner', salary.slice(0, 12)], ['u_self', plain.slice(0, 12)], ['u_self', '4321 ile bit']]);
  eq('inbox reports registered labels', inbox.body.labels.sort(), ['u_partner', 'u_self']);
  eq('inbox reports last call result per key (no text)', inbox.body.keys.map(k => [k.label, k.lastReason, k.lastAt > 0]).sort(), [['u_partner', 'stored', true], ['u_self', 'stored', true]]);
  eq('key list carries a short hash prefix (to spot a replaced key), not the hash', inbox.body.keys.map(k => [k.label, k.h]).sort(), [['u_partner', sha('ft-sms|' + key2).slice(0, 8)], ['u_self', sha('ft-sms|' + key).slice(0, 8)]]);
  eq('ack deletes only given ids', (await api('POST', V + '/inbox/ack', token, { ids: inbox.body.items.slice(0, 2).map(i => i.id) })).body, { deleted: 2 });
  eq('ack by other vault token refused', (await api('POST', V + '/inbox/ack', other, { ids: [inbox.body.items[2].id] })).status, 403);
  eq('remaining inbox', (await api('GET', V + '/inbox', token)).body.items.length, 2);

  // --- Banka e-postası (Gmail betiği) ---
  const mkey = b64u(crypto.randomBytes(32));
  eq('register Gmail key', (await api('PUT', V + '/sms-key/gmailbox_u_self', token, { keyHash: sha('ft-sms|' + mkey) })).status, 200);
  const style = '<style>' + '.x{color:red}'.repeat(400) + '</style>';
  const mail = 'Akbank <bilgilendirme@akbank.com>\nKredi Kartı Harcama Bilgilendirmesi\n<html><head><title>Akbank</title>' + style + '</head><body><table>' +
    '<tr><td>Sayın AYSE Y.,</td></tr><tr><td>Kredi kartınızla aşağıdaki işlem gerçekleşmiştir.</td></tr>' +
    '<tr><td>Kart No</td><td>5400 **** **** 9036</td></tr><tr><td>İşlem Tarihi</td><td>02.10.2026 14:32</td></tr><tr><td>İşyeri</td><td>MİGROS KADIKÖY</td></tr>' +
    '<tr><td>Tutar</td><td>245,50&nbsp;TL</td></tr><tr><td>Onay Kodu</td><td>482913</td></tr><tr><td>Kullanılabilir Limit</td><td>12.345,67 TL</td></tr></table>' +
    '<p>Axess ile %20&#39;ye varan indirim fırsatını kaçırmayın! 500 TL&#39;ye kadar chip-para kazanın.</p><p>Bu e-posta otomatik olarak gönderilmiştir, lütfen yanıtlamayınız.</p>' +
    '<p>Akbank T.A.Ş. Mersis No: 0015001526400497 · Kişisel verileriniz KVKK kapsamında işlenir.</p></body></html>';
  eq('long HTML e-mail accepted (only the transaction part kept)', (await api('POST', '/v1/sms/' + mkey, null, { text: mail, source: 'email', id: '18c2f0a1b2' })).body, { stored: true });
  eq('same e-mail (Gmail id) again → not stored twice', (await api('POST', '/v1/sms/' + mkey, null, { text: mail, source: 'email', id: '18c2f0a1b2' })).body, { stored: false, reason: 'duplicate' });
  const promo = 'Akbank <kampanya@akbank.com>\nSize özel fırsat!\n<html><body><p>Axess kartınızla market alışverişlerinizde 250 TL\'ye varan chip-para kazanın!</p><p>Kampanyaya katılmak için AXESS yazıp gönderin.</p><p>Bu e-posta bilgilendirme amaçlı gönderilmiştir.</p></body></html>';
  eq('campaign e-mail not stored', (await api('POST', '/v1/sms/' + mkey, null, { text: promo, source: 'email', id: '18c2f0a1b3' })).body, { stored: false, reason: 'no_amount' });
  const plainMail = 'Akbank <info@akbank.com>\nHesap Hareketi\nSayın AYSE YILMAZ,\nAkbank 1234 nolu hesabınıza 03.10.2026 tarihinde AHMET DEMIR tarafından 750,00 TL FAST gelmiştir.\nİyi günler dileriz.\nBu e-posta bilgilendirme amaçlı gönderilmiştir.';
  eq('plain-text e-mail stored', (await api('POST', '/v1/sms/' + mkey, null, { text: plainMail, source: 'email', id: '18c2f0a1b4' })).body, { stored: true });
  const mails = (await api('GET', V + '/inbox', token)).body.items.filter(i => i.label === 'gmailbox_u_self').map(i => i.text);
  eq('stored e-mail text: sender, subject and transaction lines only', mails[0], 'Akbank\nKredi Kartı Harcama Bilgilendirmesi\nKredi kartınızla aşağıdaki işlem gerçekleşmiştir.\nKart No: 5400 **** **** 9036\nİşlem Tarihi: 02.10.2026 14:32\nİşyeri: MİGROS KADIKÖY\nTutar: 245,50 TL\nKullanılabilir Limit: 12.345,67 TL');
  eq('no greeting with name, approval code, campaign or legal text kept', mails.some(t => /Sayın|AYSE|482913|indirim|Mersis|KVKK|yanıtlamayınız|İyi günler/.test(t)), false);
  eq('plain e-mail kept short', mails[1], 'Akbank\nHesap Hareketi\nAkbank 1234 nolu hesabınıza 03.10.2026 tarihinde AHMET DEMIR tarafından 750,00 TL FAST gelmiştir.');
  eq('Gmail key shows its own last result', (await api('GET', V + '/inbox', token)).body.keys.find(k => k.label === 'gmailbox_u_self').lastReason, 'stored');
  // Gerçek Akbank biçimi (ad ve kart numarası değiştirildi): işyeri ve tarih yazmaz, tutar İngilizce biçimde (1,318.65)
  const akb = 'Akbank <bilgilendirme@akbank.com>\nKredi kartı harcamanız\n<html><body><table><tr><td><p>Bu mail\'i görüntüleyemiyorsanız lütfen <a href="#">tıklayınız.</a></p></td></tr>' +
    '<tr><td><img src="logo.png" alt="AKBANK"></td></tr><tr><td><p><b>Değerli Akbanklı,</b></p>' +
    '<p>7777 ile biten AYSE YILMAZ adına ait Axess Asıl kartınızla 1,318.65 TL tutarında KREDI KARTI harcaması yapılmıştır. 3,104.27 TL limitiniz kalmıştır.</p>' +
    '<p>Kredi kartı harcamalarınızı görmek için <a href="#">Akbank Mobil</a>\'e giriş yapabilirsiniz.</p><p>Saygılarımızla,<br><b>Akbank</b></p></td></tr>' +
    '<tr><td>Bize ulaşın</td><td>Her hakkı Akbank T.A.Ş.\'ye aittir. Copyright © 2026</td></tr></table><p>Lütfen size gelen e-mailleri Spam(Junk) mail olarak işaretlemeyiniz.</p>' +
    '<p>Akbank T.A.Ş. Genel Müdürlük: Sabancı Center 4. Levent 34330 İstanbul Mersis No: 0015 0015 2640 0497 www.akbank.com</p></body></html>';
  const at = Date.now() - 3600_000, tr = new Date(at + 3 * 3600_000), p2 = n => String(n).padStart(2, '0');
  const atTxt = p2(tr.getUTCDate()) + '.' + p2(tr.getUTCMonth() + 1) + '.' + tr.getUTCFullYear() + ' ' + p2(tr.getUTCHours()) + ':' + p2(tr.getUTCMinutes());
  eq('real Akbank e-mail stored', (await api('POST', '/v1/sms/' + mkey, null, { text: akb, source: 'email', id: 'akb1', date: at })).body, { stored: true });
  eq('two different e-mails with the same text are both kept (Gmail id decides)', (await api('POST', '/v1/sms/' + mkey, null, { text: akb, source: 'email', id: 'akb2', date: at })).body, { stored: true });
  const akbTxt = (await api('GET', V + '/inbox', token)).body.items.filter(i => i.label === 'gmailbox_u_self').map(i => i.text);
  eq('Akbank: card holder name, greeting, links, signature and footer dropped; e-mail time added (Türkiye)', akbTxt[2], 'Akbank\nKredi kartı harcamanız\n7777 ile biten Axess Asıl kartınızla 1,318.65 TL tutarında KREDI KARTI harcaması yapılmıştır. 3,104.27 TL limitiniz kalmıştır.\nE-posta tarihi: ' + atTxt);
  eq('implausible e-mail date ignored', (await api('POST', '/v1/sms/' + mkey, null, { text: akb.replace('1,318.65', '1,111.11'), source: 'email', id: 'akb3', date: 5 })).body, { stored: true });
  eq('implausible date: stored without a date line', (await api('GET', V + '/inbox', token)).body.items.filter(i => i.label === 'gmailbox_u_self').pop().text.includes('E-posta tarihi'), false);
  eq('transfer recipient name is kept (needed for the note), only the card holder is dropped', (await api('POST', '/v1/sms/' + mkey, null, { text: 'Akbank <b@akbank.com>\nHesap hareketi\n<p>Hesabınızdan MEHMET KAYA adına 2,000.00 TL FAST ile gönderilmiştir.</p>', source: 'email', id: 'akb4' })).body, { stored: true });
  eq('stored transfer text keeps the recipient', (await api('GET', V + '/inbox', token)).body.items.pop().text, 'Akbank\nHesap hareketi\nHesabınızdan MEHMET KAYA adına 2,000.00 TL FAST ile gönderilmiştir.');

  // Anahtar yenilenince eskisi geçersiz olur; anahtar silinince SMS kabul edilmez
  const key3 = b64u(crypto.randomBytes(32));
  await api('PUT', V + '/sms-key/u_self', token, { keyHash: sha('ft-sms|' + key3) });
  eq('old key invalid after rotation', (await api('POST', '/v1/sms/' + key, null, { text: spend + ' 2' })).status, 404);
  eq('new key works', (await api('POST', '/v1/sms/' + key3, null, { text: spend + ' 3' })).body, { stored: true });
  eq('delete key', (await api('DELETE', V + '/sms-key/u_self', token)).status, 200);
  eq('deleted key refused', (await api('POST', '/v1/sms/' + key3, null, { text: spend + ' 4' })).status, 404);

  // Kasa silinince anahtarlar ve bekleyen SMS'ler de silinir
  eq('vault delete', (await api('DELETE', V, token)).body, { deleted: true });
  eq('partner key gone with vault', (await api('POST', '/v1/sms/' + key2, null, { text: salary + ' x' })).status, 404);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
