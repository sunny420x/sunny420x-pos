const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const moment = require('moment');
const { scopeSql } = require('../middleware/tenant');

const databasePath = require.resolve('../database');
const cachedDatabase = require.cache[databasePath];
const statements = [];
let stockAvailable = 3;
let confirmStockAvailable = true;
let quoteStatus = 'pending';
const connection = {
    async beginTransaction() {
        statements.push({ sql: 'BEGIN' });
    },
    async commit() {
        statements.push({ sql: 'COMMIT' });
    },
    async rollback() {
        statements.push({ sql: 'ROLLBACK' });
    },
    release() {},
    async query(sql, values = []) {
        statements.push({ sql, values });
        if (sql.includes('FROM product_inventory_settings')) return [[]];
        if (sql.includes('FROM product_asset_recipes')) return [[]];
        if (sql.includes('FROM quotation_asset_items')) return [[]];
        if (sql.startsWith('SELECT COUNT(*) AS available_count')) return [[{ available_count: stockAvailable }]];
        if (sql.startsWith('SELECT id, code, amount, discount_type')) {
            return [[{
                id: 9,
                code: 'QUOTE10',
                amount: 10,
                discount_type: 'percentage',
                minimum_purchase: 0,
            }]];
        }
        if (sql.startsWith('INSERT INTO quotations')) return [{ insertId: 24 }];
        if (sql.startsWith('SELECT * FROM quotations')) {
            if (quoteStatus === 'missing') return [[]];
            return [[{
                id: 24,
                status: quoteStatus,
                customer_id: null,
                discount_id: null,
                subtotal: 60,
                total: 60,
                billing_id: quoteStatus === 'confirmed' ? 31 : null,
            }]];
        }
        if (sql.startsWith('SELECT id FROM companies')) return [[{ id: 7 }]];
        if (sql.includes('FROM quotation_items')) {
            return [[{ product_type: 4, product_name: 'ชาเขียว', product_price: 30, amount: 2 }]];
        }
        if (sql.startsWith('SELECT COALESCE(MAX(billing_id)')) return [[{ billing_id: 31 }]];
        if (sql.startsWith('SELECT id FROM products')) {
            return [confirmStockAvailable ? [{ id: 101 }, { id: 102 }] : []];
        }
        if (sql.startsWith('UPDATE products')) return [{ affectedRows: 1 }];
        if (sql.startsWith('UPDATE quotations')) return [{ affectedRows: 1 }];
        if (sql.startsWith('INSERT INTO `transaction`')) return [{ insertId: 1 }];
        if (sql.startsWith('INSERT INTO quotation_items')) return [{ insertId: 1 }];
        throw new Error(`Unexpected quotation query: ${sql}`);
    },
};
const fakeDatabase = {
    query(sql, values, callback) {
        callback(null, sql.includes('COUNT(*) AS total') ? [{ total: 41 }] : []);
    },
    auth: {
        promise() {
            return { getConnection: async () => connection };
        },
    },
};
require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: fakeDatabase,
};
const { confirmQuotation, createQuotation, getQuotationsPage } = require('../model/quotation');
if (cachedDatabase) require.cache[databasePath] = cachedDatabase;
else delete require.cache[databasePath];

const viewsPath = path.resolve(__dirname, '../views');
const cart = [{
    product_type: 4,
    product_name: 'ชาเขียว',
    product_price: 30,
    amount: 2,
}];

test('creating a quotation saves item snapshots without changing stock or sales', async () => {
    statements.length = 0;
    stockAvailable = 3;
    const result = await createQuotation({
        companyId: 7,
        userId: 2,
        cart,
        customerId: null,
        discountCode: null,
    });

    assert.equal(result.id, 24);
    assert.equal(result.subtotal, 60);
    assert.equal(result.total, 60);
    assert.ok(statements.some(({ sql }) => sql.startsWith('INSERT INTO quotations')));
    assert.ok(statements.some(({ sql }) => sql.startsWith('INSERT INTO quotation_items')));
    assert.ok(!statements.some(({ sql }) => sql.startsWith('UPDATE products')));
    assert.ok(!statements.some(({ sql }) => sql.startsWith('INSERT INTO `transaction`')));
    assert.ok(statements.some(({ sql }) => sql === 'COMMIT'));
});

