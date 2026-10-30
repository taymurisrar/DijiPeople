const { chromium } = require("@playwright/test"); const fs=require("fs");
const env=Object.fromEntries(fs.readFileSync(".env.qa.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1)]));
(async()=>{const b=await chromium.launch();const c=await b.newContext({storageState:"e2e/golive-results/.auth/A-OWNER.json"});const p=await c.newPage();
await p.goto("http://qa-prov-a.localhost:3012/employees/new");await p.waitForLoadState("networkidle").catch(()=>{});await p.waitForTimeout(1000);
await p.getByRole("combobox",{name:/Emergency Contact Relation Type/i}).click();await p.waitForTimeout(800);
console.log(await p.evaluate(()=>JSON.stringify({listbox:[...document.querySelectorAll("[role=listbox]")].map(e=>e.innerText.slice(0,200)),options:[...document.querySelectorAll("[role=option]")].map(e=>e.textContent.trim().slice(0,30)).slice(0,6),ariaControls:document.querySelector("[aria-haspopup=listbox][aria-expanded=true]")?.outerHTML.slice(0,200)})));
await b.close()})()
