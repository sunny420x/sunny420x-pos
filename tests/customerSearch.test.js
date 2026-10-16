const test = require('node:test');
const assert = require('node:assert/strict');
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
const { getCustomersPage } = require('../model/customer');
if (cachedDatabase) require.cache[databasePath] = cachedDatabase;
else delete require.cache[databasePath];

const viewsPath = path.resolve(__dirname, '../views');

test('customer search filters by full name or phone number before pagination', async () => {
    const originalQuery = fakeDatabase.query;
    const calls = [];
    fakeDatabase.query = (sql, values, callback) => {
        calls.push({ sql, values });
        callback(null, sql.includes('COUNT(*)') ? [{ total: 45 }] : [{ id: 1 }]);
    };

    try {
        const byName = await getCustomersPage('fullName', 'Somchai', '2');
        assert.equal(byName.pagination.page, 2);
        assert.match(calls[0].sql, /CONCAT\(c\.first_name, " ", c\.last_name\) LIKE \?/);
        assert.deepEqual(calls[0].values, ['%Somchai%']);
        assert.match(calls[1].sql, /LIMIT \? OFFSET \?/);
        assert.deepEqual(calls[1].values, ['%Somchai%', 20, 20]);

        calls.length = 0;
        await getCustomersPage('phoneNumber', '081-234-5678', '1');
        assert.match(calls[0].sql, /c\.phone_number LIKE \?/);
        assert.deepEqual(calls[0].values, ['%0812345678%']);

        await assert.rejects(getCustomersPage('cardId', '123', '1'), /Unsupported customer search field/);
    } finally {
        fakeDatabase.query = originalQuery;
    }
});

test('customer list exposes only name and phone search fields', async () => {
    const html = await ejs.renderFile(path.join(viewsPath, 'customers.ejs'), {
        user_data: [{
            username: 'tester',
            type: 'admin',
            color: '#262626',
            permission: 'products,bills,customers',
            stock_mode: 'pos',
        }],
        Helper: class {},
    });

    assert.match(html, /id="search_customer_by_fullname"/);
    assert.match(html, /id="search_customer_by_phone_number"/);
    assert.doesNotMatch(html, /card_id|searchCustomerByCardId|search_customer_by_id/i);
    assert.match(html, /\/searchCustomerByFullName/);
    assert.match(html, /\/searchCustomerByPhoneNumber/);
});