test('creating a quote fails when current stock is insufficient', async () => {
    statements.length = 0;
    stockAvailable = 1;
    await assert.rejects(
        createQuotation({ companyId: 7, userId: 2, cart, customerId: null, discountCode: null }),
        /มีไม่เพียงพอ/
    );
    assert.ok(!statements.some(({ sql }) => sql.startsWith('INSERT INTO quotations')));
    assert.ok(!statements.some(({ sql }) => sql.startsWith('UPDATE products')));
    assert.ok(statements.some(({ sql }) => sql === 'ROLLBACK'));
});

test('quotation checks a discount but does not consume it before sale confirmation', async () => {
    statements.length = 0;
    stockAvailable = 3;
    await createQuotation({
        companyId: 7,
        userId: 2,
        cart,
        customerId: null,
        discountCode: 'QUOTE10',
    });
    assert.ok(statements.some(({ sql }) => sql.startsWith('SELECT id, code, amount, discount_type')));
    assert.ok(!statements.some(({ sql }) => sql.startsWith('UPDATE discounts')));
    assert.ok(!statements.some(({ sql }) => sql.startsWith('UPDATE products')));
});

test('confirming a quotation atomically deducts stock and creates the sale', async () => {
    statements.length = 0;
    quoteStatus = 'pending';
    const result = await confirmQuotation({ companyId: 7, id: 24 });
    assert.deepEqual(result, { billingId: 31, alreadyConfirmed: false });
    assert.ok(statements.some(({ sql }) => sql.startsWith('SELECT id FROM products') && sql.includes('FOR UPDATE')));
    assert.equal(statements.filter(({ sql }) => sql.startsWith('UPDATE products')).length, 2);
    assert.equal(statements.filter(({ sql }) => sql.startsWith('INSERT INTO `transaction`')).length, 2);
    assert.ok(statements.some(({ sql }) => sql.startsWith('UPDATE quotations SET status = \'confirmed\'')));
    assert.ok(statements.some(({ sql }) => sql === 'COMMIT'));
});

test('confirming an already confirmed quote reuses its bill without selling twice', async () => {
    statements.length = 0;
    quoteStatus = 'confirmed';
    const result = await confirmQuotation({ companyId: 7, id: 24 });
    assert.deepEqual(result, { billingId: 31, alreadyConfirmed: true });
    assert.ok(!statements.some(({ sql }) => sql.startsWith('UPDATE products')));
    assert.ok(!statements.some(({ sql }) => sql.startsWith('INSERT INTO `transaction`')));
});

test('confirmation rolls back the sale if stock changed after the quote', async () => {
    statements.length = 0;
    quoteStatus = 'pending';
    confirmStockAvailable = false;
    await assert.rejects(
        confirmQuotation({ companyId: 7, id: 24 }),
        /มีไม่เพียงพอ/
    );
    assert.ok(!statements.some(({ sql }) => sql.startsWith('UPDATE products')));
    assert.ok(!statements.some(({ sql }) => sql.startsWith('INSERT INTO `transaction`')));
    assert.ok(!statements.some(({ sql }) => sql.startsWith('UPDATE quotations SET status')));
    assert.ok(statements.some(({ sql }) => sql === 'ROLLBACK'));
    confirmStockAvailable = true;
});

test('quotation page explains stock is not reserved and requires confirmation to sell', async () => {
    const html = await ejs.renderFile(path.join(viewsPath, 'quotation.ejs'), {
        user_data: [{ company_name: 'ร้านทดสอบ', username: 'tester', type: 'admin', color: '#262626', permission: 'products', stock_mode: 'pos' }],
        quotation: {
            id: 24,
            status: 'pending',
            created_at: '2026-10-17 07:00:00',
            first_name: 'ลูกค้า',
            last_name: 'ทดสอบ',
            phone_number: null,
            discount_id: null,
            subtotal: 60,
            total: 60,
        },
        items: [{ product_name: 'ชาเขียว', product_price: 30, amount: 2, line_total: 60 }],
        moment,
        Helper: class {
            ThaiPhoneNumber(value) { return value; }
            numberWithCommas(value) { return Number(value).toLocaleString('en-US'); }
        },
    });

    assert.match(html, /ยังไม่ตัดสต๊อก/);
    assert.match(html, /ยืนยันการขายและตัดสต๊อก/);
    assert.match(html, /action="\/quotations\/24\/confirm"/);
    assert.match(html, /QT-24/);
});

