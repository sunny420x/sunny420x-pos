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
    setProductAvailability,
    setProductTrackingMode,
} = require('./model/product')

const {
    getCustomersPage,
    getCustomerOptions,
} = require('./model/customer')

const {
    getAllDiscounts
} = require('./model/discount')
const {
    confirmQuotation,
    createQuotation,
    getQuotation,
    getQuotationsPage,
} = require('./model/quotation')
const { createSale } = require('./model/sale')
const {
    addAssetStock,
    createAssetType,
    deleteProductAssetRecipe,
    getAvailableAssets,
    getAllAssetGroups,
    getAllProductAssetRecipes,
    getAssetStockPage,
    getAssetType,
    getAssetTypes,
    getProductGroups,
    getProductAssetRecipes,
    saveProductAssetRecipe,
} = require('./model/asset')

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
            res.render('customers/edit_customer', {
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
        res.render("customers/add_customer", {
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

app.get('/products_stock', asyncRoute(async (req, res) => {
    if (!req.user.permission.split(',').includes('products')) {
        res.cookie('alert', 'permissionDenial');
        return res.redirect(req.get('Referrer'));
    }
    const option = req.query.option ?? 'list';
    const type = req.query.type ?? 'all';
    const stockMode = req.user.stock_mode || 'pos';
    const [productTypes, customers, cartAssets] = await Promise.all([
        getProductTypes(),
        stockMode === 'pos' ? getCustomerOptions() : Promise.resolve([]),
        stockMode === 'pos' ? getAvailableAssets() : Promise.resolve([]),
    ]);
    return res.render('products_stock', {
        user_data: [req.user],
        product_types: productTypes,
        customers,
        Helper,
        option,
        type,
        stock_mode: stockMode,
        cartAssets,
    });
}));

app.get('/getSellProducts', asyncRoute(async (req, res) => {
    if (!req.user.permission.split(',').includes('products')) {
        return res.status(403).json({ error: 'คุณไม่มีสิทธิ์จัดการสินค้า' });
    }
    if ((req.user.stock_mode || 'pos') !== 'pos') {
        return res.status(409).json({ error: 'บริษัทนี้ใช้โหมดจัดการสต๊อกอย่างเดียว' });
    }
    const products_stock = await getSellProductsByType(req.query.type);
    return res.render('Components/sellProductCatalog', { products_stock });
}));

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
    const name = typeof req.query.name === 'string' ? req.query.name.trim().slice(0, 100) : '';
    const { products, pagination } = await getProductsStockPage(type, name, req.query.page);
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

app.post('/addProductStock', asyncRoute(async (req, res) => {
    if (!req.user.permission.split(',').includes('products')) {
        return res.status(403).json({ error: 'คุณไม่มีสิทธิ์จัดการสินค้า' });
    }
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const type = Number(req.body.type);
    const stockMode = req.user.stock_mode || 'pos';
    const trackingMode = stockMode === 'pos' && req.body.tracking_mode === 'availability'
        ? 'availability'
        : 'quantity';
    const amount = trackingMode === 'availability' ? 1 : Number(req.body.amount);
    const price = stockMode === 'inventory_only' ? 0 : Number(req.body.price);
    const importPrice = stockMode === 'inventory_only' || req.body.import_price === ''
        ? null
        : Number(req.body.import_price || 0);
    const expiredDate = req.body.expired_date || null;
    if (!name || name.length > 200 || !Number.isSafeInteger(type) || type < 1 ||
        !Number.isSafeInteger(amount) || amount < 1 || amount > 1000 ||
        !Number.isSafeInteger(price) || price < 0 ||
        (importPrice !== null && (!Number.isSafeInteger(importPrice) || importPrice < 0))) {
        return res.status(400).json({ error: 'ข้อมูลสินค้าไม่ถูกต้อง' });
    }
    const [types] = await db.auth.promise().query(
        'SELECT id FROM product_types WHERE company_id = ? AND id = ?',
        [req.user.company_id, type]
    );
    if (!types.length) return res.status(400).json({ error: 'ไม่พบหมวดหมู่สินค้าที่เลือก' });

    if (trackingMode === 'availability') {
        const [products] = await db.auth.promise().query(
            'SELECT id FROM products WHERE company_id = ? AND type = ? AND name = ? LIMIT 1',
            [req.user.company_id, type, name]
        );
        if (!products.length) {
            await addProductStock(name, type, price, importPrice, expiredDate, moment().format('YYYY-MM-DD HH:mm:ss'), 1);
        }
        await setProductTrackingMode(type, name, trackingMode, req.user.company_id);
        await setProductAvailability(type, name, true);
    } else {
        await addProductStock(name, type, price, importPrice, expiredDate, moment().format('YYYY-MM-DD HH:mm:ss'), amount);
        if (stockMode === 'pos') await setProductTrackingMode(type, name, 'quantity', req.user.company_id);
    }
    return res.status(200).json({ success: true });
}));

app.post('/sellProduct', asyncRoute(async (req, res) => {
    if (!req.user.permission.split(',').includes('products')) {
        return res.status(403).json({ error: 'คุณไม่มีสิทธิ์จัดการสินค้า' });
    }
    if (!isPosMode(req)) return res.status(409).json({ error: 'บริษัทนี้ใช้โหมดจัดการสต๊อกอย่างเดียว' });
    const customerId = req.body.customer === '-' || req.body.customer === '' || req.body.customer == null
        ? null
        : Number(req.body.customer);
    if (customerId !== null && (!Number.isSafeInteger(customerId) || customerId < 1)) {
        return res.status(400).json({ error: 'ข้อมูลลูกค้าไม่ถูกต้อง' });
    }
    if (req.body.discount_code != null && typeof req.body.discount_code !== 'string') {
        return res.status(400).json({ error: 'โค้ดส่วนลดไม่ถูกต้อง' });
    }
    const discountCode = typeof req.body.discount_code === 'string' ? req.body.discount_code.trim() || null : null;
    if (discountCode && discountCode.length > 100) {
        return res.status(400).json({ error: 'โค้ดส่วนลดต้องมีความยาวไม่เกิน 100 ตัวอักษร' });
    }
    try {
        const result = await createSale({
            companyId: req.user.company_id,
            cart: req.body.cart,
            customerId,
            discountCode,
            assetAdjustments: req.body.asset_adjustments,
        });
        return res.status(200).json({ success: true, bill: `/billing/${result.billingId}` });
    } catch (error) {
        if (!error.statusCode) console.error('Sale creation failed:', error);
        return res.status(error.statusCode || 500).json({
            error: error.statusCode ? error.message : 'บันทึกการขายไม่สำเร็จ กรุณาลองอีกครั้ง',
        });
    }
}));

app.post('/quotations', asyncRoute(async (req, res) => {
    if (!isPosMode(req)) return res.status(409).json({ error: 'บริษัทนี้ใช้โหมดจัดการสต๊อกอย่างเดียว' });
    if (!req.user.permission.split(',').includes('products')) {
        return res.status(403).json({ error: 'คุณไม่มีสิทธิ์จัดการสินค้า' });
    }

    const customer = req.body.customer;
    const customerId = customer === '-' || customer === '' || customer === undefined
        ? null
        : Number(customer);
    if (customerId !== null && (!Number.isSafeInteger(customerId) || customerId < 1)) {
        return res.status(400).json({ error: 'ข้อมูลลูกค้าไม่ถูกต้อง' });
    }
    if (req.body.discount_code !== undefined && req.body.discount_code !== null &&
        typeof req.body.discount_code !== 'string') {
        return res.status(400).json({ error: 'โค้ดส่วนลดไม่ถูกต้อง' });
    }
    const discountCode = typeof req.body.discount_code === 'string'
        ? req.body.discount_code.trim() || null
        : null;
    if (discountCode && discountCode.length > 100) {
        return res.status(400).json({ error: 'โค้ดส่วนลดต้องมีความยาวไม่เกิน 100 ตัวอักษร' });
    }

    try {
        const quotation = await createQuotation({
            companyId: req.user.company_id,
            userId: req.user.id,
            cart: req.body.cart,
            customerId,
            discountCode,
            assetAdjustments: req.body.asset_adjustments,
        });
        return res.status(201).json({ success: true, quotation: `/quotations/${quotation.id}` });
    } catch (error) {
        if (!error.statusCode) console.error('Quotation creation failed:', error);
        return res.status(error.statusCode || 500).json({
            error: error.statusCode ? error.message : 'ออกใบเสนอราคาไม่สำเร็จ กรุณาลองอีกครั้ง'
        });
    }
}));

app.get('/assets', asyncRoute(async (req, res) => {
    if (!isPosMode(req)) return res.redirect('/products_stock');
    if (!req.user.permission.split(',').includes('products')) {
        return res.status(403).send('คุณไม่มีสิทธิ์จัดการสินค้า');
    }
    const result = await getAssetStockPage(req.query.page);
    return res.render('assets', {
        user_data: [req.user],
        assets: result.assets,
        pagination: {
            ...result.pagination,
            ajax: false,
            href: page => `/assets?page=${page}`,
        },
    });
}));

app.get('/assets/new', asyncRoute(async (req, res) => {
    if (!isPosMode(req)) return res.redirect('/products_stock');
    if (!req.user.permission.split(',').includes('products')) return res.status(403).send('คุณไม่มีสิทธิ์จัดการสินค้า');
    return res.render('asset_form', {
        user_data: [req.user],
        assetTypes: await getAssetTypes(),
    });
}));

app.get('/assetRecipes', asyncRoute(async (req, res) => {
    if (!isPosMode(req)) return res.redirect('/products_stock');
    if (!req.user.permission.split(',').includes('products')) return res.status(403).send('คุณไม่มีสิทธิ์จัดการสินค้า');
    const [assetGroups, productGroups, productTypes, assetTypes, recipes] = await Promise.all([
        getAllAssetGroups(),
        getProductGroups(),
        getProductTypes(),
        getAssetTypes(),
        getAllProductAssetRecipes(),
    ]);
    return res.render('asset_recipes', {
        user_data: [req.user],
        assetGroups,
        productGroups,
        productTypes,
        assetTypes,
        recipes,
    });
}));

app.post('/assets', asyncRoute(async (req, res) => {
    if (!isPosMode(req)) return res.status(409).json({ error: 'บริษัทนี้ใช้โหมดจัดการสต๊อกอย่างเดียว' });
    if (!req.user.permission.split(',').includes('products')) {
        return res.status(403).json({ error: 'คุณไม่มีสิทธิ์จัดการสินค้า' });
    }
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const type = Number(req.body.type);
    const amount = Number(req.body.amount);
    const importPrice = req.body.import_price === '' || req.body.import_price == null
        ? null
        : Number(req.body.import_price);
    if (!name || name.length > 200 || !Number.isSafeInteger(type) || type < 1 ||
        !Number.isSafeInteger(amount) || amount < 1 || amount > 1000 ||
        (importPrice !== null && (!Number.isSafeInteger(importPrice) || importPrice < 0))) {
        return res.status(400).json({ error: 'ข้อมูลวัสดุไม่ถูกต้อง' });
    }
    const [types] = await db.auth.promise().query(
        'SELECT id FROM asset_types WHERE company_id = ? AND id = ?',
        [req.user.company_id, type]
    );
    if (!types.length) return res.status(400).json({ error: 'ไม่พบหมวดหมู่ที่เลือก' });

    await addAssetStock({
        name,
        type,
        amount,
        importPrice,
        companyId: req.user.company_id,
    });
    return res.status(201).json({ success: true });
}));

app.post('/assetTypes', asyncRoute(async (req, res) => {
    if (!isPosMode(req)) return res.status(409).json({ error: 'บริษัทนี้ใช้โหมดจัดการสต๊อกอย่างเดียว' });
    if (!req.user.permission.split(',').includes('products')) {
        return res.status(403).json({ error: 'คุณไม่มีสิทธิ์จัดการสินค้า' });
    }
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 100) return res.status(400).json({ error: 'ชื่อหมวดหมู่วัสดุไม่ถูกต้อง' });
    try {
        await createAssetType(name, req.user.company_id);
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'มีหมวดหมู่วัสดุชื่อนี้แล้ว' });
        }
        throw error;
    }
    return res.status(201).json({ success: true });
}));

