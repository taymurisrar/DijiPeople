const fs=require("fs");const { chromium } = require("@playwright/test");
const env=Object.fromEntries(fs.readFileSync(".env.qa.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1)]));
const api=env.QA_API_URL+"/api";const H={"content-type":"application/json","X-DijiPeople-App":"web"};
(async()=>{const l=await (await fetch(api+"/auth/login",{method:"POST",headers:H,body:JSON.stringify({email:env.QA_TENANT_A_OWNER,password:env.QA_PASSWORD,tenantSlug:"qa-prov-a"})})).json();const T=l.accessToken??l.tokens?.accessToken;const A={...H,authorization:"Bearer "+T};
const b=await chromium.launch();const c=await b.newContext({storageState:"e2e/golive-results/.auth/A-OWNER.json",viewport:{width:1440,height:900}});const q=await c.newPage();
const conslog=[];q.on("console",m=>conslog.push(m.type()+": "+m.text().slice(0,140)));
await q.goto("http://qa-prov-a.localhost:3014/employees");await q.waitForLoadState("networkidle").catch(()=>{});await q.waitForTimeout(1500);
await q.getByRole("button",{name:"Data Transfer"}).click();await q.waitForTimeout(500);
const imp=q.getByRole("menuitem",{name:"Import",exact:true});console.log("Import menuitem attrs:",JSON.stringify(await imp.evaluate(e=>({disabled:e.disabled,ariaDisabled:e.getAttribute("aria-disabled"),title:e.getAttribute("title"),cls:e.className.slice(0,80)}))));
await imp.click();await q.waitForTimeout(3500);console.log("url after click:",q.url());console.log("console:",conslog.slice(-4).join(" | "));
// documents UI upload check
const list=await (await fetch(api+"/employees?pageSize=1",{headers:A})).json();const id=list.items[0].id;
await q.goto("http://qa-prov-a.localhost:3014/employees/"+id);await q.waitForLoadState("networkidle").catch(()=>{});await q.waitForTimeout(2500);
await q.getByRole("tab",{name:"Documents"}).click();await q.waitForTimeout(1200);await q.getByRole("button",{name:"New",exact:true}).last().click();await q.waitForTimeout(1200);
for(const [n,o] of [[/document type/i,"CNIC"],[/document category/i,"Identity Documents"]]){await q.getByRole("combobox",{name:n}).click();await q.getByRole("option",{name:o,exact:true}).click()}
const title="QA UIprobe "+Date.now().toString(36);await q.getByLabel(/^title/i).fill(title);
const PDF=Buffer.from("%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF "+Date.now());
const reqs=[];q.on("response",r=>{if(/documents/.test(r.url())&&r.request().method()!=="GET")reqs.push(r.request().method()+" "+r.status()+" "+r.url().replace(/^https?:\/\/[^/]+/,"").slice(0,70))});
await q.locator("input[type=file]").setInputFiles({name:"qa-ui.pdf",mimeType:"application/pdf",buffer:PDF});await q.waitForTimeout(5000);
console.log("doc requests:",reqs.join(" ; "));
const docs=await (await fetch(api+"/documents/entity/EMPLOYEE/"+id,{headers:A})).json();console.log("API docs:",JSON.stringify((Array.isArray(docs)?docs:docs.items||[]).map(d=>d.title)));
console.log("buttons now:",JSON.stringify(await q.evaluate(()=>[...document.querySelectorAll("button")].map(x=>x.textContent.trim()).filter(Boolean).slice(-8))));
await q.screenshot({path:"e2e/golive-results/explore/doc-upload-ui.png"});
for(const d of (Array.isArray(docs)?docs:docs.items||[]).filter(d=>/QA UIprobe/.test(d.title)))await fetch(api+"/documents/"+d.id,{method:"DELETE",headers:A});
await b.close()})()
