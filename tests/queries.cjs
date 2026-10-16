const fs=require('fs');const {scopeSql}=require('../middleware/tenant');
for(const file of ['app.js',...fs.readdirSync('model').map(f=>'model/'+f)]) {
 const source=fs.readFileSync(file,'utf8');
 for(const match of source.matchAll(/db\.query\(\s*([`"'])([\s\S]*?)\1/g)) {
 try { scopeSql(match[2],2); } catch(e) { console.error(file,match[2],e.message);process.exitCode=1; }
 }
}
