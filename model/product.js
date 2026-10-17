const db = require('../database')
const { createPagination } = require('./pagination')

function query(sql, values = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, values, (err, result) => {
            if (err) return reject(err);
            resolve(result);
        });
    });
}

function getSellProductsByType(type) {
    return query(`SELECT
                pd.name,
                pt.name AS type,
                pd.type AS type_id,
                pd.price,
                CASE
                    WHEN COALESCE(pis.tracking_mode, 'quantity') = 'availability'
                    THEN IF(pis.is_available = 1, 2147483647, 0)
                    ELSE SUM(IF(pd.is_sold = 0, 1, 0))
                END AS available_count,
                COALESCE(pis.tracking_mode, 'quantity') AS tracking_mode,
                COALESCE(pis.is_available, 1) AS is_available
            FROM products AS pd
            JOIN product_types AS pt ON pt.id = pd.type
            LEFT JOIN product_inventory_settings AS pis
                ON pis.product_type = pd.type AND pis.product_name = pd.name
            WHERE pd.type = ?
            GROUP BY pd.name, pt.name, pd.type, pd.price, pis.tracking_mode, pis.is_available
            HAVING available_count > 0
            ORDER BY pd.name ASC, pd.price ASC`, [type]).then(async products => {
        if (!products.length) return products;
        const typeIds = [...new Set(products.map(product => product.type_id))];
        const recipes = await query(
            `SELECT product_type, product_name, asset_type, asset_name, amount_per_product
            FROM product_asset_recipes WHERE product_type IN (${typeIds.map(() => '?').join(',')})`,
            typeIds
        );
        return products.map(product => ({
            ...product,
            asset_recipe: recipes.filter(recipe =>
                recipe.product_type === product.type_id && recipe.product_name === product.name
            ),
        }));
    });
}

