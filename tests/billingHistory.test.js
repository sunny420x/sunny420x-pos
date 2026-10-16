const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const ejs = require('ejs');
const moment = require('moment');
const { scopeSql } = require('../middleware/tenant');
const databasePath = require.resolve('../database');
const cachedDatabase = require.cache[databasePath];
const fakeDatabase = {
    query() {
        throw new Error('Unexpected database query in test setup');
    }
};
require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: fakeDatabase,
};
const { getBillingHistoriesPage } = require('../model/product');
if (cachedDatabase) require.cache[databasePath] = cachedDatabase;
else delete require.cache[databasePath];

const viewsPath = path.resolve(__dirname, '../views');

test('billing history query filters by bill number and customer name before pagination', async () => {
    const originalQuery = fakeDatabase.query;
    const calls = [];
    fakeDatabase.query = (sql, values, callback) => {
        calls.push({ sql, values });
        if (sql.includes('COUNT(DISTINCT t.billing_id)')) {
            callback(null, [{ total: 45 }]);
            return;
        }
        callback(null, [{ billing_id: 123 }]);
    };

    try {
        const result = await getBillingHistoriesPage({
            billingId: '123',
            customerName: 'Somchai'
        }, '2');

        assert.equal(result.pagination.page, 2);
        assert.equal(result.pagination.offset, 20);
        assert.match(calls[0].sql, /t\.billing_id = \?/);
        assert.match(calls[0].sql, /CONCAT_WS\(" ", c\.first_name, c\.last_name\) LIKE \?/);
        assert.deepEqual(calls[0].values, ['123', '%Somchai%']);
        assert.equal((scopeSql(calls[0].sql, 7).match(/company_id = 7/g) || []).length, 2);
        assert.match(calls[1].sql, /LIMIT \? OFFSET \?/);
        assert.deepEqual(calls[1].values, ['123', '%Somchai%', 20, 20]);
    } finally {
        fakeDatabase.query = originalQuery;
    }
});

test('billing history screen renders searchable filters without a customer select', async () => {
    const html = await ejs.renderFile(path.join(viewsPath, 'billing_histories.ejs'), {
        user_data: [{
            username: 'tester',
            type: 'admin',
            color: '#262626',
            permission: 'products,bills,customers',
            stock_mode: 'pos',
            company_name: 'Test',
        }],
        billing_id: '123',
        customer_name: 'Somchai',
    });

    assert.match(html, /id="search_by_bill"[^>]*value="123"/);
    assert.match(html, /id="search_by_customer"[^>]*value="Somchai"/);
    assert.doesNotMatch(html, /<select[^>]+id="search_by_owner"/);
    assert.match(html, /ค้นหาจากชื่อหรือนามสกุล/);
    const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
    for (const [, script] of inlineScripts) {
        if (script.trim()) new vm.Script(script);
    }
});

test('billing history cards show the bill, customer, date, quantity, and actions', async () => {
    const html = await ejs.renderFile(path.join(viewsPath, 'Components/billingHistories.ejs'), {
        bills: [{
            billing_id: 123,
            first_name: 'สมชาย',
            last_name: 'ใจดี',
            amount: 4,
            created_at: '2026-10-16 12:30:00',
        }],
        pagination: {
            page: 1,
            pageSize: 20,
            offset: 0,
            total: 1,
            totalPages: 1,
            ajax: true,
        },
        moment,
    });

    assert.match(html, /บิล #123/);
    assert.match(html, /สมชาย ใจดี/);
    assert.match(html, /4 ชิ้น/);
    assert.match(html, /href="\/billing\/123"/);
    assert.match(html, /data-delete-bill="123"/);
});

test('receipt PDF export uses a white A5 canvas without the screen shadow', async () => {
    const html = await ejs.renderFile(path.join(viewsPath, 'billing.ejs'), {
        user_data: [{ company_name: 'ร้านทดสอบ' }],
        bill: [{
            name: 'ชาสมุนไพร',
            price: 100,
            total_price: 100,
            amount: 1,
            first_name: null,
            last_name: null,
            phone_number: null,
            created_at: '2026-10-16 12:30:00',
            discount_amount: null,
        }],
        billing_id: 125,
        moment,
        Helper: class {
            numberWithCommas(value) {
                return Number(value).toLocaleString('en-US');
            }
            ThaiPhoneNumber(value) {
                return value;
            }
        },
        receipt_size: 'a5_landscape',
    });

    const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
        .map(match => match[1])
        .find(source => source.includes('async function exportToPDF'));
    assert.ok(script);
    new vm.Script(script);
    assert.match(script, /backgroundColor: '#ffffff'/);
    assert.match(script, /windowWidth: Math\.max\(document\.documentElement\.clientWidth, 1100\)/);
    assert.match(script, /receipt\.style\.boxShadow = 'none'/);
    assert.match(script, /receipt\.style\.width = '210mm'/);
});