app.get('/assetTypes', asyncRoute(async (req, res) => {
    if (!isPosMode(req)) return res.redirect('/products_stock');
    if (!req.user.permission.split(',').includes('products')) return res.status(403).send('คุณไม่มีสิทธิ์จัดการสินค้า');
    return res.render('asset_types', {
        user_data: [req.user],
        assetTypes: await getAssetTypes(),
    });
}));

app.get('/assetTypes/new', asyncRoute(async (req, res) => {
    if (!isPosMode(req)) return res.redirect('/products_stock');
    if (!req.user.permission.split(',').includes('products')) return res.status(403).send('คุณไม่มีสิทธิ์จัดการสินค้า');
    return res.render('asset_type_form', { user_data: [req.user], assetType: null });
}));

app.get('/assetTypes/:id/edit', asyncRoute(async (req, res) => {
    if (!isPosMode(req)) return res.redirect('/products_stock');
    if (!req.user.permission.split(',').includes('products')) return res.status(403).send('คุณไม่มีสิทธิ์จัดการสินค้า');
    if (!/^[1-9]\d*$/.test(req.params.id)) return res.sendStatus(404);
    const assetType = await getAssetType(req.params.id);
    if (!assetType) return res.sendStatus(404);
    return res.render('asset_type_form', { user_data: [req.user], assetType });
}));

