//Model
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

const customerFields = {
    fullName: 'CONCAT(c.first_name, " ", c.last_name)',
    phoneNumber: 'c.phone_number',
};

async function getCustomersPage(field, value, requestedPage) {
    if (!Object.hasOwn(customerFields, field)) throw new Error('Unsupported customer search field');
    const filter = value ? `${customerFields[field]} LIKE ?` : '';
    const searchValue = field === 'phoneNumber' ? value.replace(/-/g, '') : value;
    const where = filter ? ` WHERE ${filter}` : '';
    const values = filter ? [`%${searchValue}%`] : [];
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM customers AS c${where}`, values);
    const pagination = createPagination(requestedPage, Number(total));
    const customers = await query(`
        SELECT
            c.id,
            c.first_name,
            c.last_name,
            c.phone_number,
            COUNT(t.id) AS total_orders
        FROM customers AS c
        LEFT JOIN transaction AS t ON t.customer_id = c.id
        ${where}
        GROUP BY c.id
        ORDER BY c.first_name DESC, c.id DESC
        LIMIT ? OFFSET ?`, [...values, pagination.pageSize, pagination.offset]);

    return { customers, pagination };
}

function getCustomerOptions() {
    return query(`SELECT id, first_name, last_name
        FROM customers
        ORDER BY first_name DESC, id DESC`);
}

module.exports = { getCustomersPage, getCustomerOptions }