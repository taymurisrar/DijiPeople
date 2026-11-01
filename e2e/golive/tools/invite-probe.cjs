const fs=require("fs");const { Client } = require("pg");
const env=Object.fromEntries(fs.readFileSync(".env.qa.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1)]));
const api=env.QA_API_URL+"/api";const H={"content-type":"application/json","X-DijiPeople-App":"web"};
const f=async(m,p,b,t)=>{const r=await fetch(api+p,{method:m,headers:{...H,...(t?{authorization:"Bearer "+t}:{})},body:b?JSON.stringify(b):undefined});let j;const x=await r.text();try{j=JSON.parse(x)}catch{j=x}return {s:r.status,j}};
const login=async(email,slug)=>{const r=await f("POST","/auth/login",{email,password:env.QA_PASSWORD,tenantSlug:slug});return r.j.accessToken??r.j.tokens?.accessToken};
(async()=>{
const db=new Client({connectionString:env.QA_DATABASE_URL});await db.connect();
await fetch("http://127.0.0.1:8025/messages",{method:"DELETE"});
const A=await login(env.QA_TENANT_A_OWNER,"qa-prov-a");
const rel=(await f("GET","/lookups/relation-types",null,A)).j;const relId=(Array.isArray(rel)?rel:rel.items)[0].id;
const email="probe"+Date.now().toString(36)+"@qa.dijipeople.test";
const e=await f("POST","/employees",{firstName:"Probe",lastName:"Inv",workEmail:email,hireDate:"2025-02-03",employmentStatus:"ACTIVE",phone:"+97455500001",emergencyContactName:"X Y",emergencyContactRelationTypeId:relId,emergencyContactPhone:"+97455500002",provisionSystemAccess:true,sendInvitationNow:true},A);
await new Promise(r=>setTimeout(r,3000));
let m=await (await fetch("http://127.0.0.1:8025/messages?to="+email)).json();console.log("invite mails after create:",m.length);
const tok=new URL(m[0].links.find(l=>/token=/.test(l))).searchParams.get("token");
const rows=await db.query('select ui.id, ui.status, ui."expiresAt", ui."createdAt" from "UserInvitation" ui join "User" u on u.id=ui."userId" where u.email=$1 order by ui."createdAt"',[email]);console.log("invitations",JSON.stringify(rows.rows));
const rs=await f("POST","/employees/"+e.j.id+"/resend-invite",null,A);console.log("resend",rs.s,JSON.stringify(rs.j).slice(0,300));
await new Promise(r=>setTimeout(r,3000));m=await (await fetch("http://127.0.0.1:8025/messages?to="+email)).json();console.log("mails after resend:",m.length);
const rows2=await db.query('select ui.id, ui.status, ui."expiresAt" from "UserInvitation" ui join "User" u on u.id=ui."userId" where u.email=$1 order by ui."createdAt"',[email]);console.log("invitations after resend",JSON.stringify(rows2.rows));
// expiry probe on the newest pending
const aged=await db.query('update "UserInvitation" set "expiresAt"=now()-interval \'1 hour\' where id in (select ui.id from "UserInvitation" ui join "User" u on u.id=ui."userId" where u.email=$1) returning id,"expiresAt"',[email]);console.log("aged",JSON.stringify(aged.rows));
const last=m.length?new URL(m[m.length-1].links.find(l=>/token=/.test(l))).searchParams.get("token"):tok;
const act=await f("POST","/auth/activate-account",{token:last,password:"Probe!Zz9x1234"});console.log("activate with aged invitation:",act.s,JSON.stringify(act.j).slice(0,160));
const st=await db.query('select ui.status from "UserInvitation" ui join "User" u on u.id=ui."userId" where u.email=$1',[email]);console.log("status after",JSON.stringify(st.rows));
await f("DELETE","/employees/"+e.j.id,null,A);await db.end();
})()