app.post('/assetTypes/:id/edit', asyncRoute(async (req, res) => {
    if (!isPosMode(req)) return res.status(409).send('บริษัทนี้ใช้โหมดจัดการสต๊อกอย่างเดียว');
    if (!req.user.permission.split(',').includes('products')) return res.status(403).send('คุณไม่มีสิทธิ์จัดการสินค้า');
    if (!/^[1-9]\d*$/.test(req.params.id)) return res.sendStatus(404);
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 100) {
        const assetType = await getAssetType(req.params.id);
        if (!assetType) return res.sendStatus(404);
        return res.status(400).render('asset_type_form', {
            user_data: [req.user], assetType, error: 'ชื่อหมวดหมู่วัสดุต้องมี 1–100 ตัวอักษร',
        });
    }
    try {
        await updateAssetType(req.params.id, name);
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            const assetType = await getAssetType(req.params.id);
            return res.status(409).render('asset_type_form', {
                user_data: [req.user], assetType, error: 'มีหมวดหมู่วัสดุชื่อนี้แล้ว',
            });
        }
        throw error;
    }
    return res.redirect('/assetTypes');
}));

app.post('/productAssetRecipes', asyncRoute(async (req, res) => {
    if (!isPosMode(req)) return res.status(409).json({ error: 'บริษัทนี้ใช้โหมดจัดการสต๊อกอย่างเดียว' });
    if (!req.user.permission.split(',').includes('products')) {
        return res.status(403).json({ error: 'คุณไม่มีสิทธิ์จัดการสินค้า' });
    }
    const productType = Number(req.body.product_type);
    const assetType = Number(req.body.asset_type);
    const amount = Number(req.body.amount);
    const productName = typeof req.body.product_name === 'string' ? req.body.product_name.trim() : '';
    const assetName = typeof req.body.asset_name === 'string' ? req.body.asset_name.trim() : '';
    if (!Number.isSafeInteger(productType) || productType < 1 ||
        !Number.isSafeInteger(assetType) || assetType < 1 ||
        !Number.isSafeInteger(amount) || amount < 1 || amount > 1000 ||
        !productName || productName.length > 200 || !assetName || assetName.length > 200) {
        return res.status(400).json({ error: 'ข้อมูลสูตรวัสดุไม่ถูกต้อง' });
    }
    const [products, assets] = await Promise.all([
        db.auth.promise().query(
            'SELECT id FROM products WHERE company_id = ? AND type = ? AND name = ? LIMIT 1',
            [req.user.company_id, productType, productName]
        ),
        db.auth.promise().query(
            'SELECT id FROM assets WHERE company_id = ? AND type = ? AND name = ? LIMIT 1',
            [req.user.company_id, assetType, assetName]
        ),
    ]);
    if (!products[0].length) return res.status(400).json({ error: 'ไม่พบสินค้าที่เลือก' });
    if (!assets[0].length) return res.status(400).json({ error: 'ไม่พบวัสดุที่เลือก' });
    await saveProductAssetRecipe({
        productType,
        productName,
        assetType,
        assetName,
        amount,
        companyId: req.user.company_id,
    });
    return res.status(201).json({ success: true });
}));

