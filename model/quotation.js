const db = require('../database');
const { createPagination } = require('./pagination');

function query(sql, values = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, values, (err, result) => {
            if (err) return reject(err);
            resolve(result);
        });
    });
}

function quotationError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function normalizeCart(cart) {
    if (!Array.isArray(cart) || cart.length === 0 || cart.length > 100) {
        throw quotationError(400, 'กรุณาเพิ่มสินค้าในตะกร้าก่อนออกใบเสนอราคา');
    }

    const normalized = cart.map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw quotationError(400, 'ข้อมูลสินค้าในตะกร้าไม่ถูกต้อง');
        }
        const productType = Number(item.product_type);
        const productPrice = Number(item.product_price);
        const amount = Number(item.amount);
        const productName = typeof item.product_name === 'string' ? item.product_name.trim() : '';
        if (!Number.isSafeInteger(productType) || productType < 1 ||
            !Number.isSafeInteger(productPrice) || productPrice < 0 ||
            !Number.isSafeInteger(amount) || amount < 1 || amount > 1000 ||
            !productName || productName.length > 200) {
            throw quotationError(400, 'ข้อมูลสินค้าในตะกร้าไม่ถูกต้อง');
        }
        return { productType, productPrice, amount, productName };
    });
    const merged = new Map();
    for (const item of normalized) {
        const key = JSON.stringify([item.productType, item.productName, item.productPrice]);
        const existing = merged.get(key);
        const amount = (existing?.amount || 0) + item.amount;
        if (amount > 1000) throw quotationError(400, 'จำนวนสินค้าต่อรายการต้องไม่เกิน 1,000 ชิ้น');
        merged.set(key, { ...item, amount });
    }
    return [...merged.values()];
}

function discountValue(discount, subtotal) {
    if (!discount) return 0;
    const value = discount.discount_type === 'fixed'
        ? Number(discount.amount)
        : subtotal * Number(discount.amount) / 100;
    return Math.round(Math.min(subtotal, value) * 100) / 100;
}

