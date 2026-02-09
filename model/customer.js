//Model
const db = require('../database')

const customerQuery = `
    SELECT 
        c.id, 
        c.first_name, 
        c.last_name, 
        c.phone_number, 
        COUNT(*) as total_orders
    FROM customers as c 
    LEFT JOIN transaction as t ON t.customer_id = c.id `

function getCustomers() {
    return new Promise((resolve) => {
        db.query(customerQuery+` GROUP BY c.id ORDER BY first_name DESC`, (err, result) => {
            if(err) throw err;
            resolve(result)
        })
    })
}

function searchCustomerByFullName(q) {
    return new Promise((resolve) => {
        if(q != 'all' && q != '') {
            db.query(customerQuery+` WHERE CONCAT(c.first_name, " ", c.last_name) LIKE ?`, [`%${q}%`], (err, result) => {
                if (err) throw err;
                resolve(result)
            })
        } else {
            resolve(getCustomers())
        }
    })
}

function searchCustomerByPhoneNumber(phone_number) {
    return new Promise((resolve) => {
        if(phone_number != 'all' && phone_number != '') {
            phone_number = phone_number.replace('-','')
            db.query(customerQuery+` WHERE c.phone_number LIKE ?`, [`%${phone_number}%`], (err, result) => {
                if (err) throw err;
                resolve(result)
            })
        } else {
            resolve(getCustomers())
        }
    })
}

function searchCustomerByCardId(card_id) {
    return new Promise((resolve) => {
        if(card_id != 'all' && card_id != '') {
            db.query(customerQuery+` WHERE c.card_id LIKE ?`, [`%${card_id}%`], (err, result) => {
                if (err) throw err;
                resolve(result)
            })
        } else {
            resolve(getCustomers())
        }
    })
}

module.exports = { searchCustomerByFullName, searchCustomerByCardId, searchCustomerByPhoneNumber, getCustomers}