async function getBillingHistoriesPage(filters, requestedPage) {
    const conditions = ['t.stock_id IS NOT NULL', 't.billing_id IS NOT NULL'];
    const values = [];
    if (filters.billingId) {
        conditions.push('t.billing_id = ?');
        values.push(filters.billingId);
    }
    if (filters.customerName) {
        conditions.push('CONCAT_WS(" ", c.first_name, c.last_name) LIKE ?');
        values.push(`%${filters.customerName}%`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const countRows = await query(`
        SELECT COUNT(DISTINCT t.billing_id) AS total
        FROM transaction AS t
        LEFT JOIN customers AS c ON c.id = t.customer_id
        ${where}`, values);
    const pagination = createPagination(requestedPage, Number(countRows[0].total));
    const bills = await query(`
        SELECT
            MAX(t.id) AS id,
            t.billing_id,
            c.first_name,
            c.last_name,
            COUNT(*) AS amount,
            MAX(t.created_at) AS created_at
        FROM transaction AS t
        LEFT JOIN customers AS c ON t.customer_id = c.id
        ${where}
        GROUP BY t.billing_id, c.first_name, c.last_name
        ORDER BY MAX(t.id) DESC
        LIMIT ? OFFSET ?`, [...values, pagination.pageSize, pagination.offset]);

    return { bills, pagination };
}

async function getProductsStockPage(type, name, requestedPage) {
    const conditions = [];
    const values = [];
    if (type !== 'all') {
        conditions.push('t.type = ?');
        values.push(type);
    }
    if (name) {
        conditions.push('t.name LIKE ?');
        values.push(`%${name}%`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [{ total }] = await query(`
        SELECT COUNT(*) AS total
        FROM (
            SELECT t.name, t.type
            FROM transaction AS t
            JOIN product_types AS pt ON pt.id = t.type
            LEFT JOIN product_inventory_settings AS pis
                ON pis.product_type = t.type AND pis.product_name = t.name
            ${where}
            GROUP BY t.name, t.type, pis.id
        ) AS stock_groups`, values);
    const pagination = createPagination(requestedPage, Number(total));
    const products = await query(`
        SELECT
            t.name,
            pt.name AS type,
            CASE
                WHEN COALESCE(pis.tracking_mode, 'quantity') = 'availability'
                THEN IF(pis.is_available = 1, 1, 0)
                ELSE SUM(t.value)
            END AS value,
            pd.price,
            pt.id AS type_id,
            COALESCE(pis.tracking_mode, 'quantity') AS tracking_mode,
            COALESCE(pis.is_available, 1) AS is_available
        FROM transaction AS t
        JOIN product_types AS pt ON pt.id = t.type
        LEFT JOIN product_inventory_settings AS pis
            ON pis.product_type = t.type AND pis.product_name = t.name
        LEFT JOIN (
            SELECT name, MAX(price) AS price
            FROM products
            GROUP BY name
        ) AS pd ON pd.name = t.name
        ${where}
        GROUP BY t.name, t.type, pd.price, pis.id
        ORDER BY value, t.name ASC, t.type ASC
        LIMIT ? OFFSET ?`, [...values, pagination.pageSize, pagination.offset]);

    if (products.length) {
        const typeIds = [...new Set(products.map(product => product.type_id))];
        const recipes = await query(
            `SELECT product_type, product_name, asset_type, asset_name, amount_per_product
            FROM product_asset_recipes WHERE product_type IN (${typeIds.map(() => '?').join(',')})`,
            typeIds
        );
        for (const product of products) {
            product.asset_recipe = recipes.filter(recipe =>
                recipe.product_type === product.type_id && recipe.product_name === product.name
            );
        }
    }
    return { products, pagination };
}

async function setProductTrackingMode(type, name, trackingMode, companyId) {
    const connection = await db.auth.promise().getConnection();
    try {
        await connection.beginTransaction();
        const [settings] = await connection.query(
            `SELECT tracking_mode FROM product_inventory_settings
            WHERE company_id = ? AND product_type = ? AND product_name = ? FOR UPDATE`,
            [companyId, type, name]
        );
        if (trackingMode === 'quantity' && settings[0]?.tracking_mode === 'availability') {
            const [available] = await connection.query(
                `SELECT COUNT(*) AS total FROM products
                WHERE company_id = ? AND type = ? AND name = ? AND is_sold = 0`,
                [companyId, type, name]
            );
            const [ledger] = await connection.query(
                `SELECT COALESCE(SUM(value), 0) AS total FROM \`transaction\`
                WHERE company_id = ? AND type = ? AND name = ?`,
                [companyId, type, name]
            );
            const adjustment = Number(available[0].total) - Number(ledger[0].total);
            if (adjustment !== 0) {
                await connection.query(
                    `INSERT INTO \`transaction\` (type, name, value, created_at, company_id)
                    VALUES (?, ?, ?, NOW(), ?)`,
                    [type, name, adjustment, companyId]
                );
            }
        }
        await connection.query(`INSERT INTO product_inventory_settings
            (product_type, product_name, tracking_mode, is_available, company_id)
            VALUES (?, ?, ?, 1, ?)
            ON DUPLICATE KEY UPDATE tracking_mode = VALUES(tracking_mode)`,
        [type, name, trackingMode, companyId]);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function setProductAvailability(type, name, available, companyId) {
    await db.auth.promise().query(`INSERT INTO product_inventory_settings
        (product_type, product_name, tracking_mode, is_available, company_id)
        VALUES (?, ?, 'availability', ?, ?)
        ON DUPLICATE KEY UPDATE
            is_available = VALUES(is_available),
            tracking_mode = 'availability'`,
    [type, name, available ? 1 : 0, companyId]);
}

async function getProductsStockByTypeAndNamePage(type, name, requestedPage) {
    const countRows = await query(`
        SELECT COUNT(DISTINCT t.id) AS total
        FROM transaction AS t
        JOIN product_types AS pt ON pt.id = t.type
        JOIN products AS pd ON pd.transaction_id = t.id
        WHERE t.value > 0 AND t.type = ? AND t.name = ?`, [type, name]);
    const pagination = createPagination(requestedPage, Number(countRows[0].total));
    const products = await query(`
        SELECT
            t.id,
            t.name,
            pt.name AS type,
            t.type AS type_id,
            pd.price,
            pd.import_price,
            t.value,
            t.created_at,
            t.expired_date
        FROM transaction AS t
        JOIN product_types AS pt ON pt.id = t.type
        JOIN products AS pd ON pd.transaction_id = t.id
        WHERE t.value > 0 AND t.type = ? AND t.name = ?
        GROUP BY t.id
        ORDER BY t.type DESC, t.id DESC
        LIMIT ? OFFSET ?`, [type, name, pagination.pageSize, pagination.offset]);

    return { products, pagination };
}

function getProductsHistoriesByType(type) {
    return new Promise((resolve) => {
        db.query(`SELECT t.name 
            FROM transaction as t 
            WHERE t.type = ? GROUP BY t.name ORDER BY t.id ASC`, [type], (err, result) => {
            if(err) throw err;
            resolve(result)
        })
    })
}

function getExpiredProducts() {
    return new Promise((resolve) => {
        db.query(`SELECT t.id, t.name, pt.name as type, t.type as type_id, SUM(t.value) as value, t.expired_date   
            FROM transaction as t 
            JOIN product_types as pt ON pt.id = t.type 
            WHERE DATE(t.expired_date) <= CURRENT_DATE() GROUP BY t.type, t.name ORDER BY SUM(t.value) ASC`, (err, result) => {
            if(err) throw err;
            resolve(result)
        })
    })
}

function getProductTypes() {
    return new Promise((resolve) => {
        db.query(`SELECT * FROM product_types ORDER BY id ASC`, (err, result) => {
            if(err) throw err;
            resolve(result)
        })
    })
}

function deleteProductsByTransaction(transaction_id) {
    return new Promise((resolve, reject) => {
        db.query("SELECT p.id FROM transaction as t JOIN products as p ON p.transaction_id = t.id WHERE p.is_sold = 1 AND t.id = ?", [transaction_id], (err, products) => {
            if (err) throw(err);
            db.query("DELETE FROM products WHERE transaction_id = ?", [transaction_id], (err) => {
                if (err) throw(err);
                db.query("DELETE FROM transaction WHERE id = ?", [transaction_id], (err) => {
                    if (err) return reject(err);
                    let completed = 0;
                    for (let i = 0; i < products.length; i++) {
                        db.query("DELETE FROM transaction WHERE stock_id = ?", [products[i].id], (err) => {
                            if (err) throw(err);
                            completed++;
                            if (completed === products.length) {
                                resolve();
                            }
                        });
                    }
                })
            })
            if (products.length === 0) {
                resolve();
            }
        });
    });
}

module.exports = {
    getBillingHistoriesPage,
    getProductTypes, 
    getProductsHistoriesByType, 
    getExpiredProducts, 
    getProductsStockPage,
    getProductsStockByTypeAndNamePage,
    setProductAvailability,
    setProductTrackingMode,
    getSellProductsByType,
    deleteProductsByTransaction,
}
