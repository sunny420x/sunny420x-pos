const db = require('../database')

function Pagination(page) {
    page = parseInt(page)
    const per_page = 10;
    const limit_start = (page - 1) * per_page;
    const limit_end = per_page;

    return {limit_start, limit_end}
}

function getAllDiscounts(page) {
    return new Promise((resolve) => {
        const {limit_start, limit_end} = Pagination(page)
        db.query(`SELECT * FROM discounts ORDER BY id DESC LIMIT ?,?`, [limit_start, limit_end], (err, result) => {
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
    Pagination,
    checkDiscount,
    getAllDiscounts
}