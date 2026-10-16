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
    return new Promise((resolve) => {
        db.query(`SELECT pd.id, pd.name, pt.name as type, pd.type as type_id, pd.price 
            FROM products as pd  
            JOIN product_types as pt ON pt.id = pd.type 
            WHERE pd.type = ? AND is_sold = 0 GROUP BY pd.name ORDER BY pd.name DESC`, [type], (err, result) => {
            if(err) throw err;
            resolve(result)
        })
    })
}

async function getBillingHistoriesPage(owner, requestedPage) {
    const hasOwnerFilter = owner !== 'all';
    const where = `WHERE t.stock_id IS NOT NULL AND t.billing_id IS NOT NULL${hasOwnerFilter ? ' AND t.customer_id = ?' : ''}`;
    const values = hasOwnerFilter ? [owner] : [];
    const countRows = await query(`
        SELECT COUNT(DISTINCT t.billing_id) AS total
        FROM transaction AS t
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

async function getProductsStockPage(type, requestedPage) {
    const hasTypeFilter = type !== 'all';
    const where = hasTypeFilter ? 'WHERE t.type = ?' : '';
    const values = hasTypeFilter ? [type] : [];
    const [{ total }] = await query(`
        SELECT COUNT(*) AS total
        FROM (
            SELECT t.name, t.type
            FROM transaction AS t
            JOIN product_types AS pt ON pt.id = t.type
            ${where}
            GROUP BY t.name, t.type
        ) AS stock_groups`, values);
    const pagination = createPagination(requestedPage, Number(total));
    const products = await query(`
        SELECT
            t.name,
            pt.name AS type,
            SUM(t.value) AS value,
            pd.price,
            pt.id AS type_id
        FROM transaction AS t
        JOIN product_types AS pt ON pt.id = t.type
        LEFT JOIN (
            SELECT name, MAX(price) AS price
            FROM products
            GROUP BY name
        ) AS pd ON pd.name = t.name
        ${where}
        GROUP BY t.name, t.type, pd.price
        ORDER BY value, t.name ASC, t.type ASC
        LIMIT ? OFFSET ?`, [...values, pagination.pageSize, pagination.offset]);

    return { products, pagination };
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
    getSellProductsByType,
    deleteProductsByTransaction,
}
