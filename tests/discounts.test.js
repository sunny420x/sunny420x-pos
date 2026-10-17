const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const vm = require('node:vm');

const databasePath = require.resolve('../database');
const cachedDatabase = require.cache[databasePath];
const calls = [];
const fakeDatabase = {
    query(sql, values, callback) {
        calls.push({ sql, values });
        if (sql.startsWith('SELECT * FROM discounts')) {
            callback(null, [{ id: 7, amount: 50, discount_type: 'fixed', minimum_purchase: 500, max_uses: 10 }]);
            return;
        }
        callback(null, { affectedRows: 1 });
    },
};
require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: fakeDatabase,
};
const { checkDiscount } = require('../model/discount');
if (cachedDatabase) require.cache[databasePath] = cachedDatabase;
else delete require.cache[databasePath];

const viewsPath = path.resolve(__dirname, '../views');

test('discount below its minimum purchase is rejected without consuming the code', async () => {
    calls.length = 0;
    const result = await checkDiscount('FIXED50', 499);
    assert.deepEqual(result, { valid: false, minimumPurchase: 500 });
    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /status = 0 AND code = \?/);
});

test('eligible fixed discount is returned and claimed once', async () => {
    calls.length = 0;
    const result = await checkDiscount('FIXED50', 500);
    assert.equal(result.valid, true);
    assert.equal(result.discount.amount, 50);
    assert.equal(result.discount.discount_type, 'fixed');
    assert.equal(calls.length, 2);
    assert.match(calls[1].sql, /WHERE id = \? AND status = 0/);
    assert.match(calls[1].sql, /max_uses IS NULL OR usage_count < max_uses/);
    assert.match(calls[1].sql, /usage_count = usage_count \+ 1/);
    assert.deepEqual(calls[1].values, [7]);
});

test('unlimited discount claims keep the code available and count each redemption', async () => {
    const originalQuery = fakeDatabase.query;
    fakeDatabase.query = (sql, values, callback) => {
        calls.push({ sql, values });
        if (sql.startsWith('SELECT * FROM discounts')) {
            callback(null, [{ id: 8, amount: 10, discount_type: 'percentage', minimum_purchase: 0, max_uses: null }]);
        } else {
            callback(null, { affectedRows: 1 });
        }
    };

    try {
        calls.length = 0;
        const result = await checkDiscount('UNLIMITED', 100);
        assert.equal(result.valid, true);
        assert.equal(result.discount.max_uses, null);
        assert.match(calls[1].sql, /status = IF\(max_uses IS NOT NULL AND usage_count \+ 1 >= max_uses, 1, 0\)/);
    } finally {
        fakeDatabase.query = originalQuery;
    }
});

test('discount forms offer percentage, fixed amount, minimum purchase, and optional usage limit', async () => {
    const addHtml = await ejs.renderFile(path.join(viewsPath, 'discounts/add_discount.ejs'), {
        user_data: [{ username: 'tester', type: 'admin', color: '#262626', permission: 'products', stock_mode: 'pos' }],
    });
    const editHtml = await ejs.renderFile(path.join(viewsPath, 'discounts/edit_discount.ejs'), {
        user_data: [{ username: 'tester', type: 'admin', color: '#262626', permission: 'products', stock_mode: 'pos' }],
        discount: { id: 1, code: 'FIXED50', amount: 50, discount_type: 'fixed', minimum_purchase: 500 },
    });
    for (const html of [addHtml, editHtml]) {
        assert.match(html, /name="discount_type"/);
        assert.match(html, /value="fixed"/);
        assert.match(html, /name="minimum_purchase"/);
        assert.match(html, /name="max_uses"/);
        assert.match(html, /เว้นว่าง = ไม่จำกัด/);
        for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
            if (script.trim()) new vm.Script(script);
        }
    }
    assert.match(editHtml, /ยอดซื้อขั้นต่ำ \(บาท\)/);
});

test('receipt renders capped fixed discount for thermal and A5 formats', async () => {
    const receiptPath = path.join(viewsPath, 'billing.ejs');
    const options = {
        user_data: [{ company_name: 'ร้านทดสอบ' }],
        bill: [{
            name: 'สินค้า',
            price: 100,
            total_price: 300,
            amount: 3,
            first_name: null,
            last_name: null,
            phone_number: null,
            created_at: '2026-10-16 12:30:00',
            discount_amount: 500,
            discount_type: 'fixed',
        }],
        billing_id: 125,
        moment: require('moment'),
        Helper: class {
            numberWithCommas(value) {
                return Number(value).toLocaleString('en-US');
            }
            ThaiPhoneNumber(value) {
                return value;
            }
        },
    };
    const thermalHtml = await ejs.renderFile(receiptPath, { ...options, receipt_size: '80x80' });
    const a5Html = await ejs.renderFile(receiptPath, { ...options, receipt_size: 'a5_landscape' });
    for (const html of [thermalHtml, a5Html]) {
        assert.match(html, /ส่วนลด \(500 บาท\)/);
        assert.match(html, /-300 บาท/);
        assert.match(html, /0 บาท/);
    }
});

test('canonical schema adds percentage-compatible type and minimum amount fields', () => {
    const schema = fs.readFileSync(path.join(__dirname, '../schema/pos.sql'), 'utf8');
    assert.match(schema, /`amount` bigint\(20\) UNSIGNED NOT NULL/);
    assert.match(schema, /`discount_type` enum\('percentage','fixed'\) NOT NULL DEFAULT 'percentage'/);
    assert.match(schema, /`minimum_purchase` bigint\(20\) UNSIGNED NOT NULL DEFAULT 0/);
    assert.match(schema, /`max_uses` int\(10\) UNSIGNED DEFAULT 1/);
    assert.match(schema, /`usage_count` int\(10\) UNSIGNED NOT NULL DEFAULT 0/);
});
