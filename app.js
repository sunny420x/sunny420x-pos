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
    getBillingHistoriesByCustomer, 
    getProductTypes, 
    getProductsStockByType,
    getProductsStockByTypeAndName,
    deleteProductsByTransaction,
} = require('./model/product')

const { 
    searchCustomerByFullName, 
    getCustomers, 
    searchCustomerByCardId, 
    searchCustomerByPhoneNumber 
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
} = require('./model/chart')

const db = require('./database')
const app = express()

var app_verified = false;

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
        for(let i = 0; i < str.length; i++) {
            if(i == 3) {
                result.push("-")
            }
            if(i == 6) {
                result.push("-")
            }
            result.push(str[i])
        }
        return result.join("")
    }
}

function Pagination(page) {
    page = parseInt(page)
    const per_page = 10;
    const limit_start = (page - 1) * per_page;
    const limit_end = per_page;

    return {limit_start, limit_end}
}

function initAccessToken(token) {
    return new Promise((resolve) => {
        token = Buffer.from(token, 'base64').toString('utf-8')

        const username = token.split(':')[0]
        const password = token.split(':')[1]

        db.query(`SELECT u.id, u.username, u.full_name, ut.name as type, u.type as type_id, ut.permission, u.color FROM users as u JOIN user_types as ut ON ut.id = u.type 
             WHERE u.username = ? AND u.password = ?`, [username,password], (err,result) => {
            if(err) throw err;
            if(result.length == 1) {
                resolve(result)
            }
        })
    })
}

