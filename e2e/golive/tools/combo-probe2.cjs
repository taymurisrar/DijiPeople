const { chromium } = require("@playwright/test");
(async()=>{const b=await chromium.launch();const c=await b.newContext({storageState:"e2e/golive-results/.auth/A-OWNER.json",viewport:{width:1440,height:900}});const p=await c.newPage();
await p.goto("http://qa-prov-a.localhost:3012/employees/new");await p.waitForLoadState("networkidle").catch(()=>{});await p.waitForTimeout(1500);
const cb=p.getByRole("combobox",{name:/Emergency Contact Relation Type/i});
console.log("combobox count",await cb.count());
for(let i=0;i<3;i++){await cb.click();await p.waitForTimeout(700);console.log("try",i,"options",await p.getByRole("option").count(),"listbox",await p.getByRole("listbox").count(),"expanded",await cb.getAttribute("aria-expanded"))}
await p.screenshot({path:"e2e/golive-results/explore/combo.png"});
await b.close()})()
