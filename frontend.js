const express = require('express')
const path = require('path')
const { 
    getSellProductsByType, 
    getProductTypes, 
    getSellProductsByName,
    getProductsStockByTypeAndName,
} = require('./model/product')
const app = express.Router();
const cookieParser = require('cookie-parser');

app.use(express.static(path.join(__dirname, "/public/frontend")))
app.use(cookieParser());

function getCartProductInfo(cart) {
    return new Promise(resolve => {
        resolve(cart);
    })
}

app.get('/', async(req,res) => {
    const product_type = req.query.type || "all"
    const product_types = await getProductTypes()
    getSellProductsByType(product_type).then((products) => {
        res.render('frontend/views/home', {
            products:products,
            product_types:product_types
        })
    })
})

app.get('/products', async(req,res) => {
    const product_type = req.query.filter || "all"
    const product_types = await getProductTypes()
    getSellProductsByType(product_type).then((products) => {
        let product_type_name = "สินค้าทั้งหมด";
        if(product_type != "all") {
            product_type_name = types.find(type => type.id == product_type).name
        }
        res.render('frontend/views/products', {
            products:products,
            product_type: product_type_name,
            product_types:product_types
        })
    })
})

app.get('/product/:name', async(req,res) => {
    const name = req.params.name.replace("percent", "%")
    const product_types = await getProductTypes()
    getSellProductsByName(name).then((product) => {
        res.render('frontend/views/product', {
            product:product,
            product_types:product_types
        })
    })
})

app.get('/cart', async(req,res) => {
    const product_types = await getProductTypes()
    const cart = req.cookies.cart; 
    const processed_cart = await getCartProductInfo(cart)

    res.render('frontend/views/cart', {
        cart:processed_cart ?? [],
        product_types: product_types
    })
})

module.exports = app