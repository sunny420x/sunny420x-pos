const test = require('node:test');
const assert = require('node:assert/strict');

const databasePath = require.resolve('../database');
const cachedDatabase = require.cache[databasePath];
const statements = [];
let trackingMode = 'quantity';
let availableAssets = 5;
let recipeRows = [{
    product_type: 4,
    product_name: 'ชาเขียว',
    asset_type: 2,
    asset_name: 'แก้ว',
    amount_per_product: 1,
}];
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
        if (sql.includes('FROM product_inventory_settings')) {
            if (sql.includes('SELECT tracking_mode, is_available')) {
                return [[{ tracking_mode: trackingMode, is_available: 1 }]];
            }
            if (sql.includes('SELECT tracking_mode FROM')) {
                return [[{ tracking_mode: trackingMode }]];
            }
        }
        if (sql.includes('FROM product_asset_recipes')) return [recipeRows];
        if (sql.startsWith('SELECT id FROM companies')) return [[{ id: 7 }]];
        if (sql.includes('MAX(billing_id)')) return [[{ billing_id: 41 }]];
        if (sql.startsWith('SELECT id FROM products')) {
            return [[{ id: 101 }, { id: 102 }]];
        }
        if (sql.startsWith('SELECT id FROM assets')) {
            return [Array.from({ length: Math.min(availableAssets, Number(values.at(-1))) }, (_, index) => ({ id: index + 501 }))];
        }
        if (sql.startsWith('UPDATE products') || sql.startsWith('UPDATE assets')) {
            return [{ affectedRows: sql.startsWith('UPDATE assets') ? values.length - 2 : 1 }];
        }
        if (sql.startsWith('INSERT INTO')) return [{ insertId: 1 }];
        throw new Error(`Unexpected sale query: ${sql}`);
    },
};
const fakeDatabase = {
    query() {
        throw new Error('Unexpected non-transactional query');
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
const { createSale } = require('../model/sale');
if (cachedDatabase) require.cache[databasePath] = cachedDatabase;
else delete require.cache[databasePath];

const cart = [{
    product_type: 4,
    product_name: 'ชาเขียว',
    product_price: 30,
    amount: 1,
}];

test('sale atomically deducts configured materials without adding them to bill transactions', async () => {
    statements.length = 0;
    trackingMode = 'quantity';
    availableAssets = 5;
    recipeRows = [{
        product_type: 4,
        product_name: 'ชาเขียว',
        asset_type: 2,
        asset_name: 'แก้ว',
        amount_per_product: 1,
    }];

    const result = await createSale({
        companyId: 7,
        cart,
        customerId: null,
        discountCode: null,
        assetAdjustments: [{ asset_type: 2, asset_name: 'แก้ว', delta: 1 }],
    });

    assert.equal(result.billingId, 41);
    assert.equal(statements.filter(({ sql }) => sql.startsWith('INSERT INTO `transaction`')).length, 1);
    assert.equal(statements.filter(({ sql }) => sql.startsWith('INSERT INTO asset_transactions')).length, 2);
    assert.ok(statements.some(({ sql }) => sql.startsWith('UPDATE assets SET is_used = 1')));
    assert.ok(statements.some(({ sql }) => sql === 'COMMIT'));
});

test('sale rolls back product stock when configured materials are insufficient', async () => {
    statements.length = 0;
    trackingMode = 'quantity';
    availableAssets = 0;
    recipeRows = [{
        product_type: 4,
        product_name: 'ชาเขียว',
        asset_type: 2,
        asset_name: 'แก้ว',
        amount_per_product: 1,
    }];

    await assert.rejects(
        createSale({
            companyId: 7,
            cart,
            customerId: null,
            discountCode: null,
        }),
        /วัสดุ แก้ว มีไม่เพียงพอ/
    );
    assert.ok(statements.some(({ sql }) => sql.startsWith('UPDATE products')));
    assert.ok(!statements.some(({ sql }) => sql === 'COMMIT'));
    assert.ok(statements.some(({ sql }) => sql === 'ROLLBACK'));
});

test('availability-tracked products remain sellable repeatedly without marking units sold', async () => {
    statements.length = 0;
    trackingMode = 'availability';
    availableAssets = 5;
    recipeRows = [];

    await createSale({
        companyId: 7,
        cart: [{ ...cart[0], amount: 2 }],
        customerId: null,
        discountCode: null,
    });

    assert.equal(statements.filter(({ sql }) => sql.startsWith('UPDATE products')).length, 0);
    assert.equal(statements.filter(({ sql }) => sql.startsWith('INSERT INTO `transaction`')).length, 2);
    assert.ok(statements.some(({ sql }) => sql === 'COMMIT'));
});
