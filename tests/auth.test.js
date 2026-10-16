const test = require('node:test');
const assert = require('node:assert/strict');
const {scopeSql, context}=require('../middleware/tenant');
const {hashPassword,verifyPassword}=require('../middleware/password');
test('tenant reads scope joins and nested queries',()=>{
 const sql=scopeSql('SELECT * FROM products p LEFT JOIN (SELECT * FROM transaction WHERE id=?) t ON t.id=p.transaction_id',7);
 assert.equal((sql.match(/company_id = 7/g)||[]).length,2);
 assert.match(sql,/AS p LEFT JOIN/);
});
test('tenant writes and deletes cannot escape outer predicate',()=>{
 assert.match(scopeSql('UPDATE users SET full_name=? WHERE id=? OR username=?',7),/WHERE users.company_id = 7 AND \( id=\? OR username=\?\)/);
 assert.match(scopeSql('DELETE FROM products WHERE id IN (SELECT stock_id FROM transaction WHERE billing_id=?)',7),/DELETE FROM products WHERE products.company_id = 7/);
 assert.equal(scopeSql('INSERT INTO customers(first_name) VALUES(?)',7),'INSERT INTO customers (first_name, company_id) VALUES (?, 7)');
 assert.throws(()=>scopeSql('SELECT * FROM users',undefined));
 assert.throws(()=>scopeSql('INSERT INTO users(company_id) VALUES(?)',7));
});
test('concurrent company contexts remain separate',async()=>{
 await Promise.all([1,2].map(companyId=>context.run({companyId},async()=>{
 await new Promise(resolve=>setImmediate(resolve)); assert.equal(context.getStore().companyId,companyId);
 })));
});
test('salted passwords verify without accepting wrong password',()=>{
 const a=hashPassword('testing123'),b=hashPassword('testing123');
 assert.notEqual(a,b);assert.ok(verifyPassword('testing123',a));assert.ok(!verifyPassword('incorrect',a));
});
