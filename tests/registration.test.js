const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');

const databasePath = require.resolve('../database');
const cachedDatabase = require.cache[databasePath];
const calls = [];
const connection = {
    async beginTransaction() {},
    async query(sql, values) {
        calls.push({ sql, values });
        if (sql.startsWith('INSERT INTO companies')) return [{ insertId: 42 }];
        if (sql.startsWith('INSERT INTO user_types')) return [{ insertId: 8 }];
        return [{ insertId: 1 }];
    },
    async commit() {},
    async rollback() {},
    release() {},
};
const fakeDatabase = {
    auth: {
        promise: () => ({ getConnection: async () => connection }),
    },
};
require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: fakeDatabase,
};
const authRouter = require('../middleware/auth');
if (cachedDatabase) require.cache[databasePath] = cachedDatabase;
else delete require.cache[databasePath];

const viewsPath = path.resolve(__dirname, '../views');
const registerHandler = authRouter.stack
    .find(layer => layer.route?.path === '/register' && layer.route.methods.post)
    .route.stack[0].handle;

function response() {
    return {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        render(view, locals) {
            this.rendered = { view, locals };
            return this;
        },
        redirect(pathname) {
            this.redirected = pathname;
            return this;
        },
    };
}

test('registration stores the selected stock mode on the new company', async () => {
    calls.length = 0;
    const res = response();
    await registerHandler({
        body: {
            company_name: 'ร้านทดสอบ',
            username: 'owner',
            password: 'password123',
            full_name: 'เจ้าของร้าน',
            stock_mode: 'inventory_only',
        },
    }, res, error => { throw error; });

    const companyInsert = calls.find(call => call.sql.startsWith('INSERT INTO companies'));
    assert.match(companyInsert.sql, /name, code, stock_mode/);
    assert.equal(companyInsert.values[2], 'inventory_only');
    assert.equal(res.redirected, '/login');
});

test('registration rejects unsupported stock modes before opening a transaction', async () => {
    calls.length = 0;
    const res = response();
    await registerHandler({
        body: {
            company_name: 'ร้านทดสอบ',
            username: 'owner',
            password: 'password123',
            full_name: 'เจ้าของร้าน',
            stock_mode: 'unsupported',
        },
    }, res, error => { throw error; });

    assert.equal(res.statusCode, 400);
    assert.equal(res.rendered.locals.stock_mode, 'pos');
    assert.equal(calls.length, 0);
});

test('registration page offers both stock modes and defaults to POS', async () => {
    const html = await ejs.renderFile(path.join(viewsPath, 'register.ejs'), {
        error: null,
        stock_mode: 'pos',
    });

    assert.match(html, /name="stock_mode" value="pos" checked/);
    assert.match(html, /name="stock_mode" value="inventory_only"/);
    assert.match(html, /จัดการสต๊อกอย่างเดียว/);
});

test('top bar names the current stock mode', async () => {
    const user = {
        username: 'owner',
        type: 'ผู้ดูแลระบบ',
        color: '#262626',
        permission: 'products,bills,customers,users',
        company_name: 'ร้านทดสอบ',
        stock_mode: 'inventory_only',
    };
    const html = await ejs.renderFile(path.join(viewsPath, 'include/navigator.ejs'), {
        user_data: [user],
    });
    assert.match(html, /class="app-topbar-title">โหมดจัดการสต๊อก/);
    assert.match(html, /ติดตามสินค้าและจำนวนคงเหลือ/);
});
