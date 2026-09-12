import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const email="responsive@example.test";
const password="NAT-RLS-e2e-2026!";

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
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button",{name:"Entrar"}).click();
  await expect(page.getByRole("heading",{name:"Ative a proteção extra"})).toBeVisible();
  const secret=(await page.locator("p.break-all").textContent())?.trim();
  expect(secret).toBeTruthy();
  await page.getByLabel("Código de segurança").fill(totp(secret!));
  await page.getByRole("button",{name:"Ativar e entrar"}).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.locator("header")).toBeVisible();
}

test("área autenticada permanece utilizável de 320px a desktop",async({page})=>{
  test.setTimeout(90_000);
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

  for(const viewport of [{width:390,height:844},{width:768,height:1024},{width:1440,height:900}]){
    await page.setViewportSize(viewport);
    for(const view of ["home","products","intelligence"]){
      await page.goto(`/dashboard?view=${view}`);
      await expect(page.locator("header")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  }

  await page.setViewportSize({width:768,height:1024});
  await page.goto("/dashboard?view=products");
  const touchInput=page.locator(".nat-input:visible").first();
  if(await touchInput.count()){
    const fontSize=await touchInput.evaluate((element)=>Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
  }

  await page.setViewportSize({width:1440,height:900});
  await page.goto("/dashboard?view=home");
  await expect(page.locator("aside")).toBeVisible();
  await expect(page.locator('nav[aria-label="Navegação principal"]').last()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
