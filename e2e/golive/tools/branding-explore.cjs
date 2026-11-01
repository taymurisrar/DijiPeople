const { chromium } = require("@playwright/test");
(async()=>{const b=await chromium.launch();const c=await b.newContext({storageState:"e2e/golive-results/.auth/A-OWNER.json",viewport:{width:1440,height:1400}});const p=await c.newPage();
await p.goto("http://qa-prov-a.localhost:3014/settings/branding");await p.waitForLoadState("networkidle").catch(()=>{});await p.waitForTimeout(2500);
const t=await p.evaluate(()=>document.body.innerText);console.log(["email footer","sender name","logo in e-mail","email brand","Email"].map(k=>k+": "+new RegExp(k,"i").test(t)).join(" | "));
console.log(t.split("\n").filter(l=>l.trim()).slice(8,60).join(" / ").slice(0,900));
await p.screenshot({path:"e2e/golive-results/explore/branding-v4.png",fullPage:true});await b.close()})()
