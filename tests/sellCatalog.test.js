const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const ejs = require('ejs');

const viewsPath = path.resolve(__dirname, '../views');

test('sell catalog renders stock-aware product cards', async () => {
    const html = await ejs.renderFile(path.join(viewsPath, 'Components/sellProductCatalog.ejs'), {
        products_stock: [{
            name: 'ชาเขียว',
            type_id: 4,
            price: 35,
            available_count: 8,
        }],
    });

    assert.match(html, /class="sell-product-card"/);
    assert.match(html, /data-type="4"/);
    assert.match(html, /data-name="ชาเขียว"/);
    assert.match(html, /data-price="35"/);
    assert.match(html, /data-available="8"/);
    assert.match(html, /เพิ่มลงรถเข็น/);
});

test('sell catalog communicates when a category has no available products', async () => {
    const html = await ejs.renderFile(path.join(viewsPath, 'Components/sellProductCatalog.ejs'), {
        products_stock: [],
    });

    assert.match(html, /ไม่พบสินค้าคงเหลือในหมวดนี้/);
});

test('products stock page renders the split cart modal with valid inline scripts', async () => {
    const html = await ejs.renderFile(path.join(viewsPath, 'products_stock.ejs'), {
        user_data: [{
            username: 'tester',
            type: 'admin',
            color: '#262626',
            permission: 'products,bills,customers',
            stock_mode: 'pos',
            company_name: 'Test',
        }],
        product_types: [{ id: 4, name: 'เครื่องดื่ม' }],
        customers: [],
        stock_mode: 'pos',
        type: 'all',
        option: 'list',
    });

    assert.match(html, /sell-catalog-panel/);
    assert.match(html, /sell-cart-panel/);
    assert.match(html, /id="cart_table_wrap"/);
    assert.match(html, /ยืนยันการขาย/);
    assert.ok(html.indexOf('id="sell_modal"') < html.indexOf("getElementById('sell_modal').addEventListener"));
    assert.match(html, /new Intl\.NumberFormat\('en-US'\)/);

    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
    for (const [, script] of scripts) {
        if (script.trim()) new vm.Script(script);
    }
});