app.delete('/productAssetRecipes/:id', asyncRoute(async (req, res) => {
    if (!isPosMode(req)) return res.status(409).json({ error: 'บริษัทนี้ใช้โหมดจัดการสต๊อกอย่างเดียว' });
    if (!req.user.permission.split(',').includes('products')) {
        return res.status(403).json({ error: 'คุณไม่มีสิทธิ์จัดการสินค้า' });
    }
    if (!/^[1-9]\d*$/.test(req.params.id)) return res.status(400).json({ error: 'สูตรวัสดุไม่ถูกต้อง' });
    await deleteProductAssetRecipe(req.params.id);
    return res.sendStatus(204);
}));

app.get('/productAssetRecipes', asyncRoute(async (req, res) => {
    if (!isPosMode(req)) return res.status(409).json({ error: 'บริษัทนี้ใช้โหมดจัดการสต๊อกอย่างเดียว' });
    if (!req.user.permission.split(',').includes('products')) {
        return res.status(403).json({ error: 'คุณไม่มีสิทธิ์จัดการสินค้า' });
    }
    const type = Number(req.query.type);
    const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
    if (!Number.isSafeInteger(type) || type < 1 || !name || name.length > 200) {
        return res.status(400).json({ error: 'ข้อมูลสินค้าไม่ถูกต้อง' });
    }
    return res.json(await getProductAssetRecipes(type, name));
}));

