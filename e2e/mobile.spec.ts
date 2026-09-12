import { expect, test } from "@playwright/test";

const publicPaths=["/","/login","/signup","/forgot-password","/reset-password"];

for(const path of publicPaths){
  test(`${path} não cria rolagem lateral nem zoom involuntário`,async({page},testInfo)=>{
    await page.goto(path);
    await expect(page.locator("body")).toBeVisible();
    const layout=await page.evaluate(()=>({width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth}));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width+1);

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
  await page.goto("/login");
  const content=await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(content).toContain("width=device-width");
  expect(content).toContain("initial-scale=1");
  expect(content).toContain("viewport-fit=cover");
});
