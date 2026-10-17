const db = require('../database');
const { createPagination } = require('./pagination');

function assetError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function query(sql, values = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, values, (err, result) => {
            if (err) return reject(err);
            resolve(result);
        });
    });
}

async function getAssetStockPage(requestedPage) {
    const [{ total }] = await query(`
        SELECT COUNT(*) AS total
        FROM (
            SELECT a.type, a.name
            FROM assets AS a
            JOIN asset_types AS pt ON pt.id = a.type
            GROUP BY a.type, a.name
        ) AS asset_groups`);
    const pagination = createPagination(requestedPage, Number(total));
    const assets = await query(`
        SELECT a.type AS type_id, pt.name AS type, a.name,
            SUM(CASE WHEN a.is_used = 0 THEN 1 ELSE 0 END) AS available_count,
            SUM(CASE WHEN a.is_used = 1 THEN 1 ELSE 0 END) AS used_count
        FROM assets AS a
        JOIN asset_types AS pt ON pt.id = a.type
        GROUP BY a.type, pt.name, a.name
        ORDER BY a.name, a.type
        LIMIT ? OFFSET ?`, [pagination.pageSize, pagination.offset]);
    return { assets, pagination };
}

async function getAvailableAssets() {
    return query(`
        SELECT a.type AS asset_type, pt.name AS type, a.name AS asset_name,
            SUM(CASE WHEN a.is_used = 0 THEN 1 ELSE 0 END) AS available_count
        FROM assets AS a
        JOIN asset_types AS pt ON pt.id = a.type
        GROUP BY a.type, pt.name, a.name
        HAVING available_count > 0
        ORDER BY a.name, a.type`);
}

async function getAllAssetGroups() {
    return query(`
        SELECT a.type AS asset_type, pt.name AS type, a.name AS asset_name,
            SUM(CASE WHEN a.is_used = 0 THEN 1 ELSE 0 END) AS available_count
        FROM assets AS a
        JOIN asset_types AS pt ON pt.id = a.type
        GROUP BY a.type, pt.name, a.name
        ORDER BY a.name, a.type`);
}

async function getAssetTypes() {
    return query('SELECT id, name FROM asset_types ORDER BY name');
}

async function getAssetType(id) {
    const rows = await query('SELECT id, name FROM asset_types WHERE id = ?', [id]);
    return rows[0] || null;
}

async function createAssetType(name, companyId) {
    await db.auth.promise().query(
        'INSERT INTO asset_types (name, company_id) VALUES (?, ?)',
        [name, companyId]
    );
}

async function updateAssetType(id, name) {
    await query('UPDATE asset_types SET name = ? WHERE id = ?', [name, id]);
}

async function getProductGroups() {
    return query(`
        SELECT type AS product_type, name AS product_name
        FROM products
        GROUP BY type, name
        ORDER BY name, type`);
}

async function getProductAssetRecipes(type, name) {
    return query(`
        SELECT r.id, r.asset_type, r.asset_name, r.amount_per_product,
            pt.name AS asset_type_name
        FROM product_asset_recipes AS r
        JOIN asset_types AS pt ON pt.id = r.asset_type
        WHERE r.product_type = ? AND r.product_name = ?
        ORDER BY r.asset_name, r.asset_type`, [type, name]);
}

async function getAllProductAssetRecipes() {
    return query(`
        SELECT r.id, r.product_type, r.product_name, r.asset_type, r.asset_name,
            r.amount_per_product, product_type.name AS product_type_name,
            asset_type.name AS asset_type_name
        FROM product_asset_recipes AS r
        JOIN product_types AS product_type ON product_type.id = r.product_type
        JOIN asset_types AS asset_type ON asset_type.id = r.asset_type
        ORDER BY r.product_name, r.asset_name`);
}

async function saveProductAssetRecipe({ productType, productName, assetType, assetName, amount, companyId }) {
    await db.auth.promise().query(`INSERT INTO product_asset_recipes
        (product_type, product_name, asset_type, asset_name, amount_per_product, company_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE amount_per_product = VALUES(amount_per_product)`,
    [productType, productName, assetType, assetName, amount, companyId]);
}

async function deleteProductAssetRecipe(id) {
    await query('DELETE FROM product_asset_recipes WHERE id = ?', [id]);
}