//Controller
app.get("/searchCustomerByCardId", (req, res) => {
    if (req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if (user_data.length == 1) {
                let query = req.query.q !== undefined ? decodeURIComponent(req.query.q) : 'all';
                searchCustomerByCardId(query).then(customers => {
                    res.render('backoffice/Components/customers', {
                        customers: customers,
                        moment: moment,
                        user_data: user_data[0]
                    })
                })
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/searchCustomerByFullName", (req, res) => {
    if (req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if (user_data.length == 1) {
                let query = req.query.q !== undefined ? decodeURIComponent(req.query.q) : 'all';
                searchCustomerByFullName(query).then(customers => {
                    res.render('backoffice/Components/customers', {
                        customers: customers,
                        moment: moment,
                        user_data: user_data[0]
                    })
                })
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/searchCustomerByPhoneNumber", (req, res) => {
    if (req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if (user_data.length == 1) {
                let query = req.query.q !== undefined ? decodeURIComponent(req.query.q) : 'all';
                searchCustomerByPhoneNumber(query).then(customers => {
                    res.render('backoffice/Components/customers', {
                        customers: customers,
                        moment: moment,
                        user_data: user_data[0]
                    })
                })
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

function getUserTypes() {
    return new Promise((resolve) => {
        db.query(`SELECT * FROM user_types ORDER BY id ASC`, (err, result) => {
            if(err) throw err;
            resolve(result)
        })
    })
}

app.get("/admin", (req,res) => {
    if(!app_verified) {
        checkCurrentURL(req)
    }
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then(async (user_data) => {
            if(user_data.length == 1) {
                const expired_products = await getExpiredProducts()
                const productSellingChart = await getProductSellingChart()
                const total_customers = await getTotalCustomers()
                const bestseller = await getBestSeller()
                const profits = await getProfits()

                res.render("backoffice/home", {
                    user_data:user_data,
                    total_customers: total_customers[0],
                    productSellingChart:productSellingChart,
                    expired_products:expired_products,
                    moment:moment,
                    Helper:Helper,
                    bestseller:bestseller,
                    profits:profits
                })
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/admin/customers", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('customers')) {
                    res.render('backoffice/customers', {
                        user_data:user_data,
                        Helper:Helper
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/admin/customers/:id", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('customers')) {
                    const id = req.params.id
                    db.query("SELECT * FROM customers WHERE id = ?", [id], (err, customer) => {
                        if(err) throw err;
                        res.render('backoffice/edit_customer', {
                            user_data:user_data,
                            customer:customer[0]
                        })
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.post("/customers", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('customers')) {
                    const id = req.body.id
                    const first_name = req.body.first_name
                    const last_name = req.body.last_name
                    const card_id = req.body.card_id
                    const phone_number = req.body.phone_number

                    const home_id = req.body.home_id
                    const moo = req.body.moo
                    const village = req.body.village
                    const soi = req.body.soi
                    const street = req.body.street
                    const sub_district = req.body.sub_district
                    const district = req.body.district
                    const state = req.body.state
                    const zip = req.body.zip

                    const updated_at = moment().format("YYYY-MM-DD HH:mm:ss")
                
                    db.query(`UPDATE customers SET 
                        first_name = ?, last_name = ?, card_id = ?, 
                        home_id = ?, moo = ?, village = ?, soi = ?, 
                        street = ?, sub_district = ?, district = ?, 
                        state = ?, zip = ?, phone_number = ?, updated_at = ? WHERE id = ?`, 
                        [first_name, last_name, card_id, home_id, moo, village, soi, street, sub_district, district, state, zip, phone_number, updated_at, id], (err) => {
                        if(err) {
                            throw err;
                        } else {
                            res.cookie('alert', 'success')
                            res.redirect('/admin/customers/'+id)
                        }
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/admin/addCustomer", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('customers')) {
                    res.render("backoffice/add_customer", {
                        user_data:user_data
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.post("/addCustomer", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('customers')) {
                    const first_name = req.body.first_name
                    const last_name = req.body.last_name
                    const card_id = req.body.card_id

                    const home_id = req.body.home_id
                    const moo = req.body.moo
                    const village = req.body.village
                    const soi = req.body.soi
                    const street = req.body.street
                    const sub_district = req.body.sub_district
                    const district = req.body.district
                    const state = req.body.state
                    const zip = req.body.zip

                    const phone_number = req.body.phone_number
                    const created_at = moment().format("YYYY-MM-DD HH:mm:ss")
                
                    db.query("INSERT INTO customers(first_name, last_name, card_id, home_id, moo, village, soi, street, sub_district, district, state, zip, phone_number, created_at) VALUES(?,?,?,?,?,?)", 
                        [first_name, last_name, card_id, home_id, moo, village, soi, street, sub_district, district, state, zip, phone_number, created_at], (err) => {
                        if(err) {
                            throw err;
                        } else {
                            res.cookie('alert', 'addSuccess')
                            res.redirect('/admin/addCustomer')
                        }
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/admin/deleteCustomer/:id", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('customers')) {
                    const id = req.params.id

                    db.query("DELETE FROM customers WHERE id = ?", [id], (err) => {
                        if(err) throw err;
                        res.cookie('alert', 'deleteSuccess')
                        res.redirect('/admin/customers')
                        res.end()
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/admin/products_stock", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('products')) {
                    let option = req.query.option ?? "list"
                    let type = req.query.type ?? "all"
                    getProductTypes().then(product_types => {
                        getCustomers().then(customers => {
                            res.render('backoffice/products_stock', {
                                user_data:user_data,
                                product_types:product_types,
                                customers:customers,
                                Helper:Helper,
                                option:option,
                                type:type,
                            })
                            res.end()
                        })
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/getSellProducts", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                let type = req.query.type
                getSellProductsByType(type).then((products_stock) => {
                    res.render('backoffice/Components/sellProductSelectBox', {
                        products_stock:products_stock
                    })
                    res.end()
                })
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/getProductsHistoriesByType", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                let type = req.query.type
                getProductsHistoriesByType(type).then((products_stock) => {
                    res.render('backoffice/Components/ProductsHistoriesByType', {
                        products_stock:products_stock
                    })
                    res.end()
                })
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/getProductStock", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                let type = req.query.type !== undefined ? decodeURIComponent(req.query.type) : 'all';
                let option = req.query.option !== undefined ? decodeURIComponent(req.query.option) : 'list';
                getProductsStockByType(type).then((products_stock) => {
                    if(option == "catalog") {
                        res.render('backoffice/Components/productStockCatalogView', {
                            products_stock:products_stock,
                            moment:moment,
                            type:type,
                        })
                        res.end()
                        return
                    }
                    res.render('backoffice/Components/productStockListView', {
                        products_stock:products_stock,
                        moment:moment,
                        type:type,
                    })
                    res.end()
                })
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/admin/products_stock/:type/:name", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('products')) {
                    const name = req.params.name
                    const _type = req.params.type
                    const option = req.query.option ?? "list"
                    const type = req.query.type ?? "all"
                    getProductTypes().then(product_types => {
                        getProductsStockByTypeAndName(_type, name).then((products_stock) => {
                            res.render('backoffice/products_stock_detail', {
                                user_data:user_data,
                                products_stock:products_stock,
                                product_types:product_types,
                                moment:moment,
                                option:option,
                                type:type
                            })
                            res.end()
                        })
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

function addProductStock(name, type, price, expired_date, created_at, amount) {
    return new Promise((resolve, reject) => {
        db.query(
            "INSERT INTO transaction(name, type, value, expired_date, created_at) VALUES(?,?,?,?,?)",
            [name, type, amount, expired_date, created_at],
            (err) => {
                if (err) return reject(err);

                db.query(`SELECT LAST_INSERT_ID() AS id`, (err, result) => {
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

app.post("/addProductStock", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('products')) {
                    const name = req.body.name
                    const type = req.body.type
                    const amount = req.body.amount
                    const price = req.body.price
                    const import_price = req.body.import_price
                    const expired_date = req.body.expired_date || null
                    const created_at = moment().format("YYYY-MM-DD HH:mm:ss")
    
                    addProductStock(name,type,price,import_price,expired_date,created_at,amount).then((result) => {
                        if(result == true) {
                            res.status(200).json({ success: true, message: 'Insert products successful!' });
                        } else {
                            res.status(500).json({ error: result.code });
                        }
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.post('/sellProduct', (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('products')) {
                    const cart = req.body.cart
                    const customer = req.body.customer === "-" ? null : req.body.customer;
                    const discount_code = req.body.discount_code || null
                    const created_at = moment().format("YYYY-MM-DD HH:mm:ss")

                    if(discount_code != null) {
                        checkDiscount(discount_code).then(discount_result => {
                            if(discount_result == null) {
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
                    
                                    // Insert transaction
                                    await new Promise((resolve, reject) => {
                                        db.query(
                                            "INSERT INTO transaction(type, name, value, stock_id, customer_id, billing_id, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)",
                                            [product_type, product_name, -1, product_id, customer, billing_id, created_at],
                                            (err) => (err ? reject(err) : resolve())
                                        );
                                    });
                                }
                            }
                            if(discount_code != null) {
                                db.query("UPDATE discounts SET billing_id = ? WHERE code = ?", [billing_id, discount_code], (err) => {
                                    if(err) res.sendStatus(500).json({error: err.message})
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
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get('/admin/deleteProductByTransction/:id', (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('products')) {
                    const transaction_id = req.params.id
                    deleteProductsByTransaction(transaction_id).then(() => {
                        res.redirect('/admin/products_stock')
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get('/billing/:id', (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('bills')) {
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
                        if(err) throw err;
                        res.render('backoffice/billing', {
                            user_data:user_data,
                            bill:bill,
                            moment:moment,
                            Helper: Helper
                        })
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/admin/billingHistories", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('bills')) {
                    let customer_id = req.query.customer_id !== undefined ? req.query.customer_id : 'all';
                    getCustomers().then(owners => {
                        res.render('backoffice/billing_histories', {
                            user_data:user_data,
                            owners:owners,
                            customer_id:customer_id
                        })
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/getBillingHistoriesByCustomer", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                let customer_id = req.query.customer_id !== undefined ? decodeURIComponent(req.query.customer_id) : 'all';
                getBillingHistoriesByCustomer(customer_id).then(bills => {
                    res.render('backoffice/Components/billingHistories', {
                        bills:bills,
                        moment:moment
                    })
                })
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/admin/deleteBill/:id", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('bills')) {
                    const id = req.params.id

                    db.query("UPDATE products SET is_sold = 0 WHERE id IN (SELECT stock_id FROM transaction WHERE billing_id = ?)", [id], (err) => {
                        if(err) throw err;
                        db.query("DELETE FROM transaction WHERE billing_id = ?", [id], (err) => {
                            if(err) throw err;
                            res.cookie('alert', 'deleteSuccess')
                            res.redirect('/admin/billingHistories')
                            res.end()
                        })
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/admin/editProduct/:transaction", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('products')) {
                    const transaction = req.params.transaction
                    const type = req.query.type ?? "all"
                    const option = req.query.option ?? "list"
                    db.query(`SELECT pd.name, pd.type, t.expired_date, pd.price, pd.transaction_id, t.created_at, pd.updated_at, pd.import_price 
                        FROM products as pd JOIN transaction as t ON t.id = pd.transaction_id 
                        WHERE pd.transaction_id = ? GROUP BY name, type`, [transaction], (err, stock) => {
                        if(err) throw err;
                        getProductTypes().then((product_types) => {
                            res.render("backoffice/edit_product", {
                                user_data:user_data,
                                stock:stock[0],
                                product_types:product_types,
                                moment:moment,
                                type:type,
                                option:option,
                            })
                            res.end()
                        })
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.post("/editProduct", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('products')) {
                    const type = req.body.type
                    const name = req.body.name
                    const price = req.body.price
                    const import_price = req.body.import_price
                    const expired_date = req.body.expired_date || null
                    const transaction_id = req.body.transaction_id
                    const updated_at = moment().format("YYYY-MM-DD HH:mm:ss")

                    const _type = req.query.type ?? "catalog"
                    const option = req.query.option ?? "list"
    
                    db.query("UPDATE products SET type = ?, name = ?, price = ?, import_price = ?, updated_at = ? WHERE transaction_id = ?", [type, name, price, import_price, updated_at, transaction_id], (err) => {
                        if(err) throw err;
                        db.query("UPDATE transaction SET type = ?, name = ?, expired_date = ? WHERE id = ?", [type, name, expired_date, transaction_id], (err) => {
                            if(err) throw err;
                            res.cookie('alert', 'success')
                            res.redirect(`/editProduct/${transaction_id}?type=${_type}&option=${option}`)
                        })
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

//Discounts
app.get("/admin/discounts", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('products')) {

                    let page = req.query.page || 1
                    if(page < 1) { page = 1 } 

                    getAllDiscounts(page).then(discounts => {
                        res.render('backoffice/discounts', {
                            user_data:user_data,
                            discounts:discounts,
                            page:page,
                            Helper:Helper
                        })
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/admin/discounts/:id", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('products')) {
                    const id = req.params.id
                    db.query("SELECT * FROM discounts WHERE id = ?", [id], (err, discount) => {
                        if(err) throw err;
                        res.render('backoffice/edit_discount', {
                            user_data:user_data,
                            discount:discount[0]
                        })
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.post("/discounts", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('products')) {
                    const id = req.body.id
                    const code = req.body.code
                    const amount = req.body.amount
                    const updated_at = moment().format("YYYY-MM-DD HH:mm:ss")
                    const updated_by = user_data[0].id
                
                    db.query(`UPDATE discounts SET 
                        code = ?, amount = ?, updated_at = ?, updated_by = ? WHERE id = ?`, 
                        [code, amount, updated_at, updated_by, id], (err) => {
                        if(err) {
                            throw err;
                        } else {
                            res.cookie('alert', 'success')
                            res.redirect('/admin/discounts/'+id)
                        }
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/admin/addDiscount", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('products')) {
                    res.render("backoffice/add_discount", {
                        user_data:user_data
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.post("/addDiscount", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('products')) {
                    const code = req.body.code
                    const amount = req.body.amount
                    const created_at = moment().format("YYYY-MM-DD HH:mm:ss")
                    const created_by = user_data[0].id
                
                    db.query("INSERT INTO discounts(code,amount,created_at,created_by) VALUES(?,?,?,?)", 
                        [code, amount, created_at, created_by], (err) => {
                        if(err) {
                            throw err;
                        } else {
                            res.cookie('alert', 'addSuccess')
                            res.redirect('/admin/discounts')
                        }
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/admin/deleteDiscount/:id", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('products')) {
                    const id = req.params.id

                    db.query("DELETE FROM discounts WHERE id = ?", [id], (err) => {
                        if(err) throw err;
                        res.cookie('alert', 'deleteSuccess')
                        res.redirect('/admin/discounts')
                        res.end()
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/admin/product_types", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('products')) {
                    getProductTypes().then(product_types => {
                        res.render('backoffice/product_types', {
                            user_data:user_data,
                            product_types:product_types
                        })
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.post("/addProductType", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('products')) {
                    const name = req.body.name

                    db.query("INSERT INTO product_types(name) VALUES(?)", [name], (err) => {
                        if(err) res.status(500).json({ error: err.code });
                        res.status(200).json({ success: true, message: 'Insert product type successful!' });
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/admin/deleteProductType/:id", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('products')) {
                    const id = req.params.id

                    db.query("DELETE FROM product_types WHERE id = ?", [id], (err) => {
                        if(err) throw err;
                        res.cookie('alert', 'deleteSuccess')
                        res.redirect('/admin/product_types')
                        res.end()
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/admin/editProductType/:id", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('products')) {
                    db.query("SELECT * FROM product_types WHERE id = ?", [req.params.id], (err,result) => {
                        if(err) throw err;
                        res.render('backoffice/edit_product_type', {
                            user_data:user_data,
                            row:result[0]
                        })
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.post("/editProductType", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('products')) {
                    const id = req.body.id
                    const name = req.body.name
    
                    db.query("UPDATE product_types SET name = ? WHERE id = ?", [name, id], (err) => {
                        if(err) throw err;
                        res.cookie('alert', 'success')
                        res.redirect('/admin/editProductType/'+id)
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

//UserTypes
app.get("/admin/user_types", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('users')) {
                    getUserTypes().then(user_types => {
                        res.render('backoffice/user_types', {
                            user_data:user_data,
                            user_types:user_types
                        })
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.post("/addUserType", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('users')) {
                    const name = req.body.name
                    const permission = req.body.permission
    
                    db.query("INSERT INTO user_types(name,permission) VALUES(?,?)", [name,permission], (err) => {
                        if(err) res.status(500).json({ error: err.code });
                        res.status(200).json({ success: true, message: 'Insert user type successful!' });
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/admin/deleteUserType/:id", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('users')) {
                    const id = req.params.id

                    db.query("DELETE FROM user_types WHERE id = ?", [id], (err) => {
                        if(err) throw err;
                        res.cookie('alert', 'deleteSuccess')
                        res.redirect('/admin/user_types')
                        res.end()
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/admin/editUserType/:id", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('users')) {
                    db.query("SELECT * FROM user_types WHERE id = ?", [req.params.id], (err,result) => {
                        if(err) throw err;
                        res.render('backoffice/edit_user_type', {
                            user_data:user_data,
                            row:result[0]
                        })
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.post("/editUserType", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].permission.split(',').includes('users')) {
                    const id = req.body.id
                    const name = req.body.name
                    const permission = req.body.permission
    
                    db.query("UPDATE user_types SET name = ?, permission = ? WHERE id = ?", [name, permission, id], (err) => {
                        if(err) throw err;
                        res.cookie('alert', 'success')
                        res.redirect('/admin/editUserType/'+id)
                    })
                } else {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect(req.get("Referrer"))
                }
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get('/admin/login', (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.render('backoffice/login')
        res.end()
    } else {
        res.redirect('/admin/admin')
        res.end()
    }
})

function loggingIpAddress(user_id, ip_address) {
    return new Promise((resolve) => {
        const logged_in_at = moment().format("YYYY-MM-DD HH:mm:ss")
        db.query("INSERT INTO login_history(user_id, time, ip_address) VALUES(?,?,?)", [user_id, logged_in_at, ip_address], (err) => {
            if(err) throw err;
            db.query("SELECT COUNT(*) as count FROM login_history", (err, login_his) => {
                if(err) throw err;
                const count = login_his[0].count
                if(count > 50) {
                    db.query("DELETE FROM login_history ORDER BY id ASC LIMIT 1", (err) => {
                        if(err) throw err;
                        resolve()
                    })
                } else {
                    resolve()
                }
            })
        })
    })
}

app.post('/login', (req, res) => {
    if(req.cookies.access_token == undefined) {

    const username = req.body.username
    const password = createHash('sha256').update(req.body.password).digest('base64');

    db.query("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, result) => {
        if(err) throw err;
        if(result.length == 1) {
            res.cookie('access_token', Buffer.from(username+":"+password).toString('base64'));
            console.log(moment().format("DD/MM/YY HH:mm:ss")+" [+] "+username+" ได้เข้าสู่ระบบ!")
            loggingIpAddress(result[0].id, req.ip).then(() => {
                res.redirect('/admin/')
                res.end()
            })
        } else {
            res.cookie('alert', 'wrongPassword')
            res.redirect('/admin/login')
            res.end()
        }
    })

    } else {
        res.redirect('/admin/')
        res.end()
    }
})

app.get('/logout', (req,res) => {
    res.clearCookie('access_token')
    res.cookie('alert', 'logoutSuccess')
    res.redirect('/admin/login')
    res.end()
})

app.get('/hashPassword/:password', (req,res) => {
    const password = createHash('sha256').update(req.params.password).digest('base64');
    res.send(password)
})

app.get("/admin/settings", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                res.render('backoffice/settings', {
                    user_data:user_data
                })
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get("/admin/loginHistories", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data[0].permission.split(',').includes('users')) {
                const id = req.params.id
                db.query('SELECT u.full_name, u.username, h.time, h.ip_address FROM login_history as h JOIN users as u ON u.id = h.user_id ORDER BY h.time DESC', [id], (err, history) => {
                    if(err) throw err;
                    res.render('backoffice/login_histories', {
                        user_data:user_data,
                        moment:moment,
                        history:history
                    })
                })
            } else {
                res.cookie('alert', 'permissionDenial')
                res.redirect(req.get("Referrer"))
            }
        })
    }
})

app.get("/admin/Users", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data[0].permission.split(',').includes('users')) {
                db.query("SELECT u.id, u.username, u.full_name, ut.name as type FROM users as u JOIN user_types as ut ON ut.id = u.type ORDER BY u.type ASC", (err,users) => {
                    if(err) throw err;
                    res.render('backoffice/Users/users', {
                        user_data:user_data,
                        users:users
                    })
                })
            } else {
                res.cookie('alert', 'permissionDenial')
                res.redirect(req.get("Referrer"))
            }
        })
    }
})

app.get("/admin/editUser/:id", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data[0].permission.split(',').includes('users')) {
                getUserTypes().then(user_types => {
                    const id = req.params.id
                    db.query("SELECT id, username, full_name, type FROM users WHERE id = ?", [id], (err,user) => {
                        if(err) throw err;
                        res.render('backoffice/Users/edit_user', {
                            user_data:user_data,
                            user_types:user_types,
                            user:user[0]
                        })
                    })
                })
            } else {
                res.cookie('alert', 'permissionDenial')
                res.redirect(req.get("Referrer"))
            }
        })
    }
})

app.post("/editUser", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data[0].permission.split(',').includes('users')) {
                const id = req.body.id
                const username = req.body.username
                const type = req.body.type
                const full_name = req.body.full_name
    
                const updated_at = moment().format("YYYY-MM-DD HH:mm:ss")
    
                db.query("UPDATE users SET username = ?, full_name = ?, type = ?, updated_by = ?, updated_at = ? WHERE id = ?", [username, full_name, type, user_data[0].id, updated_at, id], (err) => {
                    if(err) throw err;
                    res.cookie('alert', 'success')
                    res.redirect('/admin/Users')
                })
            } else {
                res.cookie('alert', 'permissionDenial')
                res.redirect(req.get("Referrer"))
            }
        })
    }
})

app.get("/admin/addUser", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data[0].permission.split(',').includes('users')) {
                getUserTypes().then(user_types => {
                    res.render('backoffice/Users/add_user', {
                        user_data:user_data,
                        user_types:user_types
                    })
                })
            } else {
                res.cookie('alert', 'permissionDenial')
                res.redirect(req.get("Referrer"))
            }
        })
    }
})

app.post("/addUser", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data[0].permission.split(',').includes('users')) {
                const username = req.body.username
                const password = createHash('sha256').update(req.body.password).digest('base64');
                const type = req.body.type
                const full_name = req.body.full_name

                const created_at = moment().format("YYYY-MM-DD HH:mm:ss")

                db.query("INSERT INTO users(username,password,type,full_name,created_by,created_at) VALUES(?,?,?,?,?,?)", [username,password,type,full_name,user_data[0].id,created_at], (err) => {
                    if(err) throw err;
                    res.cookie('alert', 'addSuccess')
                    res.redirect('/admin/Users')
                })
            } else {
                res.cookie('alert', 'permissionDenial')
                res.redirect(req.get("Referrer"))
            }
        })
    }
})

app.get("/admin/deleteUser/:id", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data[0].permission.split(',').includes('users')) {
                const id = req.params.id

                db.query("DELETE FROM users WHERE id = ?", [id], (err) => {
                    if(err) throw err;
                    res.cookie('alert', 'deleteSuccess')
                    res.redirect('/admin/Users')
                })
            } else {
                res.cookie('alert', 'permissionDenial')
                res.redirect(req.get("Referrer"))
            }
        })
    }
})

app.get('/admin/editProfile', (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                res.render('backoffice/Users/edit_profile', {
                    user_data:user_data
                })
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.post('/editProfile', (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                const id = req.body.id
                const username = req.body.username
                const full_name = req.body.full_name
                const color = req.body.color

                if(user_data[0].id != id) {
                    res.cookie('alert', 'permissionDenial')
                    res.redirect('/admin/editProfile')
                }

                db.query("UPDATE users SET username = ?, full_name = ?, color = ? WHERE id = ?", [username, full_name, color, id], (err) => {
                    if(err) throw err;
                    res.cookie('alert', 'success')
                    res.redirect('/admin/editProfile')
                })
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.get('/admin/changePassword', (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                if(user_data[0].username == "demo") {
                    res.send("ไม่สามารถเปลี่ยนรหัสผ่านของผู้ใช้ทดลองได้!")
                    return;
                }
                res.render('backoffice/Users/change_password', {
                    user_data:user_data
                })
            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

app.post("/changePassword", (req,res) => {
    if(req.cookies.access_token == undefined) {
        res.redirect('/admin/login')
        res.end()
    } else {
        initAccessToken(req.cookies.access_token).then((user_data) => {
            if(user_data.length == 1) {
                const id = req.body.id
                let old_password = req.body.old_password
                let new_password = req.body.new_password
                let confirm_password = req.body.confirm_password

                if(new_password != confirm_password) {
                    res.cookie('alert', 'passwordNotMatch')
                    res.redirect(req.get("Referrer"))
                }

                old_password = createHash('sha256').update(old_password).digest('base64');
                new_password = createHash('sha256').update(new_password).digest('base64');

                db.query("SELECT * FROM users WHERE id = ? AND password = ?", [id, old_password], (err,result) => {
                    if(err) throw err;
                    if(result.length == 1) {
                        db.query("UPDATE users SET password = ? WHERE id = ?", [new_password, id], (err) => {
                            if(err) throw err;
                            res.cookie('alert', 'success')
                            res.redirect('/admin/logout')
                        })
                    } else {
                        res.cookie('alert', 'oldPasswordNotMatch')
                        res.redirect("/settings")
                    }
                })

            } else {
                res.redirect('/admin/logout')
            }
        })
    }
})

function checkCurrentURL(req) {
    var fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;

    fetch(`https://softwares.sunny420x.com/LicenseVerifier/SunnyPOS/${encodeURIComponent(fullUrl)}`)
    .then(res => {
        if (!res.ok) {
            return res.json().then(errorData => { throw new Error(errorData.error); });
        }
        return res.json();
    })
    .then(data => {
        if(data.msg == 'no') {
            console.log(`[-] ยืนยันการเป็นเจ้าของผลิตภัณฑ์ล้มเหลว สำหรับ URL: ${fullUrl} !`)
        } else {
            app_verified = true
        }
    })
    .catch(error => {
        console.error('Error:', error);
    }); 
}

app.get('/getURL', (req,res) => {
    var fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;

    res.render('backoffice/error', {
        title: 'Developer options',
        content: `Current URL: ${fullUrl}`
    })
})

const stockRouter = require('./frontend')

app.use('/', stockRouter);

app.get('*', (req, res) => {
    res.render('backoffice/error', {title: "พบข้อผิดพลาด: ไม่พบข้อมูล", content: "ลิงค์นี้อาจจะถูกย้าย หรือหมดอายุแล้ว โปรดตรวจสอบลิงค์ว่าถูกต้อง"})
    res.end()
})

app.listen(process.env.PORT ,() => {
    console.log(moment().format("DD/MM/YY HH:mm:ss")+" [+] Sunny420x POS System been started at http://localhost:"+process.env.PORT)
})