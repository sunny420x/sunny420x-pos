const db = require('../database');
const { context } = require('./tenant');
const { hashToken } = require('./password');

function initAccessToken(req, res, next) {
    const token = req.cookies.access_token;
    if (!token) return res.redirect('/login');
    db.auth.query(`SELECT u.id, u.company_id, u.username, u.full_name, ut.name AS type,
 u.type AS type_id, ut.permission, u.color FROM auth_sessions s
 JOIN users u ON u.id = s.user_id AND u.company_id = s.company_id
 JOIN user_types ut ON ut.id = u.type AND ut.company_id = u.company_id
 WHERE s.token_hash = ? AND s.expires_at > NOW()`, [hashToken(token)], (err, users) => {
        if (err) return next(err);
        if (users.length !== 1) { res.clearCookie('access_token'); return res.redirect('/login'); }
        req.user = users[0]; req.company_id = req.user.company_id;
        context.run({ companyId: req.company_id }, next);
    });
}

module.exports = initAccessToken;
