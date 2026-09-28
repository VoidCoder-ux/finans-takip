// VAPID anahtar çifti üretir (Web Push için). Kullanım: npm run vapid
import { webcrypto as c } from 'node:crypto';
const kp = await c.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await c.subtle.exportKey('jwk', kp.privateKey);
const raw = new Uint8Array(await c.subtle.exportKey('raw', kp.publicKey));
const pub = Buffer.from(raw).toString('base64url');
console.log('1) wrangler.toml [vars] içine:\n\nVAPID_PUBLIC_KEY = "' + pub + '"\n');
console.log('2) Gizli anahtarı kaydedin (komut çalışınca aşağıdaki satırı yapıştırın):\n\nnpx wrangler secret put VAPID_PRIVATE_JWK\n');
console.log(JSON.stringify({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d }));
