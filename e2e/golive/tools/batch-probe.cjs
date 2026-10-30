const fs=require("fs");const { webkit, firefox } = require("@playwright/test");
const env=Object.fromEntries(fs.readFileSync(".env.qa.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1)]));
const T=JSON.parse(fs.readFileSync("e2e/golive-results/.auth/api-tokens.json","utf8"));
const H=k=>({authorization:"Bearer "+T[k].token,"X-DijiPeople-App":"web","content-type":"application/json"});
const f=async(k,m,p,b)=>{const r=await fetch(env.QA_API_URL+"/api"+p,{method:m,headers:H(k),body:b?JSON.stringify(b):undefined});let j;const t=await r.text();try{j=JSON.parse(t)}catch{j=t}return {s:r.status,j}};
(async()=>{
// 1 duplicate email
const rel=(await f("A/OWNER","GET","/lookups/relation-types")).j;const relId=(Array.isArray(rel)?rel:rel.items)[0].id;
const mk=(e)=>({firstName:"Dup",lastName:"Probe",workEmail:e,hireDate:"2025-02-03",employmentStatus:"ACTIVE",phone:"+97455500001",emergencyContactName:"X Y",emergencyContactRelationTypeId:relId,emergencyContactPhone:"+97455500002"});
const em="dupprobe"+Date.now().toString(36)+"@qa.dijipeople.test";
const a=await f("A/OWNER","POST","/employees",mk(em));const b=await f("A/OWNER","POST","/employees",mk(em));
console.log("DUP create1",a.s,"create2",b.s,(b.j.message||"").toString().slice(0,100));
const c=await f("A/OWNER","POST","/employees",mk(em.toUpperCase()));console.log("DUP uppercase",c.s);
for(const x of [a,b,c]) if(x.j.id) await f("A/OWNER","DELETE","/employees/"+x.j.id);
// 2 manager approve non-report
const types=(await f("A/OWNER","GET","/leave-types")).j;const ty=(Array.isArray(types)?types:types.items).find(t=>t.code==="QAL");
const d=new Date(Date.UTC(2029,0,3+(Date.now()%300))).toISOString().slice(0,10);
const lr=await f("A/EMPLOYEE","POST","/leave-requests",{leaveTypeId:ty.id,startDate:d,endDate:d});
const ap=await f("A/MANAGER","POST","/leave-requests/"+lr.j.id+"/approve",{comments:"mgr"});
const st=await f("A/OWNER","GET","/leave-requests/"+lr.j.id);
console.log("MGR approve",ap.s,"final status",st.j.status,"approvedBy?",JSON.stringify(st.j).match(/"approv[A-Za-z]*(By|Id)[A-Za-z]*":"[^"]*"/g));
const emp=(await f("A/OWNER","GET","/employees?pageSize=100")).j.items;const e=emp.find(x=>x.workEmail==="a-employee@qa.dijipeople.test");console.log("employee reportingManagerId",e.reportingManagerId);
await f("A/OWNER","POST","/leave-requests/"+lr.j.id+"/cancel",{reason:"cleanup"});
// 3 import txt
const fd=new FormData();fd.append("file",new Blob(["a,b\n1,2"],{type:"text/plain"}),"x.txt");
const ir=await fetch(env.QA_API_URL+"/api/employees/import",{method:"POST",headers:{authorization:H("A/OWNER").authorization,"X-DijiPeople-App":"web"},body:fd});console.log("IMPORT txt",ir.status,(await ir.text()).slice(0,300));
// 4 designation delete then get
const dz=await f("A/OWNER","POST","/designations",{name:"QA Gone "+Date.now()});await f("A/OWNER","DELETE","/designations/"+dz.j.id);const g=await f("A/OWNER","GET","/designations/"+dz.j.id);console.log("DESIG after delete",g.s,JSON.stringify(g.j).slice(0,160));
// 5 webkit
for(const [name,bt] of [["webkit",webkit],["firefox",firefox]]){
 const b2=await bt.launch();const ctx=await b2.newContext({storageState:"e2e/golive-results/.auth/ADMIN.json"});const p=await ctx.newPage();const errs=[];p.on("console",m=>m.type()==="error"&&errs.push(m.text().slice(0,140)));p.on("pageerror",e=>errs.push("pageerror "+e.message.slice(0,140)));p.on("requestfailed",r=>errs.push("reqfailed "+r.url().slice(0,90)+" "+(r.failure()?.errorText||"")));
 await p.goto("http://qa-starter.localhost:3012/settings/access").catch(e=>errs.push("goto "+e.message.slice(0,100)));await p.waitForLoadState("networkidle").catch(()=>{});await p.waitForTimeout(2500);
 console.log(name,p.url(),JSON.stringify(await p.evaluate(()=>document.body.innerText.slice(0,120))),JSON.stringify(errs.slice(0,5)));await p.screenshot({path:"e2e/golive-results/explore/"+name+"-probe.png"});await b2.close()}
})()
