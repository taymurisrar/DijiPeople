const { chromium } = require("@playwright/test"); const fs=require("fs");
const env=Object.fromEntries(fs.readFileSync(".env.qa.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1)]));
(async()=>{
const login=async(email,slug)=>{const r=await (await fetch(env.QA_API_URL+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json","X-DijiPeople-App":"web"},body:JSON.stringify({email,password:env.QA_PASSWORD,tenantSlug:slug})})).json();return r.accessToken??r.tokens?.accessToken};
const T=await login(env.QA_TENANT_A_OWNER,env.QA_TENANT_A_SLUG);const H={authorization:"Bearer "+T,"X-DijiPeople-App":"web","content-type":"application/json"};
const rel=(await (await fetch(env.QA_API_URL+"/api/lookups/relation-types",{headers:H})).json());const relId=(Array.isArray(rel)?rel:rel.items)[0].id;
const e=await (await fetch(env.QA_API_URL+"/api/employees",{method:"POST",headers:H,body:JSON.stringify({firstName:"Probe"+Date.now().toString(36),lastName:"Fixture",hireDate:"2025-02-03",employmentStatus:"ACTIVE",phone:"+97455500001",emergencyContactName:"X Y",emergencyContactRelationTypeId:relId,emergencyContactPhone:"+97455500002"})})).json();
const b=await chromium.launch();const c=await b.newContext({storageState:"e2e/golive-results/.auth/A-OWNER.json",viewport:{width:1440,height:900}});const p=await c.newPage();
await p.goto("http://qa-prov-a.localhost:3012/employees/"+e.id);await p.waitForLoadState("networkidle").catch(()=>{});await p.waitForTimeout(1500);
await p.getByRole("button",{name:/^edit$/i}).first().click();await p.waitForTimeout(2500);
console.log(JSON.stringify(await p.evaluate(()=>({buttons:[...new Set([...document.querySelectorAll("button")].map(x=>x.textContent.trim()).filter(Boolean))].slice(0,20),pref:(()=>{const i=document.querySelector("[data-runtime-field=preferredName] input");return i?{disabled:i.disabled,readonly:i.readOnly}:null})(),firstName:(()=>{const i=document.querySelector("[data-runtime-field=firstName] input");return i?{disabled:i.disabled}:null})(),enabledInputs:[...document.querySelectorAll("input:not([type=hidden])")].filter(i=>!i.disabled).length,total:document.querySelectorAll("input:not([type=hidden])").length}))));
await p.screenshot({path:"e2e/golive-results/explore/emp-edit.png"});
await b.close();await fetch(env.QA_API_URL+"/api/employees/"+e.id,{method:"DELETE",headers:H});
// ATT-008 body probe
const S=await login(env.QA_EMPLOYEE_EMAIL,env.QA_TENANT_SLUG);const HS={authorization:"Bearer "+S,"X-DijiPeople-App":"web","content-type":"application/json"};
for(const body of [{attendanceDate:"2026-10-26",correctionType:"LATE_CHECK_IN",requestedCheckInAtUtc:"2026-10-26T04:30:00.000Z",reason:"QA correction"}]){
const r=await fetch(env.QA_API_URL+"/api/attendance/correction-requests",{method:"POST",headers:HS,body:JSON.stringify(body)});const j=await r.json();console.log("create",r.status,JSON.stringify(j).slice(0,160));const id=j.item?.id;
if(id){const x=await fetch(env.QA_API_URL+"/api/attendance/correction-requests/"+id+"/cancel",{method:"POST",headers:HS,body:JSON.stringify({reason:"QA"})});console.log("cancel",x.status,(await x.text()).slice(0,250))}}
})()
