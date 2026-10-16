const express = require('express')
const moment = require('moment')
const ejs = require('ejs');
const fs = require('fs');
const cors = require('cors');
const cookieParser = require('cookie-parser')
const path = require('path')
const { createHash } = require('crypto')

const {
    getSellProductsByType,
    getExpiredProducts,
    getBillingHistoriesPage,
    getProductTypes,
    getProductsStockPage,
    getProductsStockByTypeAndNamePage,
    deleteProductsByTransaction,
    getProductsHistoriesByType,
} = require('./model/product')

const {
    getCustomersPage,
    getCustomerOptions,
} = require('./model/customer')

const {
    checkDiscount,
    getAllDiscounts
} = require('./model/discount')

const {
    getProductSellingChart,
    getTotalCustomers,
    getBestSeller,
    getProfits,
    getTotalSales,
    getStockByProductType,
    getStockMovementChart,
    getExpiryStatusChart,
} = require('./model/chart')

const db = require('./database')
const app = express()

app.set('trust proxy', true);

require('dotenv').config({ path: path.join(__dirname, '.env') });

app.use(cors())
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "/public")))
app.use('/uploads', express.static(path.join(__dirname, '/uploads')));
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

class Helper {
    numberWithCommas(x) {
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    ThaiPhoneNumber(str) {
        let result = []
        for (let i = 0; i < str.length; i++) {
            if (i == 3) {
                result.push("-")
            }
            if (i == 6) {
                result.push("-")
            }
            result.push(str[i])
        }
        return result.join("")
    }
}

const { hashPassword, verifyPassword } = require('./middleware/password');
app.use(require('./middleware/auth'));
const initAccessToken = require('./middleware/initAccessToken');
app.use(initAccessToken);

// Forward async route failures to Express error handlers.
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const isPosMode = req => (req.user.stock_mode || 'pos') === 'pos';
const optionalText = value => typeof value === 'string' && value.trim() ? value.trim() : null;

//Controller
const customerSearchRoute = field => asyncRoute(async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : 'all';
    const result = await getCustomersPage(field, query, req.query.page);
    res.render('Components/customers', {
        customers: result.customers,
        pagination: { ...result.pagination, ajax: true },
        user_data: req.user
    });
});

app.get("/searchCustomerByCardId", customerSearchRoute('cardId'));
app.get("/searchCustomerByFullName", customerSearchRoute('fullName'));
app.get("/searchCustomerByPhoneNumber", customerSearchRoute('phoneNumber'));

function getUserTypes() {
    return new Promise((resolve) => {
        db.query(`SELECT * FROM user_types ORDER BY id ASC`, (err, result) => {
            if (err) throw err;
            resolve(result)
        })
    })
}

app.get("/", asyncRoute(async (req, res) => {
    const user_data = [req.user];
    const stock_mode = req.user.stock_mode || 'pos'
    const [expired_products, productSellingChart, total_customers, bestseller, profits, total_sales, stockByProductType, stockMovementChart, expiryStatusChart] = await Promise.all([
        getExpiredProducts(),
        getProductSellingChart(),
        getTotalCustomers(),
        getBestSeller(),
        getProfits(),
        getTotalSales(),
        getStockByProductType(),
        getStockMovementChart(),
        getExpiryStatusChart(),
    ])

    res.render("home", {
        user_data: user_data,
        stock_mode: stock_mode,
        total_customers: total_customers[0],
        productSellingChart: productSellingChart,
        expired_products: expired_products,
        moment: moment,
        Helper: Helper,
        bestseller: bestseller,
        profits: profits,
        total_sales: total_sales,
        stockByProductType: stockByProductType,
        stockMovementChart: stockMovementChart,
        expiryStatusChart: expiryStatusChart,
    })
}))

