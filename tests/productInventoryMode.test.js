const test = require('node:test');
const assert = require('node:assert/strict');

const databasePath = require.resolve('../database');
const cachedDatabase = require.cache[databasePath];
const statements = [];
let existingMode = 'availability';
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
        if (sql.includes('SELECT tracking_mode FROM product_inventory_settings')) {
            return [[{ tracking_mode: existingMode }]];
        }
        if (sql.includes('SELECT COUNT(*) AS total FROM products')) return [[{ total: 3 }]];
        if (sql.includes('SELECT COALESCE(SUM(value)')) return [[{ total: -2 }]];
        return [{ affectedRows: 1 }];
    },
};
const fakeDatabase = {
    query() {
        throw new Error('Unexpected non-transactional query');
    },
    auth: {
        promise() {
            return {
                getConnection: async () => connection,
                async query(sql, values) {
                    statements.push({ sql, values });
                    return [{ affectedRows: 1 }];
                },
            };
        },
    },
};
require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: fakeDatabase,
};
const { setProductTrackingMode } = require('../model/product');
if (cachedDatabase) require.cache[databasePath] = cachedDatabase;
else delete require.cache[databasePath];

test('switching from availability to quantity resets the movement ledger to real units', async () => {
    statements.length = 0;
    existingMode = 'availability';
    await setProductTrackingMode(4, 'ชาเขียว', 'quantity', 7);

    const adjustment = statements.find(({ sql }) => sql.startsWith('INSERT INTO `transaction`'));
    assert.deepEqual(adjustment.values, [4, 'ชาเขียว', 5, 7]);
    assert.ok(statements.some(({ sql }) => sql === 'COMMIT'));
});

test('switching into availability mode does not alter quantity history', async () => {
    statements.length = 0;
    existingMode = 'quantity';
    await setProductTrackingMode(4, 'ชาเขียว', 'availability', 7);

    assert.ok(!statements.some(({ sql }) => sql.includes('SELECT COUNT(*) AS total FROM products')));
    assert.ok(!statements.some(({ sql }) => sql.startsWith('INSERT INTO `transaction`')));
    assert.ok(statements.some(({ sql }) => sql === 'COMMIT'));
});

test('availability updates include the tenant ID in the upsert', async () => {
    statements.length = 0;
    const { setProductAvailability } = require('../model/product');
    await setProductAvailability(4, 'ชาเขียว', false, 7);

    assert.deepEqual(statements[0].values, [4, 'ชาเขียว', 0, 7]);
    assert.match(statements[0].sql, /is_available, company_id/);
});
