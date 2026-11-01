const fs=require("fs");const { chromium } = require("@playwright/test");
const env=Object.fromEntries(fs.readFileSync(".env.qa.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1)]));
const T=JSON.parse(fs.readFileSync("e2e/golive-results/.auth/api-tokens.json","utf8"))["A/OWNER"].token;
(async()=>{const list=await (await fetch(env.QA_API_URL+"/api/employees?pageSize=1",{headers:{authorization:"Bearer "+T,"X-DijiPeople-App":"web"}})).json();const id=list.items[0].id;
const b=await chromium.launch();const c=await b.newContext({storageState:"e2e/golive-results/.auth/A-OWNER.json",viewport:{width:1440,height:900}});const p=await c.newPage();
await p.goto("http://qa-prov-a.localhost:3014/employees/"+id);await p.waitForLoadState("networkidle").catch(()=>{});await p.waitForTimeout(1500);
await p.getByRole("tab",{name:"Documents"}).click();await p.waitForTimeout(1500);await p.getByRole("button",{name:"New",exact:true}).last().click();await p.waitForTimeout(1500);
for(const n of [/document type/i,/document category/i]){await p.getByRole("combobox",{name:n}).click();await p.waitForTimeout(700);console.log(n,JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll("[role=option]")].map(o=>o.textContent.trim()+(o.offsetParent?"":"(hidden)")))));await p.keyboard.press("Escape")}
await p.goto("http://qa-prov-a.localhost:3014/employees");await p.waitForLoadState("networkidle").catch(()=>{});await p.waitForTimeout(1500);
await p.getByRole("button",{name:"Data Transfer"}).click();await p.waitForTimeout(800);
console.log("menu candidates:",JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll("button,a,[role=menuitem]")].filter(e=>/^(Import|Export)/.test((e.textContent||"").trim())).map(e=>e.tagName+"|"+e.getAttribute("role")+"|"+(e.textContent||"").trim()+"|"+(e.offsetParent?"vis":"hid")))));
await b.close()})()