async function addAssetStock({ name, type, amount, importPrice, companyId }) {
    const connection = await db.auth.promise().getConnection();
    try {
        await connection.beginTransaction();
        const [inserted] = await connection.query(
            'INSERT INTO asset_transactions (type, name, value, created_at, company_id) VALUES (?, ?, ?, NOW(), ?)',
            [type, name, amount, companyId]
        );
        const assetIds = [];
        for (let index = 0; index < amount; index++) {
            const [asset] = await connection.query(
                `INSERT INTO assets (name, type, import_price, asset_transaction_id, created_at, company_id)
                VALUES (?, ?, ?, ?, NOW(), ?)`,
                [name, type, importPrice, inserted.insertId, companyId]
            );
            assetIds.push(asset.insertId);
        }
        await connection.commit();
        return { id: inserted.insertId, assetIds };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function calculateAssetUsage(connection, companyId, items, adjustments = []) {
    const usage = new Map();
    const typeIds = [...new Set(items.map(item => item.productType))];
    const [recipes] = typeIds.length ? await connection.query(
        `SELECT product_type, product_name, asset_type, asset_name, amount_per_product
        FROM product_asset_recipes
        WHERE company_id = ? AND product_type IN (${typeIds.map(() => '?').join(',')})`,
        [companyId, ...typeIds]
    ) : [[]];
    for (const recipe of recipes) {
        const amount = items.filter(candidate =>
            Number(candidate.productType) === Number(recipe.product_type) &&
            candidate.productName === recipe.product_name
        ).reduce((total, candidate) => total + candidate.amount, 0);
        if (!amount) continue;
        const key = JSON.stringify([Number(recipe.asset_type), recipe.asset_name]);
        const current = usage.get(key) || {
            assetType: Number(recipe.asset_type),
            assetName: recipe.asset_name,
            amount: 0,
        };
        current.amount += Number(recipe.amount_per_product) * amount;
        usage.set(key, current);
    }
    if (!Array.isArray(adjustments) || adjustments.length > 100) {
        throw assetError(400, 'ข้อมูลการปรับวัสดุไม่ถูกต้อง');
    }
    for (const adjustment of adjustments) {
        const assetType = Number(adjustment?.asset_type);
        const delta = Number(adjustment?.delta);
        const assetName = typeof adjustment?.asset_name === 'string' ? adjustment.asset_name.trim() : '';
        if (!Number.isSafeInteger(assetType) || assetType < 1 || !assetName || assetName.length > 200 ||
            !Number.isSafeInteger(delta) || delta < -10000 || delta > 10000) {
            throw assetError(400, 'ข้อมูลการปรับวัสดุไม่ถูกต้อง');
        }
        const key = JSON.stringify([assetType, assetName]);
        const current = usage.get(key) || { assetType, assetName, amount: 0 };
        current.amount += delta;
        if (current.amount < 0 || current.amount > 10000) {
            throw assetError(400, `จำนวนวัสดุ ${assetName} ไม่ถูกต้อง`);
        }
        usage.set(key, current);
    }
    return [...usage.values()].filter(item => item.amount > 0);
}

async function checkAssetAvailability(connection, companyId, usage) {
    for (const item of usage) {
        const [rows] = await connection.query(
            `SELECT COUNT(*) AS available_count FROM assets
            WHERE company_id = ? AND type = ? AND name = ? AND is_used = 0`,
            [companyId, item.assetType, item.assetName]
        );
        if (Number(rows[0].available_count) < item.amount) {
            throw assetError(409, `วัสดุ ${item.assetName} มีไม่เพียงพอ`);
        }
    }
}

async function deductAssetUsage(connection, companyId, usage, billingId, createdAt) {
    for (const item of usage) {
        const [assets] = await connection.query(
            `SELECT id FROM assets
            WHERE company_id = ? AND type = ? AND name = ? AND is_used = 0
            ORDER BY id LIMIT ? FOR UPDATE`,
            [companyId, item.assetType, item.assetName, item.amount]
        );
        if (assets.length < item.amount) {
            throw assetError(409, `วัสดุ ${item.assetName} มีไม่เพียงพอ`);
        }
        const ids = assets.map(asset => asset.id);
        const [updated] = await connection.query(
            `UPDATE assets SET is_used = 1, updated_at = ?
            WHERE company_id = ? AND is_used = 0 AND id IN (${ids.map(() => '?').join(',')})`,
            [createdAt, companyId, ...ids]
        );
        if (updated.affectedRows !== ids.length) {
            throw assetError(409, 'สต๊อกวัสดุเปลี่ยนแปลง กรุณาลองอีกครั้ง');
        }
        for (const asset of assets) {
            await connection.query(
                `INSERT INTO asset_transactions
                    (billing_id, type, name, value, asset_id, created_at, company_id)
                VALUES (?, ?, ?, -1, ?, ?, ?)`,
                [billingId, item.assetType, item.assetName, asset.id, createdAt, companyId]
            );
        }
    }
}

module.exports = {
    addAssetStock,
    createAssetType,
    calculateAssetUsage,
    checkAssetAvailability,
    deductAssetUsage,
    deleteProductAssetRecipe,
    getAssetStockPage,
    getAllProductAssetRecipes,
    getAllAssetGroups,
    getAvailableAssets,
    getAssetTypes,
    getAssetType,
    getProductGroups,
    getProductAssetRecipes,
    saveProductAssetRecipe,
    updateAssetType,
};
