const fs = require('node:fs');
const path = require('node:path');
const quote = name => '`' + name.replace(/`/g, '``') + '`';
// DDL is not transactional in MySQL. A named lock serializes concurrent app starts.
module.exports = async function syncSchema(pool) {
 const conn = await pool.promise().getConnection();
 let locked=false;
 try {
 const [[lock]] = await conn.query("SELECT GET_LOCK(CONCAT(DATABASE(), ':schema_sync'), 60) AS acquired");
 if (!lock.acquired) throw new Error('Cannot acquire schema synchronization lock');
 locked=true;
 const sql=fs.readFileSync(path.join(__dirname,'pos.sql'),'utf8').replace(/^--.*$/gm,'');
 const statements=sql.split(';').map(s=>s.trim()).filter(Boolean);
 for(const statement of statements) {
 const name=statement.match(/CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?/i)?.[1];
 if(!name) throw new Error('Schema supports CREATE TABLE statements only');
 await conn.query(statement);
 const expected='_expected_'+name;
 await conn.query(`DROP TEMPORARY TABLE IF EXISTS ${quote(expected)}`);
 await conn.query(statement.replace(/CREATE TABLE IF NOT EXISTS\s+`?\w+`?/i,`CREATE TEMPORARY TABLE ${quote(expected)}`));
 const [wanted]=await conn.query(`SHOW FULL COLUMNS FROM ${quote(expected)}`);
 const [actual]=await conn.query(`SHOW FULL COLUMNS FROM ${quote(name)}`);
 const definitions=statement.slice(statement.indexOf('(')+1,statement.lastIndexOf(')')).split(/,\s*\n/);
 for(const column of wanted) {
 const existing=actual.find(c=>c.Field===column.Field);
 const definition=definitions.find(d=>d.trim().match(/^`?(\w+)`?/)?.[1]===column.Field)?.trim();
 if(!definition) throw new Error(`Missing definition: ${name}.${column.Field}`);
 const keys=['Type','Null','Default','Extra','Collation'];
 if(!existing || keys.some(k=>String(existing[k]).toLowerCase()!==String(column[k]).toLowerCase())) {
 console.log(`[schema] ${existing?'modify':'add'} ${name}.${column.Field}`);
 await conn.query(`ALTER TABLE ${quote(name)} ${existing?'MODIFY':'ADD'} COLUMN ${definition}`);
 }
 }
 const [wantedIndexes]=await conn.query(`SHOW INDEX FROM ${quote(expected)}`);
 const [actualIndexes]=await conn.query(`SHOW INDEX FROM ${quote(name)}`);
 for(const key of [...new Set(wantedIndexes.map(i=>i.Key_name))]) {
 const desired=wantedIndexes.filter(i=>i.Key_name===key).sort((a,b)=>a.Seq_in_index-b.Seq_in_index);
 const existing=actualIndexes.filter(i=>i.Key_name===key).sort((a,b)=>a.Seq_in_index-b.Seq_in_index);
 if(JSON.stringify(desired.map(i=>[i.Column_name,i.Non_unique]))===JSON.stringify(existing.map(i=>[i.Column_name,i.Non_unique]))) continue;
 const drop=existing.length ? `DROP ${key==='PRIMARY'?'PRIMARY KEY':'INDEX '+quote(key)}, ` : '';
 await conn.query(`ALTER TABLE ${quote(name)} ${drop}ADD ${key==='PRIMARY'?'PRIMARY KEY':(desired[0].Non_unique?'INDEX ':'UNIQUE INDEX ')+quote(key)} (${desired.map(i=>quote(i.Column_name)).join(',')})`);
 }
 await conn.query(`DROP TEMPORARY TABLE ${quote(expected)}`);
 if(name==='discounts') await conn.query("UPDATE discounts SET usage_count = 1 WHERE status = 1 AND usage_count = 0 AND max_uses = 1");
 if(name==='companies') await conn.query("INSERT INTO companies(id,name,code) VALUES(1,'บริษัทเดิม','default') ON DUPLICATE KEY UPDATE id=id");
 }
 console.log('[schema] Database structure synchronized');
 } finally {
 if(locked) await conn.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':schema_sync'))");
 conn.release();
 }
};
