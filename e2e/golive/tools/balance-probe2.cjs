const fs=require("fs");const { Client } = require("pg");const { chromium } = require("@playwright/test");
const env=Object.fromEntries(fs.readFileSync(".env.qa.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1)]));
const api=env.QA_API_URL+"/api";const H={"content-type":"application/json","X-DijiPeople-App":"web"};
const f=async(m,p,b,t)=>{const r=await fetch(api+p,{method:m,headers:{...H,...(t?{authorization:"Bearer "+t}:{})},body:b?JSON.stringify(b):undefined});let j;const x=await r.text();try{j=JSON.parse(x)}catch{j=x}return {s:r.status,j}};
const login=async(email,slug,pw)=>{const r=await f("POST","/auth/login",{email,password:pw??env.QA_PASSWORD,tenantSlug:slug});return r.j.accessToken??r.j.tokens?.accessToken};
(async()=>{
// 2) balance semantics
const A=await login(env.QA_TENANT_A_OWNER,"qa-prov-a");const E=await login("a-employee@qa.dijipeople.test","qa-prov-a");
const day=n=>new Date(Date.UTC(2032,5,7+n)).toISOString().slice(0,10);
const ty=await f("POST","/leave-types",{name:"QA BalP "+Date.now().toString(36),code:"QP"+Date.now().toString(36).slice(-5).toUpperCase(),category:"ANNUAL",isPaid:true,consumesBalance:true,requiresApproval:true,employeeRequestAllowed:true,isActive:true},A);
const pol=await f("POST","/leave-policies",{name:"QA PolP "+Date.now().toString(36),isActive:true},A);
const rule=await f("POST","/leave-policies/"+pol.j.id+"/rules",{leaveTypeId:ty.j.id,entitlementDays:2,accrualType:"NONE",approvalRequired:true,isPaid:true,allowFutureRequests:true,maxFutureDays:3650},A);
const asg=await f("POST","/leave-policies/assignments",{leavePolicyId:pol.j.id,scopeType:"TENANT",isActive:true,effectiveFrom:"2020-01-01"},A);
console.log("setup",ty.s,pol.s,rule.s,asg.s);
const db=new Client({connectionString:env.QA_DATABASE_URL});await db.connect();
const bal=async()=>JSON.stringify((await db.query('select * from "LeaveBalance" where "leaveTypeId"=$1 limit 1',[ty.j.id])).rows[0]||null).replace(/"(id|tenantId|employeeId|leaveTypeId|createdAt|updatedAt|createdById|updatedById)":"[^"]*",?/g,'');
console.log("balance initial",await bal());
const ids=[];for(let i=0;i<3;i++){const r=await f("POST","/leave-requests",{leaveTypeId:ty.j.id,startDate:day(i),endDate:day(i)},E);ids.push(r.j.id);console.log("submit",i,r.s,(r.j.message||"").slice(0,80));console.log(" balance",await bal())}
for(const id of ids.filter(Boolean)){const a=await f("POST","/leave-requests/"+id+"/approve",{},A);console.log("approve",a.s,(a.j.message||"").slice(0,90));console.log(" balance",await bal())}
// cleanup
for(const id of ids.filter(Boolean)){await f("POST","/leave-requests/"+id+"/cancel",{},A)}
await f("DELETE","/leave-policies/assignments/"+asg.j.id,null,A);await f("DELETE","/leave-policies/"+pol.j.id+"/rules/"+rule.j.id,null,A);await f("DELETE","/leave-policies/"+pol.j.id,null,A);await f("DELETE","/leave-types/"+ty.j.id,null,A);
await db.end();
})()