app.post('/productInventorySettings', asyncRoute(async (req, res) => {
    if (!isPosMode(req)) return res.status(409).json({ error: 'บริษัทนี้ใช้โหมดจัดการสต๊อกอย่างเดียว' });
    if (!req.user.permission.split(',').includes('products')) {
        return res.status(403).json({ error: 'คุณไม่มีสิทธิ์จัดการสินค้า' });
    }
    const type = Number(req.body.type);
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const trackingMode = req.body.tracking_mode;
    if (!Number.isSafeInteger(type) || type < 1 || !name || name.length > 200 ||
        !['quantity', 'availability'].includes(trackingMode)) {
        return res.status(400).json({ error: 'ข้อมูลรูปแบบสต๊อกไม่ถูกต้อง' });
    }
    const [products] = await db.auth.promise().query(
        'SELECT id FROM products WHERE company_id = ? AND type = ? AND name = ? LIMIT 1',
        [req.user.company_id, type, name]
    );
    if (!products.length) return res.status(404).json({ error: 'ไม่พบสินค้า' });
    await setProductTrackingMode(type, name, trackingMode, req.user.company_id);
    return res.json({ success: true });
}));

app.post('/productAvailability', asyncRoute(async (req, res) => {
    if (!isPosMode(req)) return res.status(409).json({ error: 'บริษัทนี้ใช้โหมดจัดการสต๊อกอย่างเดียว' });
    if (!req.user.permission.split(',').includes('products')) {
        return res.status(403).json({ error: 'คุณไม่มีสิทธิ์จัดการสินค้า' });
    }
    const type = Number(req.body.type);
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!Number.isSafeInteger(type) || type < 1 || !name || name.length > 200 ||
        typeof req.body.available !== 'boolean') {
        return res.status(400).json({ error: 'ข้อมูลสถานะสินค้าไม่ถูกต้อง' });
    }
    const [products] = await db.auth.promise().query(
        'SELECT id FROM products WHERE company_id = ? AND type = ? AND name = ? LIMIT 1',
        [req.user.company_id, type, name]
    );
    if (!products.length) return res.status(404).json({ error: 'ไม่พบสินค้า' });
    await setProductAvailability(type, name, req.body.available, req.user.company_id);
    return res.json({ success: true });
}));

