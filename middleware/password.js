const { randomBytes, createHash, scryptSync, timingSafeEqual } = require('node:crypto');
const hashToken = token => createHash('sha256').update(token).digest('hex');
const hashPassword = password => { const salt = randomBytes(16).toString('hex'); return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`; };
function verifyPassword(password, stored) {
    if (!stored.startsWith('scrypt$')) return createHash('sha256').update(password).digest('base64') === stored;
    const [, salt, digest] = stored.split('$');
    const actual = scryptSync(password, salt, 64), expected = Buffer.from(digest, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}
module.exports = { hashToken, hashPassword, verifyPassword };
