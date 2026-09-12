import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const email="responsive@example.test";
const password="NAT-RLS-e2e-2026!";
const supabaseUrl=process.env.VITE_SUPABASE_URL;
const supabaseKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

test.describe.configure({retries:0});

function decodeBase32(value:string){
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized=value.toUpperCase().replace(/=+$/g,"").replace(/\s+/g,"");
  let bits="";
  for(const char of normalized){const index=alphabet.indexOf(char);if(index<0)throw new Error("Invalid base32 secret");bits+=index.toString(2).padStart(5,"0");}
  const bytes:number[]=[];
  for(let index=0;index+8<=bits.length;index+=8)bytes.push(Number.parseInt(bits.slice(index,index+8),2));
  return Buffer.from(bytes);
}

function totp(secret:string,now=Date.now()){
  const counter=Math.floor(now/1000/30);const buffer=Buffer.alloc(8);buffer.writeBigUInt64BE(BigInt(counter));
  const digest=createHmac("sha1",decodeBase32(secret)).update(buffer).digest();const offset=digest[digest.length-1]&0x0f;
  const code=((digest[offset]&0x7f)<<24)|((digest[offset+1]&0xff)<<16)|((digest[offset+2]&0xff)<<8)|(digest[offset+3]&0xff);
  return String(code%1_000_000).padStart(6,"0");
}

async function createResponsiveSession(){
  expect(supabaseUrl).toBeTruthy();
  expect(supabaseKey).toBeTruthy();
  const client=createClient(supabaseUrl!,supabaseKey!,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const signedIn=await client.auth.signInWithPassword({email,password});
  expect(signedIn.error?.message??null).toBeNull();

  const factors=await client.auth.mfa.listFactors();
  expect(factors.error?.message??null).toBeNull();
  for(const factor of factors.data?.totp??[]){
    const removed=await client.auth.mfa.unenroll({factorId:factor.id});
    expect(removed.error?.message??null).toBeNull();
  }

  const enrolled=await client.auth.mfa.enroll({factorType:"totp",friendlyName:`NAT Responsivo ${randomUUID()}`});
  expect(enrolled.error?.message??null).toBeNull();
  const challenge=await client.auth.mfa.challenge({factorId:enrolled.data!.id});
  expect(challenge.error?.message??null).toBeNull();
  const verified=await client.auth.mfa.verify({factorId:enrolled.data!.id,challengeId:challenge.data!.id,code:totp(enrolled.data!.totp.secret)});
  expect(verified.error?.message??null).toBeNull();

  const assurance=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  expect(assurance.error?.message??null).toBeNull();
  expect(assurance.data?.currentLevel).toBe("aal2");
  const bootstrap=await client.rpc("bootstrap_nat_business");
  expect(bootstrap.error?.message??null).toBeNull();

  const session=(await client.auth.getSession()).data.session;
  expect(session?.access_token).toBeTruthy();
  expect(session?.refresh_token).toBeTruthy();
  return session!;
}

async function expectNoHorizontalOverflow(page:Page){
  const layout=await page.evaluate(()=>({width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width+1);
}

async function expectMainTouchTargets(page:Page){
  const controls=page.locator(".primary-button:visible,.secondary-button:visible,.icon-button:visible,.tab-button:visible,.choice-button:visible,.mobile-nav-button:visible");
  for(let index=0;index<await controls.count();index+=1){
    const box=await controls.nth(index).boundingBox();
    expect(box?.height??0).toBeGreaterThanOrEqual(44);
  }
}

async function openAuthenticatedSession(page:Page){
  const session=await createResponsiveSession();
  const storageKey=`sb-${new URL(supabaseUrl!).hostname.split(".")[0]}-auth-token`;
  await page.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:storageKey,value:session});
  await page.goto("/dashboard?view=home",{waitUntil:"domcontentloaded"});
  await expect(page.locator("header")).toBeVisible({timeout:30_000});
}

test("área autenticada permanece utilizável de 320px a desktop",async({page},testInfo)=>{
  test.setTimeout(180_000);
  await openAuthenticatedSession(page);

  const views=["home","sales","customers","intelligence","calendar","inventory","portfolio","products","pricing","identity"];
  await page.setViewportSize({width:320,height:568});
  for(const view of views){
    await page.goto(`/dashboard?view=${view}`);
    await expect(page.locator("header")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectMainTouchTargets(page);
  }

  await page.goto("/dashboard?view=home");
  await page.setViewportSize({width:320,height:568});
  await page.getByRole("button",{name:"Mais"}).click();
  const more=page.getByRole("dialog",{name:"Mais opções"});
  await expect(more).toBeVisible();
  const moreBox=await more.boundingBox();
  expect((moreBox?.y??0)+(moreBox?.height??0)).toBeLessThanOrEqual(569);
  await page.getByRole("button",{name:"Fechar menu"}).click();

  await page.getByRole("button",{name:"Buscar na NAT"}).click();
  const search=page.getByRole("dialog",{name:"Buscar na NAT"});
  await expect(search).toBeVisible();
  await page.setViewportSize({width:320,height:420});
  await page.getByLabel("Buscar na NAT").focus();
  const searchBox=await search.boundingBox();
  expect(searchBox?.y??-1).toBeGreaterThanOrEqual(0);
  expect((searchBox?.y??0)+(searchBox?.height??0)).toBeLessThanOrEqual(421);
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button",{name:"Fechar busca"}).click();

  await page.setViewportSize({width:320,height:568});
  await page.goto("/dashboard?view=products");
  await page.getByRole("button",{name:"Novo produto"}).click();
  await page.getByRole("button",{name:"Adicionar"}).click();
  const supplySelect=page.getByLabel("Insumo 1");
  await expect(supplySelect).toBeVisible();
  const supplyBox=await supplySelect.boundingBox();
  expect(supplyBox?.width??0).toBeGreaterThan(200);
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button",{name:"Fechar"}).click();

  const viewports=[{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1440,height:900}];
  for(const viewport of viewports){
    await page.setViewportSize(viewport);
    for(const view of ["home","products","intelligence"]){
      await page.goto(`/dashboard?view=${view}`);
      await expect(page.locator("header")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
    await page.goto("/dashboard?view=home");
    const screenshot=await page.screenshot({fullPage:true});
    await testInfo.attach(`dashboard-${viewport.width}x${viewport.height}`,{body:screenshot,contentType:"image/png"});
  }

  await page.setViewportSize({width:844,height:390});
  await page.goto("/dashboard?view=home");
  await page.getByRole("button",{name:"Mais"}).click();
  const landscapeMore=page.getByRole("dialog",{name:"Mais opções"});
  const landscapeBox=await landscapeMore.boundingBox();
  expect((landscapeBox?.y??0)+(landscapeBox?.height??0)).toBeLessThanOrEqual(391);
  await page.getByRole("button",{name:"Fechar menu"}).click();

  await page.setViewportSize({width:768,height:1024});
  await page.goto("/dashboard?view=products");
  const touchInput=page.locator(".nat-input:visible").first();
  if(await touchInput.count()){
    const fontSize=await touchInput.evaluate((element)=>Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
  }

  await page.setViewportSize({width:640,height:800});
  await page.goto("/dashboard?view=home");
  await page.evaluate(()=>{document.documentElement.style.fontSize="200%";});
  await expect(page.locator("header")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.evaluate(()=>{document.documentElement.style.fontSize="";});
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/dashboard?view=home");
  await expect(page.locator("aside")).toBeVisible();
  await expect(page.locator('aside nav[aria-label="Navegação principal"]')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
