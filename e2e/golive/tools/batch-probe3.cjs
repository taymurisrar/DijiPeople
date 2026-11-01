const fs=require("fs");const { chromium } = require("@playwright/test");
const env=Object.fromEntries(fs.readFileSync(".env.qa.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1)]));
const api=env.QA_API_URL+"/api";const H={"content-type":"application/json","X-DijiPeople-App":"web"};
const f=async(m,p,b,t)=>{const r=await fetch(api+p,{method:m,headers:{...H,...(t?{authorization:"Bearer "+t}:{})},body:b?JSON.stringify(b):undefined});let j;const x=await r.text();try{j=JSON.parse(x)}catch{j=x}return {s:r.status,j,h:r.headers}};
const tok=async(email)=>{const r=await f("POST","/auth/login",{email,password:env.QA_PASSWORD,tenantSlug:"qa-prov-a"});return r.j.accessToken??r.j.tokens?.accessToken};
(async()=>{
const A=await tok(env.QA_TENANT_A_OWNER);
const cur=(await f("GET","/tenant-settings/resolved",null,A)).j;const logo=JSON.stringify(cur).match(/"logoUrl":"([^"]*)"/)?.[1];console.log("logoUrl:",logo);
if(logo){const path=logo.replace(/^.*\/api/,"");for(const [n,em] of [["OWNER",env.QA_TENANT_A_OWNER],["EMPLOYEE","a-employee@qa.dijipeople.test"],["HR","a-hr@qa.dijipeople.test"],["MANAGER","a-manager@qa.dijipeople.test"],["PAYROLL","a-payroll-manager@qa.dijipeople.test"]]){const t=await tok(em);const r=await f("GET",path,null,t);console.log(" logo",n,r.s,r.h.get("content-type"))}}
// public branding payload
const pb=await f("GET","/tenant-settings/public-branding",null,null);console.log("public-branding (no host):",pb.s,JSON.stringify(pb.j).slice(0,200));
const b=await chromium.launch();
// login page text with branding set
await f("PATCH","/tenant-settings",{updates:[{category:"branding",key:"welcomeTitle",value:"Welcome to Acme Probe"},{category:"branding",key:"brandName",value:"Acme Probe"}]},A);
const p=await (await b.newContext()).newPage();await p.goto("http://qa-prov-a.localhost:3014/login");await p.waitForLoadState("networkidle").catch(()=>{});await p.waitForTimeout(1500);
console.log("login text:",JSON.stringify(await p.evaluate(()=>document.body.innerText.slice(0,260).replace(/\n+/g," | "))));
await f("PATCH","/tenant-settings",{updates:[{category:"branding",key:"welcomeTitle",value:""},{category:"branding",key:"brandName",value:"DijiPeople"}]},A);
// CMD-022 import click behaviour
const c=await b.newContext({storageState:"e2e/golive-results/.auth/A-OWNER.json"});const q=await c.newPage();
await q.goto("http://qa-prov-a.localhost:3014/employees");await q.waitForLoadState("networkidle").catch(()=>{});await q.waitForTimeout(1500);
await q.getByRole("button",{name:"Data Transfer"}).click();const pop=c.waitForEvent("page",{timeout:6000}).catch(()=>null);await q.getByRole("menuitem",{name:"Import",exact:true}).click();const np=await pop;await q.waitForTimeout(3000);
console.log("after Import: url",q.url(),"newPage:",np?np.url():null,"dialogs:",await q.evaluate(()=>[...document.querySelectorAll("[role=dialog]")].map(d=>d.innerText.slice(0,120))));
await q.screenshot({path:"e2e/golive-results/explore/import-click.png"});
await b.close()})()
