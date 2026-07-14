const db = require('../database')

function getProductSellingChart() {
    return new Promise((resolve) => {
        db.query(`SELECT COUNT(*) as amounts, DATE(t.created_at) as days 
            FROM transaction as t 
            WHERE t.value = -1 AND MONTH(t.created_at) = MONTH(CURRENT_DATE()) AND YEAR(t.created_at) = YEAR(CURRENT_DATE()) AND stock_id IS NOT NULL  
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
            FROM transaction as t JOIN products as pd ON pd.id = t.stock_id WHERE t.value = -1 AND YEAR(t.created_at) = YEAR(CURDATE()) AND MONTH(t.created_at) = MONTH(CURDATE())`, (err,result) => {
            if(err) throw err;
            resolve(result[0].profits || 0)
        })
    })
}


function getTotalSale() {
    return new Promise((resolve) => {
        db.query(`SELECT SUM(pd.price) AS total_sales 
            FROM transaction as t JOIN products as pd ON pd.id = t.stock_id WHERE t.value = -1 AND YEAR(t.created_at) = YEAR(CURDATE()) AND MONTH(t.created_at) = MONTH(CURDATE())`, (err,result) => {
            if(err) throw err;
            resolve(result[0].total_sales || 0)
        })
    })
}

module.exports = {
    getProductSellingChart,
    getTotalCustomers,
    getBestSeller,
    getProfits,
    getTotalSale
}