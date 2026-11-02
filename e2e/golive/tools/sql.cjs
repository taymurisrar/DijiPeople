const fs=require('fs');const {Client}=require('pg');
const env=Object.fromEntries(fs.readFileSync(require('path').join(__dirname,'..','..','..','.env.qa.local'),'utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
if(!/_test$/.test(env.QA_DATABASE_URL)) throw new Error('not test db');
(async()=>{const c=new Client({connectionString:env.QA_DATABASE_URL});await c.connect();
for(const q of process.argv.slice(2)){const r=await c.query(q);console.log(JSON.stringify(r.rows.length?r.rows:{rowCount:r.rowCount}));}
await c.end();})().catch(e=>{console.error(e.message);process.exit(1)});
