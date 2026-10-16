const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const ejs = require('ejs');
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
const { getProductsStockPage } = require('../model/product');
if (cachedDatabase) require.cache[databasePath] = cachedDatabase;
else delete require.cache[databasePath];

const viewsPath = path.resolve(__dirname, '../views');

test('product stock query filters by name and category before pagination', async () => {
    const originalQuery = fakeDatabase.query;
    const calls = [];
    fakeDatabase.query = (sql, values, callback) => {
        calls.push({ sql, values });
        callback(null, sql.includes('COUNT(*)') ? [{ total: 45 }] : [{ name: 'ชาเขียว' }]);
    };

    try {
        const result = await getProductsStockPage('4', 'ชาเขียว', '2');
        assert.equal(result.pagination.page, 2);
        assert.equal(result.pagination.offset, 20);
        assert.match(calls[0].sql, /t\.type = \? AND t\.name LIKE \?/);
        assert.deepEqual(calls[0].values, ['4', '%ชาเขียว%']);
        assert.match(calls[1].sql, /t\.type = \? AND t\.name LIKE \?/);
        assert.match(calls[1].sql, /LIMIT \? OFFSET \?/);
        assert.deepEqual(calls[1].values, ['4', '%ชาเขียว%', 20, 20]);

        calls.length = 0;
        await getProductsStockPage('all', 'ชา', '1');
        assert.match(calls[0].sql, /WHERE t\.name LIKE \?/);
        assert.deepEqual(calls[0].values, ['%ชา%']);
    } finally {
        fakeDatabase.query = originalQuery;
    }
});

test('product stock page renders debounced name search and preserves filters', async () => {
    const html = await ejs.renderFile(path.join(viewsPath, 'products_stock.ejs'), {
        user_data: [{
            username: 'tester',
            type: 'admin',
            color: '#262626',
            permission: 'products,bills,customers',
            stock_mode: 'pos',
            company_name: 'Test',
        }],
        product_types: [{ id: 4, name: 'เครื่องดื่ม' }],
        customers: [],
        stock_mode: 'pos',
        type: 'all',
        option: 'list',
    });

    assert.match(html, /id="search_product_name"/);
    assert.match(html, /name: _name/);
    assert.match(html, /params\.set\('name', _name\)/);
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
    for (const [, script] of scripts) {
        if (script.trim()) new vm.Script(script);
    }
});
