import { expect, test, type Page } from "@playwright/test";

const publicPaths=["/","/login","/signup","/forgot-password","/reset-password"];

async function waitForPublicSurface(page:Page,path:string){
  await page.goto(path,{waitUntil:"domcontentloaded"});
  await expect(page.locator("main")).toBeVisible({timeout:15_000});
  await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue("--color-cream").trim().length>0,null,{timeout:15_000});
}

async function expectNoHorizontalOverflow(page:Page){
  const layout=await page.evaluate(()=>({width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width+1);
}

for(const path of publicPaths){
  test(`${path} não cria rolagem lateral nem zoom involuntário`,async({page},testInfo)=>{
    await waitForPublicSurface(page,path);
    await expectNoHorizontalOverflow(page);

    const touch=Boolean(testInfo.project.use.hasTouch);
    const fields=page.locator("input:visible, select:visible, textarea:visible");
    if(touch){
      for(let index=0;index<await fields.count();index+=1){
        const fontSize=await fields.nth(index).evaluate((element)=>Number.parseFloat(getComputedStyle(element).fontSize));
        expect(fontSize).toBeGreaterThanOrEqual(16);
      }
    }

    const submit=page.locator('button[type="submit"]:visible').first();
    if(await submit.count()){
      const box=await submit.boundingBox();
      expect(box?.height??0).toBeGreaterThanOrEqual(44);
    }

    if(touch){
      const controls=page.locator(".primary-button:visible,.secondary-button:visible,.text-button:visible,.icon-button:visible,.tab-button:visible,.choice-button:visible,.mobile-nav-button:visible");
      for(let index=0;index<await controls.count();index+=1){
        const box=await controls.nth(index).boundingBox();
        expect(box?.height??0).toBeGreaterThanOrEqual(44);
      }
    }
  });
}

test("viewport meta preserva safe-area e escala correta",async({page})=>{
  await waitForPublicSurface(page,"/login");
  const content=await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(content).toContain("width=device-width");
  expect(content).toContain("initial-scale=1");
  expect(content).toContain("viewport-fit=cover");
});

test("fonte ampliada a 200% mantém login utilizável",async({page})=>{
  await waitForPublicSurface(page,"/login");
  await page.evaluate(()=>{document.documentElement.style.fontSize="200%";});
  await expect(page.getByRole("heading",{name:"Bem-vinda de volta"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Entrar"})).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("gera evidência visual da tela pública por projeto",async({page},testInfo)=>{
  await waitForPublicSurface(page,"/login");
  const screenshot=await page.screenshot({fullPage:true});
  await testInfo.attach(`login-${testInfo.project.name}`,{body:screenshot,contentType:"image/png"});
});
