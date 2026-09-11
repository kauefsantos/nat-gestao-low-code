import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const tenantA = "a1000000-0000-4000-8000-000000000001";
const tenantB = "a1000000-0000-4000-8000-000000000002";
const password = "NAT-RLS-e2e-2026!";

function decodeBase32(value:string){
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized=value.toUpperCase().replace(/=+$/g,"").replace(/\s+/g,"");
  let bits="";
  for(const char of normalized){const index=alphabet.indexOf(char);if(index<0)throw new Error("Invalid base32 secret");bits+=index.toString(2).padStart(5,"0");}
  const bytes:number[]=[];
  for(let index=0;index+8<=bits.length;index+=8)bytes.push(Number.parseInt(bits.slice(index,index+8),2));
  return Buffer.from(bytes);
}

function totp(secret:string, now=Date.now()){
  const counter=Math.floor(now/1000/30);
  const buffer=Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest=createHmac("sha1",decodeBase32(secret)).update(buffer).digest();
  const offset=digest[digest.length-1]&0x0f;
  const code=((digest[offset]&0x7f)<<24)|((digest[offset+1]&0xff)<<16)|((digest[offset+2]&0xff)<<8)|(digest[offset+3]&0xff);
  return String(code%1_000_000).padStart(6,"0");
}

async function createAal2Session(page:Page,email:string){
  await page.goto("/login");
  const enrollment=await page.evaluate(async ({email,password})=>{
    const {supabase}=await import("/src/integrations/supabase/client.ts");
    const signIn=await supabase.auth.signInWithPassword({email,password});
    if(signIn.error)return {error:`sign-in: ${signIn.error.message}`,factorId:null,secret:null};
    const factors=await supabase.auth.mfa.listFactors();
    if(factors.error)return {error:`list-factors: ${factors.error.message}`,factorId:null,secret:null};
    for(const pending of factors.data.totp.filter((factor)=>factor.status!=="verified")){
      const removed=await supabase.auth.mfa.unenroll({factorId:pending.id});
      if(removed.error)return {error:`unenroll: ${removed.error.message}`,factorId:null,secret:null};
    }
    const verified=factors.data.totp.find((factor)=>factor.status==="verified");
    if(verified)return {error:null,factorId:verified.id,secret:null};
    const enrolled=await supabase.auth.mfa.enroll({factorType:"totp",friendlyName:`NAT Gestão E2E ${crypto.randomUUID()}`});
    if(enrolled.error)return {error:`enroll: ${enrolled.error.message}`,factorId:null,secret:null};
    return {error:null,factorId:enrolled.data.id,secret:enrolled.data.totp.secret??null};
  },{email,password});
  expect(enrollment.error).toBeNull();
  expect(enrollment.factorId).toBeTruthy();
  expect(enrollment.secret).toBeTruthy();
  const code=totp(enrollment.secret!);
  const verification=await page.evaluate(async ({factorId,code})=>{
    const {supabase}=await import("/src/integrations/supabase/client.ts");
    const challenge=await supabase.auth.mfa.challenge({factorId});
    if(challenge.error)return {error:`challenge: ${challenge.error.message}`,currentLevel:null,bootstrapBusinessId:null};
    const verified=await supabase.auth.mfa.verify({factorId,challengeId:challenge.data.id,code});
    if(verified.error)return {error:`verify: ${verified.error.message}`,currentLevel:null,bootstrapBusinessId:null};
    const assurance=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if(assurance.error)return {error:`assurance: ${assurance.error.message}`,currentLevel:null,bootstrapBusinessId:null};
    const bootstrap=await supabase.rpc("bootstrap_nat_business");
    if(bootstrap.error)return {error:`bootstrap: ${bootstrap.error.message}`,currentLevel:assurance.data.currentLevel,bootstrapBusinessId:null};
    return {error:null,currentLevel:assurance.data.currentLevel,bootstrapBusinessId:bootstrap.data};
  },{factorId:enrollment.factorId!,code});
  expect(verification.error).toBeNull();
  expect(verification.currentLevel).toBe("aal2");
  expect(verification.bootstrapBusinessId).toBeTruthy();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
}

async function probe(page:Page,ownBusinessId:string,foreignBusinessId:string){
  return page.evaluate(async ({ownBusinessId,foreignBusinessId})=>{
    const {supabase}=await import("/src/integrations/supabase/client.ts");
    const membership=await supabase.from("business_members").select("business_id,role");
    const supplies=await supabase.from("supplies").select("id,business_id,name").order("name");
    const crossId=crypto.randomUUID();
    const crossWrite=await supabase.rpc("save_supply",{
      p_business_id:foreignBusinessId,
      p_id:crossId,
      p_name:"CROSS TENANT MUST FAIL",
      p_category:"ingredient",
      p_package_quantity:100,
      p_package_unit:"g",
      p_package_price:10,
      p_purchased_at:new Date().toISOString().slice(0,10),
    });
    const foreignRead=await supabase.from("supplies").select("id").eq("business_id",foreignBusinessId);
    return {
      ownBusinessId,
      memberships:membership.data??[],membershipError:membership.error?.message??null,
      supplies:supplies.data??[],suppliesError:supplies.error?.message??null,
      crossWriteError:crossWrite.error?.message??null,
      foreignVisibleCount:foreignRead.data?.length??0,foreignReadError:foreignRead.error?.message??null,
    };
  },{ownBusinessId,foreignBusinessId});
}

test("MFA real mantém leitura e escrita isoladas entre dois negócios",async({browser})=>{
  const contextA=await browser.newContext();
  const pageA=await contextA.newPage();
  await createAal2Session(pageA,"rls-admin-a@example.test");
  const resultA=await probe(pageA,tenantA,tenantB);
  expect(resultA.membershipError).toBeNull();
  expect(resultA.suppliesError).toBeNull();
  expect(resultA.foreignReadError).toBeNull();
  expect(resultA.memberships).toEqual([{business_id:tenantA,role:"admin"}]);
  expect(resultA.supplies.map((item)=>item.business_id)).toEqual([tenantA]);
  expect(resultA.supplies.map((item)=>item.name)).toContain("ONLY TENANT A");
  expect(resultA.supplies.map((item)=>item.name)).not.toContain("ONLY TENANT B");
  expect(resultA.foreignVisibleCount).toBe(0);
  expect(resultA.crossWriteError).toBeTruthy();

  const contextB=await browser.newContext();
  const pageB=await contextB.newPage();
  await createAal2Session(pageB,"rls-admin-b@example.test");
  const resultB=await probe(pageB,tenantB,tenantA);
  expect(resultB.membershipError).toBeNull();
  expect(resultB.suppliesError).toBeNull();
  expect(resultB.foreignReadError).toBeNull();
  expect(resultB.memberships).toEqual([{business_id:tenantB,role:"admin"}]);
  expect(resultB.supplies.map((item)=>item.business_id)).toEqual([tenantB]);
  expect(resultB.supplies.map((item)=>item.name)).toContain("ONLY TENANT B");
  expect(resultB.supplies.map((item)=>item.name)).not.toContain("ONLY TENANT A");
  expect(resultB.foreignVisibleCount).toBe(0);
  expect(resultB.crossWriteError).toBeTruthy();

  await contextA.close();
  await contextB.close();
});
