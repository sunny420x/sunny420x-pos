const db = require('../database');
const { calculateAssetUsage, deductAssetUsage } = require('./asset');
const { discountValue, normalizeCart } = require('./quotation');

function saleError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

async function createSale({ companyId, cart, customerId, discountCode, assetAdjustments }) {
    const items = normalizeCart(cart);
    const connection = await db.auth.promise().getConnection();
    try {
        await connection.beginTransaction();
        if (customerId !== null) {
            const [customers] = await connection.query(
                'SELECT id FROM customers WHERE company_id = ? AND id = ?',
                [companyId, customerId]
            );
            if (!customers.length) throw saleError(400, 'ไม่พบข้อมูลลูกค้า');
        }
        await connection.query('SELECT id FROM companies WHERE id = ? FOR UPDATE', [companyId]);

        let subtotal = 0;
        for (const item of items) {
            const [settings] = await connection.query(
                `SELECT tracking_mode, is_available FROM product_inventory_settings
                WHERE company_id = ? AND product_type = ? AND product_name = ? FOR UPDATE`,
                [companyId, item.productType, item.productName]
            );
            const availabilityTracked = settings[0]?.tracking_mode === 'availability';
            if (availabilityTracked && !settings[0].is_available) {
                throw saleError(409, `สินค้า ${item.productName} หมดชั่วคราว`);
            }
            const [products] = await connection.query(
                `SELECT id FROM products
                WHERE company_id = ? AND ${availabilityTracked ? '' : 'is_sold = 0 AND'} type = ? AND name = ? AND price = ?
                ORDER BY id LIMIT ? FOR UPDATE`,
                [companyId, item.productType, item.productName, item.productPrice, availabilityTracked ? 1 : item.amount]
            );
            if (!products.length || (!availabilityTracked && products.length < item.amount)) {
                throw saleError(409, `สินค้า ${item.productName} มีไม่เพียงพอสำหรับคำสั่งซื้อนี้`);
            }
            subtotal += item.productPrice * item.amount;
            if (!Number.isSafeInteger(subtotal)) throw saleError(400, 'ยอดรวมสินค้าเกินขอบเขตที่รองรับ');
        }

        let discount = null;
        if (discountCode) {
            const [discounts] = await connection.query(
                `SELECT id, code, amount, discount_type, minimum_purchase
                FROM discounts
                WHERE company_id = ? AND code = ? AND status = 0
                    AND (max_uses IS NULL OR usage_count < max_uses)
                ORDER BY id LIMIT 1 FOR UPDATE`,
                [companyId, discountCode]
            );
            discount = discounts[0];
            if (!discount) throw saleError(400, 'โค้ดส่วนลดไม่ถูกต้องหรือถูกใช้งานแล้ว');
            if (subtotal < Number(discount.minimum_purchase || 0)) {
                throw saleError(400, `ยอดซื้อขั้นต่ำสำหรับโค้ดนี้คือ ${discount.minimum_purchase} บาท`);
            }
        }

        const assetUsage = await calculateAssetUsage(connection, companyId, items, assetAdjustments);
        const [billingRows] = await connection.query(
            `SELECT COALESCE(MAX(billing_id), 0) + 1 AS billing_id
            FROM \`transaction\` WHERE company_id = ? AND billing_id IS NOT NULL`,
            [companyId]
        );
        const billingId = Number(billingRows[0].billing_id);
        const createdAt = new Date();
        for (const item of items) {
            const [settings] = await connection.query(
                `SELECT tracking_mode FROM product_inventory_settings
                WHERE company_id = ? AND product_type = ? AND product_name = ?`,
                [companyId, item.productType, item.productName]
            );
            const availabilityTracked = settings[0]?.tracking_mode === 'availability';
            const [products] = await connection.query(
                `SELECT id FROM products
                WHERE company_id = ? AND ${availabilityTracked ? '' : 'is_sold = 0 AND'} type = ? AND name = ? AND price = ?
                ORDER BY id LIMIT ? FOR UPDATE`,
                [companyId, item.productType, item.productName, item.productPrice, availabilityTracked ? 1 : item.amount]
            );
            if (!products.length || (!availabilityTracked && products.length < item.amount)) {
                throw saleError(409, `สินค้า ${item.productName} มีไม่เพียงพอสำหรับคำสั่งซื้อนี้`);
            }
            for (let index = 0; index < item.amount; index++) {
                const product = products[availabilityTracked ? 0 : index];
                if (!availabilityTracked) {
                    const [updated] = await connection.query(
                        `UPDATE products SET is_sold = 1
                        WHERE company_id = ? AND id = ? AND is_sold = 0`,
                        [companyId, product.id]
                    );
                    if (updated.affectedRows !== 1) {
                        throw saleError(409, 'สต๊อกสินค้าเปลี่ยนแปลง กรุณาลองอีกครั้ง');
                    }
                }
                await connection.query(
                    `INSERT INTO \`transaction\`
                        (type, name, value, stock_id, customer_id, billing_id, created_at, company_id)
                    VALUES (?, ?, -1, ?, ?, ?, ?, ?)`,
                    [item.productType, item.productName, product.id, customerId, billingId, createdAt, companyId]
                );
            }
        }
        await deductAssetUsage(connection, companyId, assetUsage, billingId, createdAt);

        if (discount) {
            const [claimed] = await connection.query(
                `UPDATE discounts
                SET status = IF(max_uses IS NOT NULL AND usage_count + 1 >= max_uses, 1, 0),
                    usage_count = usage_count + 1, billing_id = ?
                WHERE company_id = ? AND id = ? AND status = 0
                    AND (max_uses IS NULL OR usage_count < max_uses)`,
                [billingId, companyId, discount.id]
            );
            if (claimed.affectedRows !== 1) throw saleError(409, 'โค้ดส่วนลดถูกใช้ครบแล้ว');
        }

        await connection.commit();
        return { billingId, subtotal, total: subtotal - discountValue(discount, subtotal) };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { createSale };
