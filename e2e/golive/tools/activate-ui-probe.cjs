const fs=require("fs");const { chromium } = require("@playwright/test");
const env=Object.fromEntries(fs.readFileSync(".env.qa.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1)]));
const api=env.QA_API_URL+"/api";const H={"content-type":"application/json","X-DijiPeople-App":"web"};
const f=async(m,p,b,t)=>{const r=await fetch(api+p,{method:m,headers:{...H,...(t?{authorization:"Bearer "+t}:{})},body:b?JSON.stringify(b):undefined});let j;const x=await r.text();try{j=JSON.parse(x)}catch{j=x}return {s:r.status,j}};
(async()=>{
const A=(await f("POST","/auth/login",{email:env.QA_TENANT_A_OWNER,password:env.QA_PASSWORD,tenantSlug:"qa-prov-a"})).j;const T=A.accessToken??A.tokens?.accessToken;
const rel=(await f("GET","/lookups/relation-types",null,T)).j;const relId=(Array.isArray(rel)?rel:rel.items)[0].id;
await fetch("http://127.0.0.1:8025/messages",{method:"DELETE"});
const email="uiact"+Date.now().toString(36)+"@qa.dijipeople.test";
const e=await f("POST","/employees",{firstName:"Ui",lastName:"Act",workEmail:email,hireDate:"2025-02-03",employmentStatus:"ACTIVE",phone:"+97455500001",emergencyContactName:"X Y",emergencyContactRelationTypeId:relId,emergencyContactPhone:"+97455500002",provisionSystemAccess:true,sendInvitationNow:true},T);
let m=[];for(let i=0;i<30&&!m.length;i++){await new Promise(r=>setTimeout(r,1000));m=await (await fetch("http://127.0.0.1:8025/messages?to="+email)).json()}
const link=m[0].links.find(l=>/token=/.test(l));const tok=new URL(link).searchParams.get("token");
const b=await chromium.launch();const p=await (await b.newContext()).newPage();
const reqs=[];p.on("response",r=>{if(/activate|auth/.test(r.url()))reqs.push(r.status()+" "+r.request().method()+" "+r.url().replace(/^https?:\/\/[^/]+/,"").slice(0,80))});
await p.goto("http://qa-prov-a.localhost:3014/activate?token="+encodeURIComponent(tok));await p.waitForLoadState("networkidle").catch(()=>{});await p.waitForTimeout(1500);
console.log("page:",p.url(),JSON.stringify(await p.evaluate(()=>({h:[...document.querySelectorAll("h1,h2")].map(x=>x.textContent.trim()),inputs:[...document.querySelectorAll("input")].map(i=>i.type+":"+(i.name||i.id||i.placeholder||"")),buttons:[...document.querySelectorAll("button")].map(x=>x.textContent.trim())}))));
const pw="UiAct!Zz9x12345";const pws=p.locator("input[type=password]");for(let i=0;i<await pws.count();i++)await pws.nth(i).fill(pw);
const btn=p.getByRole("button",{name:"Activate account"});await btn.scrollIntoViewIfNeeded();await btn.click();await p.waitForTimeout(4000);
console.log("after submit:",p.url(),JSON.stringify(await p.evaluate(()=>document.body.innerText.slice(0,200).replace(/\n+/g," | "))));console.log(reqs.join(" ; "));
await p.screenshot({path:"e2e/golive-results/explore/activate-ui.png"});
const l=await f("POST","/auth/login",{email,password:pw,tenantSlug:"qa-prov-a"});console.log("API login with the UI-set password:",l.s,(l.j.message||""));
await f("DELETE","/employees/"+e.j.id,null,T);await b.close()})()
