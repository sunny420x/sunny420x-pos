const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');

const databasePath = require.resolve('../database');
const cachedDatabase = require.cache[databasePath];
const inserts = [];
const fakeDatabase = {
    query() {
        throw new Error('Asset type creation must include its company ID explicitly');
    },
    auth: {
        promise() {
            return {
                async query(sql, values) {
                    inserts.push({ sql, values });
                    return [{ insertId: 9 }];
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
const { createAssetType, saveProductAssetRecipe } = require('../model/asset');
if (cachedDatabase) require.cache[databasePath] = cachedDatabase;
else delete require.cache[databasePath];

const viewsPath = path.resolve(__dirname, '../views');
const userData = [{
    username: 'tester',
    type: 'admin',
    color: '#262626',
    permission: 'products',
    stock_mode: 'pos',
    company_name: 'Test',
}];

test('new asset categories are inserted with the selected company ID', async () => {
    inserts.length = 0;
    await createAssetType('บรรจุภัณฑ์', 7);
    assert.deepEqual(inserts, [{
        sql: 'INSERT INTO asset_types (name, company_id) VALUES (?, ?)',
        values: ['บรรจุภัณฑ์', 7],
    }]);
});

test('asset recipe upsert includes company ID outside the tenant SQL rewriter', async () => {
    inserts.length = 0;
    await saveProductAssetRecipe({
        productType: 4,
        productName: 'ชาเขียว',
        assetType: 2,
        assetName: 'แก้ว',
        amount: 1,
        companyId: 7,
    });
    assert.deepEqual(inserts, [{
        sql: `INSERT INTO product_asset_recipes
        (product_type, product_name, asset_type, asset_name, amount_per_product, company_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE amount_per_product = VALUES(amount_per_product)`,
        values: [4, 'ชาเขียว', 2, 'แก้ว', 1, 7],
    }]);
});

test('asset category list and add/edit forms are separate pages', async () => {
    const list = await ejs.renderFile(path.join(viewsPath, 'asset_types.ejs'), {
        user_data: userData,
        assetTypes: [{ id: 9, name: 'บรรจุภัณฑ์' }],
    });
    const createForm = await ejs.renderFile(path.join(viewsPath, 'asset_type_form.ejs'), {
        user_data: userData,
        assetType: null,
    });
    const editForm = await ejs.renderFile(path.join(viewsPath, 'asset_type_form.ejs'), {
        user_data: userData,
        assetType: { id: 9, name: 'บรรจุภัณฑ์' },
    });

    assert.match(list, /หมวดหมู่วัสดุ/);
    assert.match(list, /href="\/assetTypes\/9\/edit"/);
    assert.match(createForm, /เพิ่มหมวดหมู่วัสดุ/);
    assert.match(editForm, /action="\/assetTypes\/9\/edit"/);
    assert.match(editForm, /value="บรรจุภัณฑ์"/);
});

test('asset recipe page persists the selected product category across reloads', async () => {
    const html = await ejs.renderFile(path.join(viewsPath, 'asset_recipes.ejs'), {
        user_data: userData,
        assetGroups: [{ asset_type: 2, asset_name: 'แก้ว', type: 'บรรจุภัณฑ์' }],
        productGroups: [{ product_type: 4, product_name: 'ชาเขียว' }],
        productTypes: [{ id: 4, name: 'เครื่องดื่ม' }],
        recipes: [],
    });

    assert.match(html, /id="recipe-product-type"[^>]*data-persist-filter/);
    assert.match(html, /window\.location\.reload\(\)/);
});
