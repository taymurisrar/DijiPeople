const { chromium } = require("@playwright/test"); const fs=require("fs");
const env=Object.fromEntries(fs.readFileSync(".env.qa.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1)]));
const T=JSON.parse(fs.readFileSync("e2e/golive-results/.auth/api-tokens.json","utf8"))["A/OWNER"].token;
(async()=>{const list=await (await fetch(env.QA_API_URL+"/api/employees?pageSize=1",{headers:{authorization:"Bearer "+T,"X-DijiPeople-App":"web"}})).json();const id=list.items[0].id;
const b=await chromium.launch();const c=await b.newContext({storageState:"e2e/golive-results/.auth/A-OWNER.json",viewport:{width:1440,height:900}});const p=await c.newPage();
await p.goto("http://qa-prov-a.localhost:3014/employees/"+id);await p.waitForLoadState("networkidle").catch(()=>{});await p.waitForTimeout(1500);
await p.getByRole("tab",{name:"Documents"}).click();await p.waitForTimeout(2000);await p.getByRole("button",{name:"New",exact:true}).last().click();await p.waitForTimeout(2500);
console.log(JSON.stringify(await p.evaluate(()=>({buttons:[...new Set([...document.querySelectorAll("button")].map(x=>x.textContent.trim()).filter(Boolean))].slice(0,40),files:document.querySelectorAll("input[type=file]").length,text:document.body.innerText.slice(0,900).replace(/\n+/g," | ")}))));
await p.screenshot({path:"e2e/golive-results/explore/doc-new.png"});await b.close()})()

