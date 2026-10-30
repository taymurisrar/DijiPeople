const fs=require("fs");const { webkit } = require("@playwright/test");
const env=Object.fromEntries(fs.readFileSync(".env.qa.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1)]));
(async()=>{
 for(const base of ["http://qa-starter.localhost:3012","http://localhost:3012"]){
  const b=await webkit.launch();const p=await (await b.newContext()).newPage();
  const q=base.includes("qa-starter")?"":"?tenant=qa-starter";
  await p.goto(base+"/login"+q);await p.waitForLoadState("networkidle").catch(()=>{});
  await p.getByLabel(/email/i).first().fill(env.QA_ADMIN_EMAIL);await p.getByLabel(/password/i).first().fill(env.QA_PASSWORD);
  await p.getByRole("button",{name:/sign in|log in/i}).first().click();
  await p.waitForTimeout(6000);
  const ck=await p.context().cookies();
  console.log(base,"->",p.url(),"cookies:",ck.map(c=>c.name+"@"+c.domain+(c.secure?"(secure)":"")+(c.sameSite?"/"+c.sameSite:"")).join(", "));
  await b.close();
 }
})()