app.get("/customers", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('customers')) {
        res.render('customers', {
            user_data: user_data,
            Helper: Helper
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/customers/:id", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('customers')) {
        const id = req.params.id
        db.query("SELECT * FROM customers WHERE id = ?", [id], (err, customer) => {
            if (err) throw err;
            res.render('edit_customer', {
                user_data: user_data,
                customer: customer[0]
            })
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.post("/customers", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('customers')) {
        const id = req.body.id
        const first_name = req.body.first_name
        const last_name = req.body.last_name
        const card_id = optionalText(req.body.card_id)
        const phone_number = req.body.phone_number

        const home_id = optionalText(req.body.home_id)
        const moo = optionalText(req.body.moo)
        const village = optionalText(req.body.village)
        const soi = optionalText(req.body.soi)
        const street = optionalText(req.body.street)
        const sub_district = optionalText(req.body.sub_district)
        const district = optionalText(req.body.district)
        const state = optionalText(req.body.state)
        const zip = optionalText(req.body.zip)

        const updated_at = moment().format("YYYY-MM-DD HH:mm:ss")

        db.query(`UPDATE customers SET 
            first_name = ?, last_name = ?, card_id = ?, 
            home_id = ?, moo = ?, village = ?, soi = ?, 
            street = ?, sub_district = ?, district = ?, 
            state = ?, zip = ?, phone_number = ?, updated_at = ? WHERE id = ?`,
            [first_name, last_name, card_id, home_id, moo, village, soi, street, sub_district, district, state, zip, phone_number, updated_at, id], (err) => {
                if (err) {
                    throw err;
                } else {
                    res.cookie('alert', 'success')
                    res.redirect('/customers/' + id)
                }
            })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/addCustomer", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('customers')) {
        res.render("add_customer", {
            user_data: user_data
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.post("/addCustomer", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('customers')) {
        const first_name = req.body.first_name
        const last_name = req.body.last_name
        const card_id = optionalText(req.body.card_id)

        const home_id = optionalText(req.body.home_id)
        const moo = optionalText(req.body.moo)
        const village = optionalText(req.body.village)
        const soi = optionalText(req.body.soi)
        const street = optionalText(req.body.street)
        const sub_district = optionalText(req.body.sub_district)
        const district = optionalText(req.body.district)
        const state = optionalText(req.body.state)
        const zip = optionalText(req.body.zip)

        const phone_number = req.body.phone_number
        const created_at = moment().format("YYYY-MM-DD HH:mm:ss")

        db.query("INSERT INTO customers(first_name, last_name, card_id, home_id, moo, village, soi, street, sub_district, district, state, zip, phone_number, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [first_name, last_name, card_id, home_id, moo, village, soi, street, sub_district, district, state, zip, phone_number, created_at], (err) => {
                if (err) {
                    throw err;
                } else {
                    res.cookie('alert', 'addSuccess')
                    res.redirect('/addCustomer')
                }
            })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/deleteCustomer/:id", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('customers')) {
        const id = req.params.id

        db.query("DELETE FROM customers WHERE id = ?", [id], (err) => {
            if (err) throw err;
            res.cookie('alert', 'deleteSuccess')
            res.redirect('/customers')
            res.end()
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/products_stock", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('products')) {
        let option = req.query.option ?? "list"
        let type = req.query.type ?? "all"
        const stock_mode = user_data[0].stock_mode || 'pos'
        getProductTypes().then(product_types => {
            const customersPromise = stock_mode === 'pos' ? getCustomerOptions() : Promise.resolve([])
            customersPromise.then(customers => {
                res.render('products_stock', {
                    user_data: user_data,
                    product_types: product_types,
                    customers: customers,
                    Helper: Helper,
                    option: option,
                    type: type,
                    stock_mode: stock_mode,
                })
                res.end()
            })
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/getSellProducts", (req, res) => {
    const user_data = [req.user];
    if (!user_data[0].permission.split(',').includes('products')) {
        return res.status(403).json({ error: 'คุณไม่มีสิทธิ์จัดการสินค้า' });
    }
    if ((user_data[0].stock_mode || 'pos') !== 'pos') {
        return res.status(409).json({ error: 'บริษัทนี้ใช้โหมดจัดการสต๊อกอย่างเดียว' });
    }
    let type = req.query.type
    getSellProductsByType(type).then((products_stock) => {
        res.render('Components/sellProductCatalog', {
            products_stock: products_stock
        })
        res.end()
    })
})

app.get("/getProductsHistoriesByType", (req, res) => {
    const user_data = [req.user];
    let type = req.query.type
    getProductsHistoriesByType(type).then((products_stock) => {
        res.render('Components/ProductsHistoriesByType', {
            products_stock: products_stock
        })
        res.end()
    })
})

app.get("/getProductStock", asyncRoute(async (req, res) => {
    const type = typeof req.query.type === 'string' ? req.query.type : 'all';
    const option = req.query.option === 'catalog' ? 'catalog' : 'list';
    const { products, pagination } = await getProductsStockPage(type, req.query.page);
    const view = option === "catalog" ? 'Components/productStockCatalogView' : 'Components/productStockListView';
    res.render(view, {
        products_stock: products,
        pagination: { ...pagination, ajax: true },
        moment: moment,
        type: type,
        stock_mode: req.user.stock_mode || 'pos',
    });
}))

app.get("/products_stock/:type/:name", asyncRoute(async (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('products')) {
        const name = req.params.name
        const _type = req.params.type
        const option = req.query.option ?? "list"
        const type = req.query.type ?? "all"
        const [product_types, result] = await Promise.all([
            getProductTypes(),
            getProductsStockByTypeAndNamePage(_type, name, req.query.page)
        ]);
        const pagination = {
            ...result.pagination,
            ajax: false,
            href: page => {
                const params = new URLSearchParams({
                    option: String(option),
                    type: String(type),
                    page: String(page)
                });
                return `${req.path}?${params}`;
            }
        };
        res.render('products_stock_detail', {
            user_data: user_data,
            products_stock: result.products,
            pagination: pagination,
            product_types: product_types,
            moment: moment,
            option: option,
            type: type,
            stock_mode: user_data[0].stock_mode || 'pos'
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
}))

function addProductStock(name, type, price, import_price, expired_date, created_at, amount) {
    return new Promise((resolve, reject) => {
        db.query(
            "INSERT INTO transaction(name, type, value, expired_date, created_at) VALUES(?,?,?,?,?)",
            [name, type, amount, expired_date, created_at],
            (err, inserted) => {
                if (err) return reject(err);

                Promise.resolve().then(() => {
                    const result = [{ id: inserted.insertId }];
                    if (err) return reject(err);

                    const transaction_id = result[0].id;
                    const promises = [];

                    for (let i = 0; i < amount; i++) {
                        promises.push(
                            new Promise((resolve, reject) => {
                                db.query(
                                    "INSERT INTO products(name, type, price, import_price, transaction_id, created_at) VALUES(?,?,?,?,?,?)",
                                    [name, type, price, import_price, transaction_id, created_at],
                                    (err) => {
                                        if (err) reject(err);
                                        else resolve();
                                    }
                                );
                            })
                        );
                    }

                    Promise.all(promises)
                        .then(() => resolve(true))
                        .catch((error) => reject(error));
                });
            }
        );
    });
}

app.post("/addProductStock", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('products')) {
        const name = req.body.name
        const type = req.body.type
        const amount = req.body.amount
        const stock_mode = user_data[0].stock_mode || 'pos'
        const price = stock_mode === 'inventory_only' ? 0 : req.body.price
        const import_price = stock_mode === 'inventory_only' ? null : (req.body.import_price || null)
        const expired_date = req.body.expired_date || null
        const created_at = moment().format("YYYY-MM-DD HH:mm:ss")

        addProductStock(name, type, price, import_price, expired_date, created_at, amount).then((result) => {
            if (result == true) {
                res.status(200).json({ success: true, message: 'INSERT OR IGNORE products successful!' });
            } else {
                res.status(500).json({ error: result.code });
            }
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.post('/sellProduct', (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('products')) {
        if ((user_data[0].stock_mode || 'pos') !== 'pos') {
            return res.status(409).json({ error: 'บริษัทนี้ใช้โหมดจัดการสต๊อกอย่างเดียว' });
        }
        const cart = req.body.cart
        const customer = req.body.customer === "-" ? null : req.body.customer;
        const discount_code = req.body.discount_code || null
        const created_at = moment().format("YYYY-MM-DD HH:mm:ss")

        if (discount_code != null) {
            checkDiscount(discount_code).then(discount_result => {
                if (discount_result == null) {
                    res.status(500).json({ error: "โค้ดส่วนลดไม่ถูกต้อง!" });
                    return;
                } else {
                    processCart();
                }
            })
        } else {
            processCart();
        }

        async function processCart() {
            try {
                // Get the last billing ID
                const lastBillingResult = await new Promise((resolve, reject) => {
                    db.query(
                        "SELECT billing_id FROM transaction WHERE billing_id IS NOT NULL ORDER BY id DESC LIMIT 1",
                        (err, result) => (err ? reject(err) : resolve(result))
                    );
                });

                let billing_id = 1; // Default to 1 if no previous billing ID exists
                if (lastBillingResult.length > 0) {
                    billing_id = parseInt(lastBillingResult[0].billing_id) + 1;
                }

                // First, check if enough products are available in the inventory
                for (let i = 0; i < cart.length; i++) {
                    const { product_type, product_name, product_price, amount } = cart[i];

                    // Check the available quantity of the product
                    const availableProductResult = await new Promise((resolve, reject) => {
                        db.query(
                            "SELECT COUNT(*) AS available_count FROM products WHERE is_sold = 0 AND type = ? AND name = ? AND price = ?",
                            [product_type, product_name, product_price],
                            (err, result) => (err ? reject(err) : resolve(result))
                        );
                    });

                    const availableCount = availableProductResult[0].available_count;

                    // If there aren't enough products available, throw an error
                    if (availableCount < amount) {
                        throw new Error(`สินค้า: ${product_name} มีไม่เพียงพอสำหรับคำสั่งซื้อนี้`);
                    }

                    // If enough stock is available, proceed with the transaction
                    for (let j = 0; j < amount; j++) {
                        // Select product ID
                        const productResult = await new Promise((resolve, reject) => {
                            db.query(
                                "SELECT id FROM products WHERE is_sold = 0 AND type = ? AND name = ? AND price = ? LIMIT 1",
                                [product_type, product_name, product_price],
                                (err, result) => (err ? reject(err) : resolve(result))
                            );
                        });

                        if (productResult.length === 0) {
                            throw new Error("สินค้าหมด");
                        }

                        const product_id = productResult[0].id;

                        // Mark product as sold
                        await new Promise((resolve, reject) => {
                            db.query(
                                "UPDATE products SET is_sold = 1 WHERE id = ?",
                                [product_id],
                                (err) => (err ? reject(err) : resolve())
                            );
                        });

                        // INSERT OR IGNORE transaction
                        await new Promise((resolve, reject) => {
                            db.query(
                                "INSERT INTO transaction(type, name, value, stock_id, customer_id, billing_id, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)",
                                [product_type, product_name, -1, product_id, customer, billing_id, created_at],
                                (err) => (err ? reject(err) : resolve())
                            );
                        });
                    }
                }
                if (discount_code != null) {
                    db.query("UPDATE discounts SET billing_id = ? WHERE code = ?", [billing_id, discount_code], (err) => {
                        if (err) res.sendStatus(500).json({ error: err.message })
                        res.status(200).json({ success: true, bill: `/billing/${billing_id}` });
                    })
                } else {
                    res.status(200).json({ success: true, bill: `/billing/${billing_id}` });
                }
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: err.message });
            }
        }
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.post('/deductStock', asyncRoute(async (req, res) => {
    const user = req.user;
    if (!user.permission.split(',').includes('products')) {
        return res.status(403).json({ error: 'คุณไม่มีสิทธิ์จัดการสินค้า' });
    }
    if (user.stock_mode !== 'inventory_only') {
        return res.status(409).json({ error: 'บริษัทนี้ใช้โหมดขายหน้าร้าน' });
    }

    const product_type = Number(req.body.product_type);
    const product_name = req.body.product_name;
    const amount = Number(req.body.amount);
    if (!Number.isSafeInteger(product_type) || product_type < 1 ||
        typeof product_name !== 'string' || product_name.trim().length === 0 || product_name.length > 200 ||
        !Number.isSafeInteger(amount) || amount < 1 || amount > 1000) {
        return res.status(400).json({ error: 'กรุณาเลือกสินค้าและระบุจำนวน 1–1000 ชิ้น' });
    }

    const company_id = user.company_id;
    const created_at = moment().format('YYYY-MM-DD HH:mm:ss');
    const connection = await db.auth.promise().getConnection();
    try {
        await connection.beginTransaction();
        const [products] = await connection.query(
            'SELECT id FROM products WHERE company_id = ? AND is_sold = 0 AND type = ? AND name = ? ORDER BY id LIMIT ? FOR UPDATE',
            [company_id, product_type, product_name.trim(), amount]
        );
        if (products.length < amount) {
            await connection.rollback();
            return res.status(409).json({ error: `สินค้า ${product_name} มีไม่เพียงพอ` });
        }

        for (const product of products) {
            await connection.query(
                'UPDATE products SET is_sold = 1 WHERE company_id = ? AND id = ? AND is_sold = 0',
                [company_id, product.id]
            );
            await connection.query(
                'INSERT INTO `transaction` (type, name, value, stock_id, customer_id, billing_id, created_at, company_id) VALUES (?, ?, -1, ?, NULL, NULL, ?, ?)',
                [product_type, product_name.trim(), product.id, created_at, company_id]
            );
        }
        await connection.commit();
        return res.status(200).json({ success: true, amount: products.length });
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}));

app.get('/deleteProductByTransction/:id', (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('products')) {
        const transaction_id = req.params.id
        deleteProductsByTransaction(transaction_id).then(() => {
            res.redirect('/products_stock')
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get('/billing/:id', (req, res) => {
    const user_data = [req.user];
    if (!isPosMode(req)) return res.redirect('/products_stock');
    if (user_data[0].permission.split(',').includes('bills')) {
        const id = req.params.id

        db.query(`SELECT 
            t.name,
            sub.price,
            sub.total_price,
            sub.amount,
            c.first_name,
            c.last_name,
            c.id,
            t.created_at,
            c.phone_number,
            dc.amount as discount_amount
        FROM 
            (
                SELECT 
                    t.name,
                    pd.price AS price,
                    SUM(pd.price) AS total_price,
                    COUNT(*) AS amount
                FROM 
                    transaction AS t
                JOIN 
                    products AS pd ON pd.id = t.stock_id
                WHERE 
                    t.billing_id = ?
                GROUP BY 
                    t.name
            ) AS sub
        JOIN 
            transaction AS t ON t.name = sub.name
        JOIN 
            products AS pd ON pd.id = t.stock_id
        LEFT JOIN 
            customers AS c ON c.id = t.customer_id
        LEFT JOIN
            discounts AS dc ON dc.billing_id = t.billing_id 
        WHERE 
            t.billing_id = ?
        GROUP BY 
            t.name, pd.price;
        `, [id, id], (err, bill) => {
            if (err) throw err;
            res.render('billing', {
                user_data: user_data,
                bill: bill,
                billing_id: id,
                moment: moment,
                Helper: Helper,
                receipt_size: req.user.receipt_size || 'a5_landscape'
            })
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/billingHistories", (req, res) => {
    const user_data = [req.user];
    if (!isPosMode(req)) return res.redirect('/products_stock');
    if (user_data[0].permission.split(',').includes('bills')) {
        let customer_id = req.query.customer_id !== undefined ? req.query.customer_id : 'all';
        getCustomerOptions().then(owners => {
            res.render('billing_histories', {
                user_data: user_data,
                owners: owners,
                customer_id: customer_id
            })
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/getBillingHistoriesByCustomer", asyncRoute(async (req, res) => {
    const user_data = [req.user];
    if (!isPosMode(req)) return res.status(409).json({ error: 'บริษัทนี้ใช้โหมดจัดการสต๊อกอย่างเดียว' });
    const customerId = typeof req.query.customer_id === 'string' ? req.query.customer_id : 'all';
    const result = await getBillingHistoriesPage(customerId, req.query.page);
    res.render('Components/billingHistories', {
        bills: result.bills,
        pagination: { ...result.pagination, ajax: true },
        moment: moment
    });
}))

app.get("/deleteBill/:id", (req, res) => {
    const user_data = [req.user];
    if (!isPosMode(req)) return res.redirect('/products_stock');
    if (user_data[0].permission.split(',').includes('bills')) {
        const id = req.params.id

        db.query("UPDATE products SET is_sold = 0 WHERE id IN (SELECT stock_id FROM transaction WHERE billing_id = ?)", [id], (err) => {
            if (err) throw err;
            db.query("DELETE FROM transaction WHERE billing_id = ?", [id], (err) => {
                if (err) throw err;
                res.cookie('alert', 'deleteSuccess')
                res.redirect('/billingHistories')
                res.end()
            })
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/editProduct/:transaction", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('products')) {
        const transaction = req.params.transaction
        const type = req.query.type ?? "all"
        const option = req.query.option ?? "list"
        db.query(`SELECT pd.name, pd.type, t.expired_date, pd.price, pd.transaction_id, t.created_at, pd.updated_at, pd.import_price 
            FROM products as pd JOIN transaction as t ON t.id = pd.transaction_id 
            WHERE pd.transaction_id = ? GROUP BY name, type`, [transaction], (err, stock) => {
            if (err) throw err;
            getProductTypes().then((product_types) => {
                res.render("edit_product", {
                    user_data: user_data,
                    stock: stock[0],
                    product_types: product_types,
                    moment: moment,
                    type: type,
                    option: option,
                    stock_mode: user_data[0].stock_mode || 'pos',
                })
                res.end()
            })
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.post("/editProduct", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('products')) {
        const type = req.body.type
        const name = req.body.name
        const stock_mode = user_data[0].stock_mode || 'pos'
        const expired_date = req.body.expired_date || null
        const transaction_id = req.body.transaction_id
        const updated_at = moment().format("YYYY-MM-DD HH:mm:ss")

        const _type = req.query.type ?? "catalog"
        const option = req.query.option ?? "list"

        const updateProductsSql = stock_mode === 'inventory_only'
            ? "UPDATE products SET type = ?, name = ?, updated_at = ? WHERE transaction_id = ?"
            : "UPDATE products SET type = ?, name = ?, price = ?, import_price = ?, updated_at = ? WHERE transaction_id = ?"
        const updateProductsValues = stock_mode === 'inventory_only'
            ? [type, name, updated_at, transaction_id]
            : [type, name, req.body.price, req.body.import_price, updated_at, transaction_id]

        db.query(updateProductsSql, updateProductsValues, (err) => {
            if (err) throw err;
            db.query("UPDATE transaction SET type = ?, name = ?, expired_date = ? WHERE id = ?", [type, name, expired_date, transaction_id], (err) => {
                if (err) throw err;
                res.cookie('alert', 'success')
                res.redirect(`/editProduct/${transaction_id}?type=${_type}&option=${option}`)
            })
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

//Discounts
app.get("/discounts", (req, res) => {
    const user_data = [req.user];
    if (!isPosMode(req)) return res.redirect('/products_stock');
    if (user_data[0].permission.split(',').includes('products')) {

        getAllDiscounts().then(discounts => {
            res.render('discounts', {
                user_data: user_data,
                discounts: discounts,
                Helper: Helper
            })
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/discounts/:id", (req, res) => {
    const user_data = [req.user];
    if (!isPosMode(req)) return res.redirect('/products_stock');
    if (user_data[0].permission.split(',').includes('products')) {
        const id = req.params.id
        db.query("SELECT * FROM discounts WHERE id = ?", [id], (err, discount) => {
            if (err) throw err;
            res.render('edit_discount', {
                user_data: user_data,
                discount: discount[0]
            })
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.post("/discounts", (req, res) => {
    const user_data = [req.user];
    if (!isPosMode(req)) return res.redirect('/products_stock');
    if (user_data[0].permission.split(',').includes('products')) {
        const id = req.body.id
        const code = req.body.code
        const amount = req.body.amount
        const updated_at = moment().format("YYYY-MM-DD HH:mm:ss")
        const updated_by = user_data[0].id

        db.query(`UPDATE discounts SET 
            code = ?, amount = ?, updated_at = ?, updated_by = ? WHERE id = ?`,
            [code, amount, updated_at, updated_by, id], (err) => {
                if (err) {
                    throw err;
                } else {
                    res.cookie('alert', 'success')
                    res.redirect('/discounts/' + id)
                }
            })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/addDiscount", (req, res) => {
    const user_data = [req.user];
    if (!isPosMode(req)) return res.redirect('/products_stock');
    if (user_data[0].permission.split(',').includes('products')) {
        res.render("add_discount", {
            user_data: user_data
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.post("/addDiscount", (req, res) => {
    const user_data = [req.user];
    if (!isPosMode(req)) return res.redirect('/products_stock');
    if (user_data[0].permission.split(',').includes('products')) {
        const code = req.body.code
        const amount = req.body.amount
        const created_at = moment().format("YYYY-MM-DD HH:mm:ss")
        const created_by = user_data[0].id

        db.query("INSERT INTO discounts(code,amount,created_at,created_by) VALUES(?,?,?,?)",
            [code, amount, created_at, created_by], (err) => {
                if (err) {
                    throw err;
                } else {
                    res.cookie('alert', 'addSuccess')
                    res.redirect('/discounts')
                }
            })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/deleteDiscount/:id", (req, res) => {
    const user_data = [req.user];
    if (!isPosMode(req)) return res.redirect('/products_stock');
    if (user_data[0].permission.split(',').includes('products')) {
        const id = req.params.id

        db.query("DELETE FROM discounts WHERE id = ?", [id], (err) => {
            if (err) throw err;
            res.cookie('alert', 'deleteSuccess')
            res.redirect('/discounts')
            res.end()
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/product_types", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('products')) {
        getProductTypes().then(product_types => {
            res.render('product_types', {
                user_data: user_data,
                product_types: product_types
            })
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.post("/addProductType", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('products')) {
        const name = req.body.name

        db.query("INSERT INTO product_types(name) VALUES(?)", [name], (err) => {
            if (err) res.status(500).json({ error: err.code });
            res.status(200).json({ success: true, message: 'INSERT OR IGNORE product type successful!' });
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/deleteProductType/:id", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('products')) {
        const id = req.params.id

        db.query("DELETE FROM product_types WHERE id = ?", [id], (err) => {
            if (err) throw err;
            res.cookie('alert', 'deleteSuccess')
            res.redirect('/product_types')
            res.end()
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/editProductType/:id", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('products')) {
        db.query("SELECT * FROM product_types WHERE id = ?", [req.params.id], (err, result) => {
            if (err) throw err;
            res.render('edit_product_type', {
                user_data: user_data,
                row: result[0]
            })
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.post("/editProductType", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('products')) {
        const id = req.body.id
        const name = req.body.name

        db.query("UPDATE product_types SET name = ? WHERE id = ?", [name, id], (err) => {
            if (err) throw err;
            res.cookie('alert', 'success')
            res.redirect('/editProductType/' + id)
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

//UserTypes
app.get("/user_types", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('users')) {
        getUserTypes().then(user_types => {
            res.render('user_types', {
                user_data: user_data,
                user_types: user_types
            })
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.post("/addUserType", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('users')) {
        const name = req.body.name
        const permission = req.body.permission

        db.query("INSERT INTO user_types(name,permission) VALUES(?,?)", [name, permission], (err) => {
            if (err) res.status(500).json({ error: err.code });
            res.status(200).json({ success: true, message: 'INSERT OR IGNORE user type successful!' });
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/deleteUserType/:id", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('users')) {
        const id = req.params.id

        db.query("DELETE FROM user_types WHERE id = ?", [id], (err) => {
            if (err) throw err;
            res.cookie('alert', 'deleteSuccess')
            res.redirect('/user_types')
            res.end()
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/editUserType/:id", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('users')) {
        db.query("SELECT * FROM user_types WHERE id = ?", [req.params.id], (err, result) => {
            if (err) throw err;
            res.render('edit_user_type', {
                user_data: user_data,
                row: result[0]
            })
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.post("/editUserType", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('users')) {
        const id = req.body.id
        const name = req.body.name
        const permission = req.body.permission

        db.query("UPDATE user_types SET name = ?, permission = ? WHERE id = ?", [name, permission, id], (err) => {
            if (err) throw err;
            res.cookie('alert', 'success')
            res.redirect('/editUserType/' + id)
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get('/hashPassword/:password', (req, res) => {
    const password = createHash('sha256').update(req.params.password).digest('base64');
    res.send(password)
})

app.get("/settings", (req, res) => {
    const user_data = [req.user];
    res.render('settings', {
        user_data: user_data
    })
})

app.post('/settings/stock-mode', (req, res, next) => {
    const user = req.user;
    if (!user.permission.split(',').includes('users')) {
        res.cookie('alert', 'permissionDenial');
        return res.redirect('/settings');
    }

    const stock_mode = req.body.stock_mode;
    if (!['pos', 'inventory_only'].includes(stock_mode)) {
        return res.status(400).send('โหมดการจัดการสต๊อกไม่ถูกต้อง');
    }

    db.auth.query('UPDATE companies SET stock_mode = ? WHERE id = ?', [stock_mode, req.company_id], err => {
        if (err) return next(err);
        res.redirect('/settings');
    });
})

app.post('/settings/receipt-size', (req, res, next) => {
    const user = req.user;
    if (!user.permission.split(',').includes('users')) {
        res.cookie('alert', 'permissionDenial');
        return res.redirect('/settings');
    }

    const receipt_size = req.body.receipt_size;
    if (!['a5_landscape', '80x80'].includes(receipt_size)) {
        return res.status(400).send('ขนาดใบเสร็จไม่ถูกต้อง');
    }

    db.auth.query('UPDATE companies SET receipt_size = ? WHERE id = ?', [receipt_size, req.company_id], err => {
        if (err) return next(err);
        res.redirect('/settings');
    });
})

app.get("/loginHistories", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('users')) {
        const id = req.params.id
        db.query('SELECT u.full_name, u.username, h.time, h.ip_address FROM login_history as h JOIN users as u ON u.id = h.user_id ORDER BY h.time DESC', [id], (err, history) => {
            if (err) throw err;
            res.render('login_histories', {
                user_data: user_data,
                moment: moment,
                history: history
            })
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/Users", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('users')) {
        db.query("SELECT u.id, u.username, u.full_name, ut.name as type FROM users as u JOIN user_types as ut ON ut.id = u.type ORDER BY u.type ASC", (err, users) => {
            if (err) throw err;
            res.render('Users/users', {
                user_data: user_data,
                users: users
            })
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/editUser/:id", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('users')) {
        getUserTypes().then(user_types => {
            const id = req.params.id
            db.query("SELECT id, username, full_name, type FROM users WHERE id = ?", [id], (err, user) => {
                if (err) throw err;
                res.render('Users/edit_user', {
                    user_data: user_data,
                    user_types: user_types,
                    user: user[0]
                })
            })
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.post("/editUser", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('users')) {
        const id = req.body.id
        const username = req.body.username
        const type = req.body.type
        const full_name = req.body.full_name

        const updated_at = moment().format("YYYY-MM-DD HH:mm:ss")

        db.query("UPDATE users SET username = ?, full_name = ?, type = ?, updated_by = ?, updated_at = ? WHERE id = ?", [username, full_name, type, user_data[0].id, updated_at, id], (err) => {
            if (err) throw err;
            res.cookie('alert', 'success')
            res.redirect('/Users')
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/addUser", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('users')) {
        getUserTypes().then(user_types => {
            res.render('Users/add_user', {
                user_data: user_data,
                user_types: user_types
            })
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.post("/addUser", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('users')) {
        const username = req.body.username
        const password = createHash('sha256').update(req.body.password).digest('base64');
        const type = req.body.type
        const full_name = req.body.full_name

        const created_at = moment().format("YYYY-MM-DD HH:mm:ss")

        db.query("INSERT INTO users(username,password,type,full_name,created_by,created_at) VALUES(?,?,?,?,?,?)", [username, password, type, full_name, user_data[0].id, created_at], (err) => {
            if (err) throw err;
            res.cookie('alert', 'addSuccess')
            res.redirect('/Users')
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/deleteUser/:id", (req, res) => {
    const user_data = [req.user];
    if (user_data[0].permission.split(',').includes('users')) {
        const id = req.params.id

        db.query("DELETE FROM users WHERE id = ?", [id], (err) => {
            if (err) throw err;
            res.cookie('alert', 'deleteSuccess')
            res.redirect('/Users')
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get('/editProfile', (req, res) => {
    const user_data = [req.user];
    res.render('Users/edit_profile', {
        user_data: user_data
    })
})

app.post('/editProfile', (req, res) => {
    const user_data = [req.user];
    const id = req.body.id
    const username = req.body.username
    const full_name = req.body.full_name
    const color = req.body.color

    if (user_data[0].id != id) {
        res.cookie('alert', 'permissionDenial')
        return res.redirect('/editProfile')
    }

    db.query("UPDATE users SET username = ?, full_name = ?, color = ? WHERE id = ?", [username, full_name, color, id], (err) => {
        if (err) throw err;
        res.cookie('alert', 'success')
        res.redirect('/editProfile')
    })
})

app.get('/changePassword', (req, res) => {
    const user_data = [req.user];
    if (user_data[0].username == "demo") {
        res.send("ไม่สามารถเปลี่ยนรหัสผ่านของผู้ใช้ทดลองได้!")
        return;
    }
    res.render('Users/change_password', {
        user_data: user_data
    })
})

app.post("/changePassword", (req, res) => {
    const user_data = [req.user];
    const id = req.user.id
    let old_password = req.body.old_password
    let new_password = req.body.new_password
    let confirm_password = req.body.confirm_password

    if (new_password != confirm_password) {
        res.cookie('alert', 'passwordNotMatch')
        return res.redirect(req.get("Referrer"))
    }

    if (typeof new_password !== 'string' || new_password.length < 8 || new_password.length > 128) return res.status(400).send('Password must be 8–128 characters');
    const password_hash = hashPassword(new_password);

    db.query("SELECT * FROM users WHERE id = ?", [id], (err, result) => {
        if (err) throw err;
        if (result.length == 1 && verifyPassword(old_password, result[0].password)) {
            db.query("UPDATE users SET password = ? WHERE id = ?", [password_hash, id], (err) => {
                if (err) throw err;
                res.cookie('alert', 'success')
                res.redirect('/logout')
            })
        } else {
            res.cookie('alert', 'oldPasswordNotMatch')
            res.redirect("/settings")
        }
    })

})

app.get('/getURL', (req, res) => {
    var fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;

    res.render('error', {
        title: 'Developer options',
        content: `Current URL: ${fullUrl}`
    })
})

const stockRouter = require('./frontend')

app.use('/stock', stockRouter);

app.get('*', (req, res) => {
    res.render('error', { title: "พบข้อผิดพลาด: ไม่พบข้อมูล", content: "ลิงค์นี้อาจจะถูกย้าย หรือหมดอายุแล้ว โปรดตรวจสอบลิงค์ว่าถูกต้อง" })
    res.end()
})

require('./schema/sync')(db.auth).then(() => app.listen(process.env.PORT || 3000, () => {
    console.log(moment().format("DD/MM/YY HH:mm:ss") + " [+] Sunny420x POS System been started at http://localhost:" + process.env.PORT)
})).catch(err => { console.error('Database schema update failed:', err.message); process.exitCode = 1; db.auth.end(); });
