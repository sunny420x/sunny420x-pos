const express = require('express');
const { randomBytes } = require('node:crypto');
const pool = require('../database').auth;
const { hashToken, hashPassword, verifyPassword } = require('./password');
const router = express.Router();
const options = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 86400000 };
async function renderLogin(req, res, error = null, status = 200) {
    const [companies] = await pool.promise().query('SELECT id, name, code FROM companies ORDER BY name ASC, id ASC');
    return res.status(status).render('login', { error, companies, company_code: req.body?.company_code || '', username: req.body?.username || '' });
}
router.get('/login', (req, res, next) => renderLogin(req, res).catch(next));
router.get('/register', (req, res) => res.render('register', { error: null }));
router.post('/register', async (req, res, next) => {
    const { company_name, username, password, full_name } = req.body;
    const company_code = 'company-' + randomBytes(12).toString('hex');
    if (![company_name, username, full_name].every(x => typeof x === 'string' && x.trim().length && x.length <= 100) || typeof password !== 'string' || password.length < 8 || password.length > 128)
        return res.status(400).render('register', { error: 'กรุณากรอกข้อมูลให้ครบ และใช้รหัสผ่าน 8–128 ตัวอักษร' });
    let conn;
    try {
        conn = await pool.promise().getConnection(); await conn.beginTransaction();
        const [company] = await conn.query('INSERT INTO companies(name, code) VALUES (?, ?)', [company_name.trim(), company_code.toLowerCase()]);
        const id = company.insertId;
        const [role] = await conn.query('INSERT INTO user_types(name, permission, company_id) VALUES (?, ?, ?)', ['ผู้ดูแลระบบ', 'customers,products,bills,users', id]);
        await conn.query('INSERT INTO users(username,password,type,full_name,created_by,created_at,company_id) VALUES(?,?,?,?,0,NOW(),?)', [username.trim(), hashPassword(password), role.insertId, full_name.trim(), id]);
        await conn.commit(); res.redirect('/login');
    } catch (err) { if (conn) await conn.rollback(); if (err.code === 'ER_DUP_ENTRY') return res.status(409).render('register', { error: 'ไม่สามารถสร้างบริษัทได้ กรุณาลองอีกครั้ง' }); next(err); }
    finally { if (conn) conn.release(); }
});
router.post('/login', async (req, res, next) => {
    const { company_code, username, password } = req.body;
    try {
        if (typeof company_code !== 'string' || typeof username !== 'string' || typeof password !== 'string' || password.length > 128) return await renderLogin(req, res, 'กรุณากรอกข้อมูลให้ครบ', 400);
        const [users] = await pool.promise().query('SELECT u.* FROM users u JOIN companies c ON c.id=u.company_id WHERE c.code=? AND u.username=?', [company_code.toLowerCase(), username]);
        if (users.length !== 1 || !verifyPassword(password, users[0].password)) return await renderLogin(req, res, 'ข้อมูลเข้าสู่ระบบไม่ถูกต้อง', 401);
        const user = users[0], token = randomBytes(32).toString('hex');
        await pool.promise().query('INSERT INTO auth_sessions(token_hash,user_id,company_id,expires_at) VALUES(?,?,?,DATE_ADD(NOW(), INTERVAL 1 DAY))', [hashToken(token), user.id, user.company_id]);
        await pool.promise().query('INSERT INTO login_history(user_id,company_id,time,ip_address) VALUES(?,?,NOW(),?)', [user.id, user.company_id, req.ip]);
        res.cookie('access_token', token, options); res.redirect('/');
    } catch (err) { next(err); }
});
router.get('/logout', async (req, res, next) => {
    try { if (req.cookies.access_token) await pool.promise().query('DELETE FROM auth_sessions WHERE token_hash=?', [hashToken(req.cookies.access_token)]); res.clearCookie('access_token', options); res.redirect('/login'); } catch (err) { next(err); }
});
module.exports = router;

