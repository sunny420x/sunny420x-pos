const express = require('express')
const path = require('path')
const { 
    getSellProductsByType, 
    getProductTypes, 
    getSellProductsByName,
    getProductsStockByTypeAndName,
} = require('./model/product')
const app = express.Router();
app.use(express.static(path.join(__dirname, "/public/frontend")))

app.get('/', (req,res) => {
    const product_type = req.query.type || "all"
    getSellProductsByType(product_type).then((products) => {
        getProductTypes().then((product_types) => {
            res.render('frontend/views/home', {
                products:products,
                product_types:product_types
            })
        })
    })
})

app.get('/products', (req,res) => {
    const product_type = req.query.filter || "all"
    getSellProductsByType(product_type).then((products) => {
        getProductTypes().then((types) => {
            let product_type_name = "สินค้าทั้งหมด";
            if(product_type != "all") {
                product_type_name = types.find(type => type.id == product_type).name
            }
            res.render('frontend/views/products', {
                products:products,
                product_type: product_type_name,
                product_types:types
            })
        })
    })
})

app.get('/product/:name', (req,res) => {
    const name = req.params.name.replace("percent", "%")
    getSellProductsByName(name).then((product) => {
        getProductTypes().then((product_types) => {
            res.render('frontend/views/product', {
                product:product,
                product_types:product_types
            })
        })
    })
})

module.exports = app