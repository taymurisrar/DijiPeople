const { chromium } = require("@playwright/test");
(async()=>{const b=await chromium.launch();const c=await b.newContext({storageState:"e2e/golive-results/.auth/A-OWNER.json"});const p=await c.newPage();
await p.goto("http://qa-prov-a.localhost:3014/leaves");await p.waitForLoadState("networkidle").catch(()=>{});await p.waitForTimeout(3000);
console.log("warm");
await new Promise(r=>setTimeout(r,2000));console.log("MARK");
await p.goto("http://qa-prov-a.localhost:3014/employees/new");await p.waitForLoadState("networkidle").catch(()=>{});await p.waitForTimeout(4000);
console.log("DONE");await b.close()})()
