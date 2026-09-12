import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { Session } from "@supabase/supabase-js";

const supabaseUrl=process.env.VITE_SUPABASE_URL;
const responsiveSessionPath=".test-build/responsive-aal2-session.json";

test.describe.configure({retries:0});

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
  expect(supabaseUrl).toBeTruthy();
  expect(existsSync(responsiveSessionPath),"A sessão AAL2 deve ser preparada pelo E2E de autorização antes do teste responsivo.").toBe(true);
  const session=JSON.parse(readFileSync(responsiveSessionPath,"utf8")) as Session;
  expect(session.access_token).toBeTruthy();
  expect(session.refresh_token).toBeTruthy();
  expect(session.user?.id).toBeTruthy();

  const storageKey=`sb-${new URL(supabaseUrl!).hostname.split(".")[0]}-auth-token`;
  await page.addInitScript(({key,value})=>{
    window.localStorage.setItem(key,JSON.stringify(value));
  },{key:storageKey,value:session});

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
