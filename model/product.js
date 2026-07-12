const db = require('../database')

function getProductsStock() {
    return new Promise((resolve) => {
        db.query(`SELECT
            t.name,
            pt.name AS type,
            SUM(t.value) AS value,
            pd.price,
            pt.id as type_id 
        FROM transaction t
        JOIN product_types pt ON pt.id = t.type
        LEFT JOIN (
            SELECT name, MAX(price) AS price
            FROM products
            GROUP BY name
        ) pd ON pd.name = t.name
        GROUP BY t.name, t.type, pd.price
        ORDER BY value, t.name ASC;
        `, (err, result) => {
            if(err) throw err;
            resolve(result)
        })
    })
}

function getSellProductsByType(type) {
    if(type != "all") {
        return new Promise((resolve) => {
            db.query(`SELECT pd.id, pd.name, pt.name as type, pd.type as type_id, pd.price 
                FROM products as pd  
                JOIN product_types as pt ON pt.id = pd.type 
                WHERE pd.type = ? AND is_sold = 0 GROUP BY pd.name ORDER BY pd.name DESC`, [type], (err, result) => {
                if(err) throw err;
                resolve(result)
            })
        })
    } else {
        return new Promise((resolve) => {
            db.query(`SELECT pd.id, pd.name, pt.name as type, pd.type as type_id, pd.price 
                FROM products as pd  
                JOIN product_types as pt ON pt.id = pd.type 
                WHERE is_sold = 0 GROUP BY pd.name ORDER BY pd.name DESC`, (err, result) => {
                if(err) throw err;
                resolve(result)
            })
        })
    }
}

function getSellProductsByName(name) {
    return new Promise((resolve) => {
        db.query(`SELECT pd.id, pd.name, pt.name as type, pd.type as type_id, pd.price 
            FROM products as pd  
            JOIN product_types as pt ON pt.id = pd.type 
            WHERE pd.name = ? AND is_sold = 0 GROUP BY pd.name ORDER BY pd.name DESC`, [name], (err, result) => {
            if(err) throw err;
            resolve(result[0])
        })
    })
}

function getAllBilling() {
    return new Promise((resolve) => {
        db.query(`SELECT t.id, t.billing_id, c.first_name, c.last_name, COUNT(*) as amount, t.created_at 
            FROM transaction as t 
            LEFT JOIN customers as c ON t.customer_id = c.id 
            WHERE t.stock_id IS NOT NULL 
            GROUP BY t.billing_id, c.first_name, c.last_name ORDER BY t.id DESC`, (err, result) => {
            if(err) throw err;
            resolve(result)
        })
    })
}

function getBillingHistoriesByCustomer(owner) {
    return new Promise((resolve) => {
        if(owner != 'all') {
            db.query(`SELECT t.id, t.billing_id, c.first_name, c.last_name, COUNT(*) as amount, t.created_at 
                FROM transaction as t 
                LEFT JOIN customers as c ON t.customer_id = c.id 
                WHERE t.customer_id = ? GROUP BY t.billing_id ASC`, [owner], (err, result) => {
                if(err) throw err;
                resolve(result)
            })
        } else {
            resolve(getAllBilling())
        }
    })
}

function getProductsStockByType(type) {
    return new Promise((resolve) => {
        if(type != 'all') {
            db.query(`SELECT
                    t.name,
                    pt.name AS type,
                    SUM(t.value) AS value,
                    pd.price,
                    pt.id as type_id 
                FROM transaction t
                JOIN product_types pt ON pt.id = t.type
                LEFT JOIN (
                    SELECT name, MAX(price) AS price
                    FROM products
                    GROUP BY name
                ) pd ON pd.name = t.name
                WHERE t.type = ? GROUP BY t.name, t.type, pd.price ORDER BY value, t.name ASC`, [type], (err, result) => {
                if(err) throw err;
                resolve(result)
            })
        } else {
            resolve(getProductsStock())
        }
    })
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

function getProductsStockByTypeAndName(type,name) {
    return new Promise((resolve) => {
        db.query(`SELECT t.id, t.name, pt.name as type, t.type as type_id, t.id, pd.price, pd.import_price, t.value, t.created_at, t.expired_date 
            FROM transaction as t 
            JOIN product_types as pt ON pt.id = t.type 
            JOIN products as pd ON pd.transaction_id = t.id 
            WHERE t.value > 0 AND t.type = ? AND t.name = ? GROUP BY t.id ORDER BY t.type DESC`, [type, name], (err, result) => {
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
    getBillingHistoriesByCustomer, 
    getProductTypes, 
    getProductsHistoriesByType, 
    getAllBilling, 
    getExpiredProducts, 
    getProductsStock, 
    getProductsStockByType, 
    getProductsStockByTypeAndName, 
    getSellProductsByType,
    deleteProductsByTransaction,

    //Frontend
    getSellProductsByName,
}