app.get('/quotations', asyncRoute(async (req, res) => {
    if (!isPosMode(req)) return res.redirect('/products_stock');
    if (!req.user.permission.split(',').includes('products')) {
        return res.status(403).send('คุณไม่มีสิทธิ์จัดการสินค้า');
    }
    const result = await getQuotationsPage(req.query.page);
    return res.render('quotations', {
        user_data: [req.user],
        quotations: result.quotations,
        pagination: {
            ...result.pagination,
            ajax: false,
            href: page => `/quotations?page=${page}`,
        },
        moment,
        Helper,
    });
}));

app.get('/quotations/:id', asyncRoute(async (req, res) => {
    if (!isPosMode(req)) return res.redirect('/products_stock');
    if (!req.user.permission.split(',').includes('products')) {
        return res.status(403).send('คุณไม่มีสิทธิ์จัดการสินค้า');
    }
    if (!/^[1-9]\d*$/.test(req.params.id)) return res.sendStatus(404);

    const result = await getQuotation(req.user.company_id, req.params.id);
    if (!result) return res.sendStatus(404);
    return res.render('quotation', {
        user_data: [req.user],
        quotation: result.quotation,
        items: result.items,
        assetItems: result.assetItems,
        moment,
        Helper,
    });
}));

app.post('/quotations/:id/confirm', asyncRoute(async (req, res) => {
    if (!isPosMode(req)) return res.redirect('/products_stock');
    if (!req.user.permission.split(',').includes('products')) {
        return res.status(403).send('คุณไม่มีสิทธิ์จัดการสินค้า');
    }
    if (!/^[1-9]\d*$/.test(req.params.id)) return res.sendStatus(404);

    try {
        const result = await confirmQuotation({
            companyId: req.user.company_id,
            id: req.params.id,
        });
        return res.redirect(`/billing/${result.billingId}`);
    } catch (error) {
        const quotation = await getQuotation(req.user.company_id, req.params.id);
        if (!quotation) return res.sendStatus(404);
        if (!error.statusCode) console.error('Quotation confirmation failed:', error);
        return res.status(error.statusCode || 500).render('quotation', {
            user_data: [req.user],
            quotation: quotation.quotation,
            items: quotation.items,
            assetItems: quotation.assetItems,
            moment,
            Helper,
            error: error.statusCode ? error.message : 'ยืนยันใบเสนอราคาไม่สำเร็จ กรุณาลองอีกครั้ง',
        });
    }
}));

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
            dc.amount as discount_amount,
            dc.discount_type,
            dc.minimum_purchase
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
        res.render('billing_histories', {
            user_data: user_data,
            billing_id: typeof req.query.billing_id === 'string' ? req.query.billing_id.trim() : '',
            customer_name: typeof req.query.customer_name === 'string' ? req.query.customer_name.trim().slice(0, 100) : ''
        })
    } else {
        res.cookie('alert', 'permissionDenial')
        res.redirect(req.get("Referrer"))
    }
})

