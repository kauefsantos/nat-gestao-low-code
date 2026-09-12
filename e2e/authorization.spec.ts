import { createHmac, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const tenantA = "a1000000-0000-4000-8000-000000000001";
const tenantB = "a1000000-0000-4000-8000-000000000002";
const password = "NAT-RLS-e2e-2026!";
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const responsiveSessionPath = ".test-build/responsive-aal2-session.json";

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

function makeClient(){
  expect(supabaseUrl).toBeTruthy();
  expect(supabaseKey).toBeTruthy();
  return createClient(supabaseUrl!,supabaseKey!,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}

async function createAal2Session(client:SupabaseClient,email:string){
  const signIn=await client.auth.signInWithPassword({email,password});
  expect(signIn.error?.message??null).toBeNull();

  const factors=await client.auth.mfa.listFactors();
  expect(factors.error?.message??null).toBeNull();
  for(const pending of factors.data?.totp.filter((factor)=>factor.status!=="verified")??[]){
    const removed=await client.auth.mfa.unenroll({factorId:pending.id});
    expect(removed.error?.message??null).toBeNull();
  }

  const enrolled=await client.auth.mfa.enroll({factorType:"totp",friendlyName:`NAT Gestão E2E ${randomUUID()}`});
  expect(enrolled.error?.message??null).toBeNull();
  expect(enrolled.data?.id).toBeTruthy();
  expect(enrolled.data?.totp.secret).toBeTruthy();

  const challenge=await client.auth.mfa.challenge({factorId:enrolled.data!.id});
  expect(challenge.error?.message??null).toBeNull();
  const verified=await client.auth.mfa.verify({factorId:enrolled.data!.id,challengeId:challenge.data!.id,code:totp(enrolled.data!.totp.secret)});
  expect(verified.error?.message??null).toBeNull();

  const assurance=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  expect(assurance.error?.message??null).toBeNull();
  expect(assurance.data?.currentLevel).toBe("aal2");

  const bootstrap=await client.rpc("bootstrap_nat_business");
  expect(bootstrap.error?.message??null).toBeNull();
  expect(bootstrap.data).toBeTruthy();
}

async function probe(client:SupabaseClient,foreignBusinessId:string){
  const membership=await client.from("business_members").select("business_id,role");
  const supplies=await client.from("supplies").select("id,business_id,name").order("name");
  const crossWrite=await client.rpc("save_supply",{
    p_business_id:foreignBusinessId,
    p_id:randomUUID(),
    p_name:"CROSS TENANT MUST FAIL",
    p_category:"ingredient",
    p_package_quantity:100,
    p_package_unit:"g",
    p_package_price:10,
    p_purchased_at:new Date().toISOString().slice(0,10),
  });
  const foreignRead=await client.from("supplies").select("id").eq("business_id",foreignBusinessId);
  return {
    memberships:membership.data??[],membershipError:membership.error?.message??null,
    supplies:supplies.data??[],suppliesError:supplies.error?.message??null,
    crossWriteError:crossWrite.error?.message??null,
    foreignVisibleCount:foreignRead.data?.length??0,foreignReadError:foreignRead.error?.message??null,
  };
}

test("MFA real mantém leitura e escrita isoladas entre dois negócios",async()=>{
  const clientA=makeClient();
  const clientB=makeClient();

  await createAal2Session(clientA,"rls-admin-a@example.test");
  const resultA=await probe(clientA,tenantB);
  expect(resultA.membershipError).toBeNull();
  expect(resultA.suppliesError).toBeNull();
  expect(resultA.foreignReadError).toBeNull();
  expect(resultA.memberships).toEqual([{business_id:tenantA,role:"admin"}]);
  expect(resultA.supplies.map((item)=>item.business_id)).toEqual([tenantA]);
  expect(resultA.supplies.map((item)=>item.name)).toContain("ONLY TENANT A");
  expect(resultA.supplies.map((item)=>item.name)).not.toContain("ONLY TENANT B");
  expect(resultA.foreignVisibleCount).toBe(0);
  expect(resultA.crossWriteError).toBeTruthy();

  const sessionA=(await clientA.auth.getSession()).data.session;
  expect(sessionA?.access_token).toBeTruthy();
  expect(sessionA?.refresh_token).toBeTruthy();
  mkdirSync(".test-build",{recursive:true});
  writeFileSync(responsiveSessionPath,JSON.stringify({access_token:sessionA!.access_token,refresh_token:sessionA!.refresh_token}),{encoding:"utf8",mode:0o600});

  await createAal2Session(clientB,"rls-admin-b@example.test");
  const resultB=await probe(clientB,tenantA);
  expect(resultB.membershipError).toBeNull();
  expect(resultB.suppliesError).toBeNull();
  expect(resultB.foreignReadError).toBeNull();
  expect(resultB.memberships).toEqual([{business_id:tenantB,role:"admin"}]);
  expect(resultB.supplies.map((item)=>item.business_id)).toEqual([tenantB]);
  expect(resultB.supplies.map((item)=>item.name)).toContain("ONLY TENANT B");
  expect(resultB.supplies.map((item)=>item.name)).not.toContain("ONLY TENANT A");
  expect(resultB.foreignVisibleCount).toBe(0);
  expect(resultB.crossWriteError).toBeTruthy();

  await clientB.auth.signOut();
});
