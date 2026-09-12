import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const publicPaths=["/","/login","/signup","/forgot-password","/reset-password"];

for(const path of publicPaths){
  test(`WCAG AA sem violações sérias/críticas em ${path}`,async({page})=>{
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const results=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze();
    const blocking=results.violations.filter((violation)=>violation.impact==="serious"||violation.impact==="critical");
    expect(blocking,blocking.map((violation)=>`${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
  });
}

test("foco visível permanece identificável por teclado no login",async({page})=>{
  await page.goto("/login");
  await page.keyboard.press("Tab");
  const focused=page.locator(":focus");
  await expect(focused).toBeVisible();
  const outline=await focused.evaluate((element)=>getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe("none");
});

test("texto de formulário mantém tamanho legível",async({page})=>{
  await page.goto("/login");
  const input=page.getByLabel("E-mail");
  const size=await input.evaluate((element)=>Number.parseFloat(getComputedStyle(element).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
});