app.get("/getBillingHistoriesByCustomer", asyncRoute(async (req, res) => {
    if (!isPosMode(req)) return res.status(409).json({ error: 'บริษัทนี้ใช้โหมดจัดการสต๊อกอย่างเดียว' });
    const billingId = typeof req.query.billing_id === 'string' ? req.query.billing_id.trim() : '';
    const customerName = typeof req.query.customer_name === 'string' ? req.query.customer_name.trim().slice(0, 100) : '';
    const result = await getBillingHistoriesPage({ billingId, customerName }, req.query.page);
    res.render('Components/billingHistories', {
        bills: result.bills,
        pagination: {
            ...result.pagination,
            ajax: true,
            filters: { billingId, customerName }
        },
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
                res.render("products/edit_product", {
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
            res.render('discounts/edit_discount', {
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
        const code = typeof req.body.code === 'string' ? req.body.code.trim() : ''
        const discountType = req.body.discount_type
        const amount = Number(req.body.amount)
        const minimumPurchase = Number(req.body.minimum_purchase)
        const maxUses = req.body.max_uses === '' || req.body.max_uses === undefined
            ? null
            : Number(req.body.max_uses)
        if (!code || !['percentage', 'fixed'].includes(discountType) ||
            !Number.isSafeInteger(amount) || amount < 1 ||
            (discountType === 'percentage' && amount > 100) ||
            !Number.isSafeInteger(minimumPurchase) || minimumPurchase < 0 ||
            (maxUses !== null && (!Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 4294967295))) {
            return res.status(400).send('ข้อมูลส่วนลดไม่ถูกต้อง');
        }
        const updated_at = moment().format("YYYY-MM-DD HH:mm:ss")
        const updated_by = user_data[0].id

        db.query(`UPDATE discounts SET 
            code = ?, amount = ?, discount_type = ?, minimum_purchase = ?, max_uses = ?, updated_at = ?, updated_by = ? WHERE id = ?`,
            [code, amount, discountType, minimumPurchase, maxUses, updated_at, updated_by, id], (err) => {
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
        res.render("discounts/add_discount", {
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
        const code = typeof req.body.code === 'string' ? req.body.code.trim() : ''
        const discountType = req.body.discount_type
        const amount = Number(req.body.amount)
        const minimumPurchase = Number(req.body.minimum_purchase)
        const maxUses = req.body.max_uses === '' || req.body.max_uses === undefined
            ? null
            : Number(req.body.max_uses)
        if (!code || !['percentage', 'fixed'].includes(discountType) ||
            !Number.isSafeInteger(amount) || amount < 1 ||
            (discountType === 'percentage' && amount > 100) ||
            !Number.isSafeInteger(minimumPurchase) || minimumPurchase < 0 ||
            (maxUses !== null && (!Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 4294967295))) {
            return res.status(400).send('ข้อมูลส่วนลดไม่ถูกต้อง');
        }
        const created_at = moment().format("YYYY-MM-DD HH:mm:ss")
        const created_by = user_data[0].id

        db.query("INSERT INTO discounts(code,amount,discount_type,minimum_purchase,max_uses,created_at,created_by) VALUES(?,?,?,?,?,?,?)",
            [code, amount, discountType, minimumPurchase, maxUses, created_at, created_by], (err) => {
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
            res.render('product_types/edit_product_type', {
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
            res.render('user_types/edit_user_type', {
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
        const allowedPermissions = ['customers', 'products', 'bills', 'users'];
        const requestedPermissions = Array.isArray(req.body.permission)
            ? req.body.permission
            : [req.body.permission];

        if (
            requestedPermissions.length === 0 ||
            requestedPermissions.some(permission => !allowedPermissions.includes(permission))
        ) {
            return res.status(400).send('สิทธิ์ผู้ใช้ไม่ถูกต้อง');
        }

        const permission = allowedPermissions
            .filter(permission => requestedPermissions.includes(permission))
            .join(',');

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

app.get('/systemSettings', (req, res) => {
    const user = req.user;
    if (!user.permission.split(',').includes('users')) {
        res.cookie('alert', 'permissionDenial');
        return res.redirect('/settings');
    }

    res.render('system_settings', {
        user_data: [user]
    });
})

app.post('/settings/stock-mode', (req, res, next) => {
    const user = req.user;
    if (!user.permission.split(',').includes('users')) {
        res.cookie('alert', 'permissionDenial');
        return res.redirect('/systemSettings');
    }

    const stock_mode = req.body.stock_mode;
    if (!['pos', 'inventory_only'].includes(stock_mode)) {
        return res.status(400).send('โหมดการจัดการสต๊อกไม่ถูกต้อง');
    }

    db.auth.query('UPDATE companies SET stock_mode = ? WHERE id = ?', [stock_mode, req.company_id], err => {
        if (err) return next(err);
        res.redirect('/systemSettings');
    });
})

app.post('/settings/receipt-size', (req, res, next) => {
    const user = req.user;
    if (!user.permission.split(',').includes('users')) {
        res.cookie('alert', 'permissionDenial');
        return res.redirect('/systemSettings');
    }

    const receipt_size = req.body.receipt_size;
    if (!['a5_landscape', '80x80'].includes(receipt_size)) {
        return res.status(400).send('ขนาดใบเสร็จไม่ถูกต้อง');
    }

    db.auth.query('UPDATE companies SET receipt_size = ? WHERE id = ?', [receipt_size, req.company_id], err => {
        if (err) return next(err);
        res.redirect('/systemSettings');
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
