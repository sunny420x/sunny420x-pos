const db = require('../database')

function getAllDiscounts() {
    return new Promise((resolve) => {
        db.query(`SELECT * FROM discounts ORDER BY id DESC`, (err, result) => {
            if(err) throw err;
            resolve(result)
        })
    })
}

function checkDiscount(code) {
    return new Promise((resolve) => {
        db.query(`SELECT * FROM discounts WHERE status = 0 AND code = ? LIMIT 1`, [code], (err, result) => {
            if(err) throw err;
            if(result.length == 1) {
                db.query("UPDATE discounts SET status = 1 WHERE code = ?", [code], (err) => {
                    if(err) throw err;
                    resolve(result[0].amount)
                })
            } else {
                resolve(null)
            }
        })
    })
}

module.exports = {
    checkDiscount,
    getAllDiscounts
}
