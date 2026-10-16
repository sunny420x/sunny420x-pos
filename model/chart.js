const db = require('../database')

function getProductSellingChart() {
    return new Promise((resolve) => {
        db.query(`SELECT COUNT(*) as amounts, DATE(t.created_at) as days 
            FROM transaction as t 
            WHERE t.value = -1 AND t.billing_id IS NOT NULL AND MONTH(t.created_at) = MONTH(CURRENT_DATE()) AND YEAR(t.created_at) = YEAR(CURRENT_DATE()) AND stock_id IS NOT NULL
            GROUP BY DATE(t.created_at)`, (err,result) => {
            if(err) throw err;
            resolve(result)
        })
    })
}

function getTotalCustomers() {
    return new Promise((resolve) => {
        db.query(`SELECT COUNT(*) as amounts FROM customers`, (err,result) => {
            if(err) throw err;
            resolve(result)
        })
    })
}


function getBestSeller() {
    return new Promise((resolve) => {
        db.query(`SELECT name, COUNT(*) AS tx_count
            FROM transaction
            WHERE value = -1 AND billing_id IS NOT NULL
            GROUP BY name
            ORDER BY tx_count DESC
            LIMIT 1`, (err,result) => {
            if(err) throw err;
            resolve(result[0])
        })
    })
}

function getProfits() {
    return new Promise((resolve) => {
        db.query(`SELECT SUM(pd.price - pd.import_price) AS profits
            FROM transaction as t JOIN products as pd ON pd.id = t.stock_id WHERE t.value = -1 AND t.billing_id IS NOT NULL AND YEAR(t.created_at) = YEAR(CURDATE()) AND MONTH(t.created_at) = MONTH(CURDATE())`, (err,result) => {
            if(err) throw err;
            resolve(result[0].profits || 0)
        })
    })
}


function getTotalSales() {
    return new Promise((resolve) => {
        db.query(`SELECT SUM(pd.price) AS total_sales 
            FROM transaction as t JOIN products as pd ON pd.id = t.stock_id WHERE t.value = -1 AND t.billing_id IS NOT NULL AND YEAR(t.created_at) = YEAR(CURDATE()) AND MONTH(t.created_at) = MONTH(CURDATE())`, (err,result) => {
            if(err) throw err;
            resolve(result[0].total_sales || 0)
        })
    })
}

function getStockByProductType() {
    return new Promise((resolve) => {
        db.query(`SELECT pt.name, COUNT(p.id) AS amounts
            FROM product_types AS pt
            LEFT JOIN products AS p ON p.type = pt.id AND p.is_sold = 0
            GROUP BY pt.id, pt.name
            HAVING COUNT(p.id) > 0
            ORDER BY amounts DESC, pt.name ASC`, (err, result) => {
            if (err) throw err;
            resolve(result);
        });
    });
}

function getStockMovementChart() {
    return new Promise((resolve) => {
        db.query(`SELECT DATE(t.created_at) AS days,
                SUM(CASE WHEN t.value > 0 THEN t.value ELSE 0 END) AS incoming,
                SUM(CASE WHEN t.value < 0 THEN -t.value ELSE 0 END) AS outgoing
            FROM transaction AS t
            WHERE MONTH(t.created_at) = MONTH(CURRENT_DATE())
                AND YEAR(t.created_at) = YEAR(CURRENT_DATE())
                AND t.value != 0
            GROUP BY DATE(t.created_at)
            ORDER BY days ASC`, (err, result) => {
            if (err) throw err;
            resolve(result);
        });
    });
}

function getExpiryStatusChart() {
    return new Promise((resolve) => {
        db.query(`SELECT CASE
                WHEN t.expired_date IS NULL THEN 'ไม่กำหนดวันหมดอายุ'
                WHEN t.expired_date <= CURRENT_DATE() THEN 'หมดอายุแล้ว'
                WHEN t.expired_date <= DATE_ADD(CURRENT_DATE(), INTERVAL 30 DAY) THEN 'หมดอายุใน 30 วัน'
                ELSE 'ยังไม่ใกล้หมดอายุ'
            END AS status,
            COUNT(p.id) AS amounts
            FROM transaction AS t
            JOIN products AS p ON p.transaction_id = t.id AND p.is_sold = 0
            WHERE t.value > 0
            GROUP BY status
            ORDER BY FIELD(status, 'หมดอายุแล้ว', 'หมดอายุใน 30 วัน', 'ยังไม่ใกล้หมดอายุ', 'ไม่กำหนดวันหมดอายุ')`, (err, result) => {
            if (err) throw err;
            resolve(result);
        });
    });
}

module.exports = {
    getProductSellingChart,
    getTotalCustomers,
    getBestSeller,
    getProfits,
    getTotalSales,
    getStockByProductType,
    getStockMovementChart,
    getExpiryStatusChart
}
