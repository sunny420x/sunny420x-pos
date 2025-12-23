const express = require('express')
const { getSellProductsByType } = require('./app')
const router = express.Router();

router.get('/', (req,res) => {
    const product_type = req.query.type || "all"
    getSellProductsByType(product_type).then((products) => {
        res.render('public_pages/stock', {
            products:products
        })
    })
})

module.exports = router