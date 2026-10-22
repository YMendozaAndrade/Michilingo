const crypto = require('crypto');
const config = require('./config');

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_LEN = 16;

function hashPassword(pass) {
  const salt = crypto.randomBytes(SCRYPT_SALT_LEN).toString('hex');
  const hash = crypto.scryptSync(String(pass), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P
  }).toString('hex');
  return `scrypt$${SCRYPT_N}$${salt}$${hash}`;
}

function verifyPassword(pass, stored) {
  if (!stored) return false;
  const storedStr = String(stored);
  // Formato nuevo: scrypt$N$salt$hash
  if (storedStr.startsWith('scrypt$')) {
    const [, nStr, salt, hash] = storedStr.split('$', 5);
    const n = Number(nStr) || SCRYPT_N;
    if (!salt || !hash) return false;
    const given = crypto.scryptSync(String(pass), salt, SCRYPT_KEYLEN, {
      N: n, r: SCRYPT_R, p: SCRYPT_P
    });
    const expected = Buffer.from(hash, 'hex');
    if (given.length !== expected.length) return false;
    return crypto.timingSafeEqual(given, expected);
  }
  // Compatibilidad con hashes legacy SHA-256 (hex) de los datos de prueba.
  const legacy = crypto.createHash('sha256').update(String(pass)).digest('hex');
  const expected = Buffer.from(storedStr, 'hex');
  const given = Buffer.from(legacy, 'hex');
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(given, expected);
}

function signToken(payload) {
  const sid = crypto.randomBytes(8).toString('hex');
  const body = Buffer.from(JSON.stringify({
    ...payload,
    sid,
    exp: Date.now() + 8 * 3600 * 1000
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', config.token.secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token) return null;
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', config.token.secret).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };