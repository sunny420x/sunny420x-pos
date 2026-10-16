const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const ejs = require('ejs');
const moment = require('moment');

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
    assert.match(html, /toast: true/);
    assert.match(html, /เพิ่ม \$\{product_name\} ลงตะกร้าแล้ว/);
    assert.equal((html.match(/showCartToast\('info', 'สินค้าในสต๊อกมีไม่เพียงพอ'\)/g) || []).length, 3);

    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
    for (const [, script] of scripts) {
        if (script.trim()) new vm.Script(script);
    }
});

test('A5 receipt renders the redesigned landscape layout and correct discounted total', async () => {
    const html = await ejs.renderFile(path.join(viewsPath, 'billing.ejs'), {
        user_data: [{ company_name: 'ร้านทดสอบ' }],
        bill: [{
            name: 'ชาสมุนไพร',
            price: 100,
            total_price: 300,
            amount: 3,
            first_name: 'ลูกค้า',
            last_name: 'ทดสอบ',
            phone_number: '0812345678',
            created_at: '2026-10-16 12:30:00',
            discount_amount: 10,
        }],
        billing_id: 123,
        moment,
        Helper: class {
            numberWithCommas(value) {
                return Number(value).toLocaleString('en-US');
            }
            ThaiPhoneNumber(value) {
                return value;
            }
        },
        receipt_size: 'a5_landscape',
    });

    assert.match(html, /size: A5 landscape/);
    assert.match(html, /class="a5-receipt-sheet" id="billing_content"/);
    assert.match(html, /ราคาต่อหน่วย/);
    assert.match(html, /ส่วนลด \(10%\)/);
    assert.match(html, /270 บาท/);
    assert.doesNotMatch(html, /style="width: 1200px"/);
    assert.doesNotMatch(html, /ที่อยู่/);
});

test('thermal receipt continues rendering with its existing layout', async () => {
    const html = await ejs.renderFile(path.join(viewsPath, 'billing.ejs'), {
        user_data: [{ company_name: 'ร้านทดสอบ' }],
        bill: [{
            name: 'ชาสมุนไพร',
            price: 100,
            total_price: 100,
            amount: 1,
            first_name: null,
            last_name: null,
            phone_number: null,
            created_at: '2026-10-16 12:30:00',
            discount_amount: null,
        }],
        billing_id: 124,
        moment,
        Helper: class {
            numberWithCommas(value) {
                return Number(value).toLocaleString('en-US');
            }
            ThaiPhoneNumber(value) {
                return value;
            }
        },
        receipt_size: '80x80',
    });

    assert.match(html, /class="receipt-thermal" id="billing_content"/);
    assert.match(html, /size: 80mm 80mm/);
    assert.match(html, /ส่งออก PDF 80 × 80 มม/);
});
