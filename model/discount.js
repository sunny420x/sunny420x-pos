const db = require('../database')

function getAllDiscounts() {
    return new Promise((resolve) => {
        db.query(`SELECT * FROM discounts ORDER BY id DESC`, (err, result) => {
            if(err) throw err;
            resolve(result)
        })
    })
}

function checkDiscount(code, subtotal) {
    return new Promise((resolve, reject) => {
        db.query(`SELECT * FROM discounts WHERE status = 0 AND code = ? LIMIT 1`, [code], (err, result) => {
            if (err) return reject(err);
            if (result.length !== 1) return resolve({ valid: false });

            const discount = result[0];
            const minimumPurchase = Number(discount.minimum_purchase || 0);
            if (subtotal < minimumPurchase) {
                return resolve({ valid: false, minimumPurchase });
            }

            db.query(`UPDATE discounts
                SET status = IF(max_uses IS NOT NULL AND usage_count + 1 >= max_uses, 1, 0),
                    usage_count = usage_count + 1
                WHERE id = ? AND status = 0
                    AND (max_uses IS NULL OR usage_count < max_uses)`, [discount.id], (updateError, updateResult) => {
                if (updateError) return reject(updateError);
                if (updateResult.affectedRows !== 1) return resolve({ valid: false });
                resolve({ valid: true, discount });
            });
        })
    })
}

module.exports = {
    checkDiscount,
    getAllDiscounts
}
