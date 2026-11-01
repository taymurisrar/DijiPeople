const { chromium } = require("@playwright/test");
(async()=>{const b=await chromium.launch();const c=await b.newContext({storageState:"e2e/golive-results/.auth/A-OWNER.json",viewport:{width:1440,height:900}});const p=await c.newPage();
let n=0,by={};p.on("request",r=>{if(r.url().includes("/api/")){n++;const k=r.url().replace(/^https?:\/\/[^/]+/,"").replace(/[0-9a-f-]{36}/g,":id").replace(/\?.*/,"");by[k]=(by[k]||0)+1}});
for(const path of ["/leaves","/employees","/"]){n=0;by={};await p.goto("http://qa-prov-a.localhost:3014"+path);await p.waitForLoadState("networkidle").catch(()=>{});await p.waitForTimeout(4000);console.log(path,"api requests:",n,JSON.stringify(Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,5)))}
await b.close()})()