async function createQuotation({ companyId, userId, cart, customerId, discountCode }) {
    const items = normalizeCart(cart);
    const connection = await db.auth.promise().getConnection();
    try {
        await connection.beginTransaction();

        if (customerId !== null) {
            const [customers] = await connection.query(
                'SELECT id FROM customers WHERE company_id = ? AND id = ?',
                [companyId, customerId]
            );
            if (customers.length !== 1) throw quotationError(400, 'ไม่พบข้อมูลลูกค้า');
        }

        let subtotal = 0;
        for (const item of items) {
            const [available] = await connection.query(
                `SELECT COUNT(*) AS available_count
                FROM products
                WHERE company_id = ? AND is_sold = 0 AND type = ? AND name = ? AND price = ?`,
                [companyId, item.productType, item.productName, item.productPrice]
            );
            if (Number(available[0].available_count) < item.amount) {
                throw quotationError(409, `สินค้า ${item.productName} มีไม่เพียงพอสำหรับใบเสนอราคานี้`);
            }
            subtotal += item.productPrice * item.amount;
            if (!Number.isSafeInteger(subtotal)) throw quotationError(400, 'ยอดรวมสินค้าเกินขอบเขตที่รองรับ');
        }

        let discount = null;
        if (discountCode) {
            const [discounts] = await connection.query(
                `SELECT id, code, amount, discount_type, minimum_purchase
                FROM discounts
                WHERE company_id = ? AND code = ? AND status = 0
                    AND (max_uses IS NULL OR usage_count < max_uses)
                ORDER BY id LIMIT 1`,
                [companyId, discountCode]
            );
            discount = discounts[0];
            if (!discount) throw quotationError(400, 'โค้ดส่วนลดไม่ถูกต้องหรือถูกใช้งานแล้ว');
            if (subtotal < Number(discount.minimum_purchase || 0)) {
                throw quotationError(400, `ยอดซื้อขั้นต่ำสำหรับโค้ดนี้คือ ${discount.minimum_purchase} บาท`);
            }
        }

        const amountOff = discountValue(discount, subtotal);
        const total = subtotal - amountOff;
        const [inserted] = await connection.query(
            `INSERT INTO quotations
                (customer_id, discount_id, discount_code, discount_type, discount_amount,
                minimum_purchase, subtotal, total, created_by, company_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                customerId,
                discount?.id ?? null,
                discount?.code ?? null,
                discount?.discount_type ?? null,
                discount?.amount ?? 0,
                discount?.minimum_purchase ?? 0,
                subtotal,
                total,
                userId,
                companyId,
            ]
        );
        for (const item of items) {
            await connection.query(
                `INSERT INTO quotation_items
                    (quotation_id, product_type, product_name, product_price, amount, line_total, company_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    inserted.insertId,
                    item.productType,
                    item.productName,
                    item.productPrice,
                    item.amount,
                    item.productPrice * item.amount,
                    companyId,
                ]
            );
        }

        await connection.commit();
        return { id: inserted.insertId, subtotal, discountAmount: amountOff, total };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function getQuotation(companyId, id) {
    const quotations = await query(`
        SELECT q.*, c.first_name, c.last_name, c.phone_number
        FROM quotations AS q
        LEFT JOIN customers AS c ON c.id = q.customer_id
        WHERE q.id = ? AND q.company_id = ?`, [id, companyId]);
    if (!quotations.length) return null;
    const items = await query(`
        SELECT product_type, product_name, product_price, amount, line_total
        FROM quotation_items
        WHERE quotation_id = ? AND company_id = ?
        ORDER BY id`, [id, companyId]);
    return { quotation: quotations[0], items };
}

async function getQuotationsPage(requestedPage) {
    const [{ total }] = await query('SELECT COUNT(*) AS total FROM quotations');
    const pagination = createPagination(requestedPage, Number(total));
    const quotations = await query(`
        SELECT q.id, q.customer_id, q.subtotal, q.total, q.status, q.billing_id, q.created_at,
            c.first_name, c.last_name
        FROM quotations AS q
        LEFT JOIN customers AS c ON c.id = q.customer_id
        ORDER BY q.id DESC
        LIMIT ? OFFSET ?`, [pagination.pageSize, pagination.offset]);
    return { quotations, pagination };
}

async function confirmQuotation({ companyId, id }) {
    const connection = await db.auth.promise().getConnection();
    try {
        await connection.beginTransaction();
        const [quotations] = await connection.query(
            'SELECT * FROM quotations WHERE company_id = ? AND id = ? FOR UPDATE',
            [companyId, id]
        );
        const quotation = quotations[0];
        if (!quotation) throw quotationError(404, 'ไม่พบใบเสนอราคา');
        if (quotation.status === 'confirmed') {
            await connection.commit();
            return { billingId: quotation.billing_id, alreadyConfirmed: true };
        }
        if (quotation.status !== 'pending') throw quotationError(409, 'ใบเสนอราคานี้ไม่สามารถยืนยันได้');

        await connection.query('SELECT id FROM companies WHERE id = ? FOR UPDATE', [companyId]);
        const [items] = await connection.query(
            `SELECT product_type, product_name, product_price, amount
            FROM quotation_items WHERE company_id = ? AND quotation_id = ? ORDER BY id`,
            [companyId, id]
        );
        if (!items.length) throw quotationError(409, 'ใบเสนอราคานี้ไม่มีรายการสินค้า');

        const [billingRows] = await connection.query(
            'SELECT COALESCE(MAX(billing_id), 0) + 1 AS billing_id FROM `transaction` WHERE company_id = ? AND billing_id IS NOT NULL',
            [companyId]
        );
        const billingId = Number(billingRows[0].billing_id);
        const createdAt = new Date();

        for (const item of items) {
            const [products] = await connection.query(
                `SELECT id FROM products
                WHERE company_id = ? AND is_sold = 0 AND type = ? AND name = ? AND price = ?
                ORDER BY id LIMIT ? FOR UPDATE`,
                [companyId, item.product_type, item.product_name, item.product_price, item.amount]
            );
            if (products.length < item.amount) {
                throw quotationError(409, `สินค้า ${item.product_name} มีไม่เพียงพอ กรุณาปรับปรุงใบเสนอราคาก่อนขาย`);
            }
            for (const product of products) {
                const [updated] = await connection.query(
                    'UPDATE products SET is_sold = 1 WHERE company_id = ? AND id = ? AND is_sold = 0',
                    [companyId, product.id]
                );
                if (updated.affectedRows !== 1) throw quotationError(409, 'สต๊อกสินค้าเปลี่ยนแปลง กรุณาลองอีกครั้ง');
                await connection.query(
                    `INSERT INTO \`transaction\`
                        (type, name, value, stock_id, customer_id, billing_id, created_at, company_id)
                    VALUES (?, ?, -1, ?, ?, ?, ?, ?)`,
                    [item.product_type, item.product_name, product.id, quotation.customer_id, billingId, createdAt, companyId]
                );
            }
        }

        if (quotation.discount_id !== null) {
            const [discounts] = await connection.query(
                `SELECT id, minimum_purchase
                FROM discounts
                WHERE company_id = ? AND id = ? AND status = 0
                    AND (max_uses IS NULL OR usage_count < max_uses)
                FOR UPDATE`,
                [companyId, quotation.discount_id]
            );
            if (!discounts.length) throw quotationError(409, 'โค้ดส่วนลดของใบเสนอราคานี้ถูกใช้ครบแล้ว');
            if (Number(quotation.subtotal) < Number(discounts[0].minimum_purchase || 0)) {
                throw quotationError(409, `ยอดซื้อขั้นต่ำสำหรับโค้ดนี้คือ ${discounts[0].minimum_purchase} บาท`);
            }
            const [claimed] = await connection.query(
                `UPDATE discounts
                SET status = IF(max_uses IS NOT NULL AND usage_count + 1 >= max_uses, 1, 0),
                    usage_count = usage_count + 1, billing_id = ?
                WHERE company_id = ? AND id = ? AND status = 0
                    AND (max_uses IS NULL OR usage_count < max_uses)`,
                [billingId, companyId, quotation.discount_id]
            );
            if (claimed.affectedRows !== 1) throw quotationError(409, 'โค้ดส่วนลดถูกใช้ครบแล้ว');
        }

        await connection.query(
            `UPDATE quotations SET status = 'confirmed', billing_id = ?, confirmed_at = NOW()
            WHERE company_id = ? AND id = ? AND status = 'pending'`,
            [billingId, companyId, id]
        );
        await connection.commit();
        return { billingId, alreadyConfirmed: false };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { confirmQuotation, createQuotation, getQuotation, getQuotationsPage };
