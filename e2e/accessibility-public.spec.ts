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

test("campo de login apresenta indicador visual de foco",async({page})=>{
  await page.goto("/login");
  const input=page.getByLabel("E-mail");
  await input.focus();
  await expect(input).toBeFocused();
  const indicator=await input.evaluate((element)=>{
    const style=getComputedStyle(element);
    return {outlineStyle:style.outlineStyle,outlineWidth:style.outlineWidth,boxShadow:style.boxShadow};
  });
  const hasOutline=indicator.outlineStyle!=="none"&&Number.parseFloat(indicator.outlineWidth)>0;
  const hasShadow=indicator.boxShadow!=="none";
  expect(hasOutline||hasShadow).toBeTruthy();
});

test("texto de formulário mantém tamanho legível",async({page})=>{
  await page.goto("/login");
  const input=page.getByLabel("E-mail");
  const size=await input.evaluate((element)=>Number.parseFloat(getComputedStyle(element).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
});