test('quotation list query is tenant-scoped and paginated', async () => {
    const originalQuery = fakeDatabase.query;
    const queries = [];
    fakeDatabase.query = (sql, values, callback) => {
        queries.push({ sql, values });
        callback(null, sql.includes('COUNT(*) AS total') ? [{ total: 41 }] : [{ id: 24 }]);
    };
    try {
        const result = await getQuotationsPage('2');
        assert.equal(result.quotations[0].id, 24);
        assert.equal(result.pagination.page, 2);
        assert.equal(result.pagination.offset, 20);
        assert.match(scopeSql(queries[0].sql, 7), /FROM \(SELECT \* FROM quotations WHERE company_id = 7\)/);
        assert.match(scopeSql(queries[1].sql, 7), /LEFT JOIN \(SELECT \* FROM customers WHERE company_id = 7\)/);
        assert.match(queries[1].sql, /LIMIT \? OFFSET \?/);
        assert.deepEqual(queries[1].values, [20, 20]);
    } finally {
        fakeDatabase.query = originalQuery;
    }
});

test('quotation list renders pending and confirmed documents with links', async () => {
    const html = await ejs.renderFile(path.join(viewsPath, 'quotations.ejs'), {
        user_data: [{ company_name: 'Test', username: 'tester', type: 'admin', color: '#262626', permission: 'products', stock_mode: 'pos' }],
        quotations: [
            { id: 24, status: 'pending', created_at: '2026-10-17 07:00:00', first_name: null, last_name: null, total: 60, billing_id: null },
            { id: 23, status: 'confirmed', created_at: '2026-10-16 07:00:00', first_name: 'Somchai', last_name: 'Test', total: 100, billing_id: 31 },
        ],
        pagination: { page: 1, pageSize: 20, offset: 0, total: 2, totalPages: 1, href: page => `/quotations?page=${page}` },
        moment,
        Helper: class { numberWithCommas(value) { return Number(value).toLocaleString('en-US'); } },
    });
    assert.match(html, /QT-24/);
    assert.match(html, /QT-23/);
    assert.match(html, /href="\/quotations\/24"/);
    assert.match(html, /href="\/billing\/31"/);
    assert.match(html, /รอยืนยันการขาย/);
    assert.match(html, /ยืนยันการขายแล้ว/);
});

test('sidebar exposes quotation list in POS mode', async () => {
    const html = await ejs.renderFile(path.join(viewsPath, 'include/menu.ejs'), {
        user_data: [{ username: 'tester', type: 'admin', color: '#262626', permission: 'products', stock_mode: 'pos' }],
    });
    assert.match(html, /href="\/quotations"/);
    assert.match(html, /ใบเสนอราคา/);
    assert.match(html, /href="\/assets"/);
    const inventoryHtml = await ejs.renderFile(path.join(viewsPath, 'include/menu.ejs'), {
        user_data: [{ username: 'tester', type: 'admin', color: '#262626', permission: 'products', stock_mode: 'inventory_only' }],
    });
    assert.doesNotMatch(inventoryHtml, /href="\/assets"/);
});

test('canonical schema stores tenant-scoped quotes, materials, and separate asset categories', () => {
    const schema = fs.readFileSync(path.join(__dirname, '../schema/pos.sql'), 'utf8');
    assert.match(schema, /CREATE TABLE IF NOT EXISTS `quotations`/);
    assert.match(schema, /CREATE TABLE IF NOT EXISTS `quotation_items`/);
    assert.match(schema, /KEY idx_quotations_company_status \(company_id, status, id\)/);
    assert.match(schema, /KEY idx_quotation_items_company_quote \(company_id, quotation_id, id\)/);
    assert.match(schema, /CREATE TABLE IF NOT EXISTS `asset_types`/);
    assert.match(schema, /CREATE TABLE IF NOT EXISTS `quotation_asset_items`/);
});
