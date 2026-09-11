import { expect, test } from "@playwright/test";
for (const path of ["/login", "/signup"]) {
  test(`${path} cabe em uma tela de iPhone sem zoom ou rolagem lateral`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("body")).toBeVisible();
    const layout = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
    const fields = page.locator("input:visible");
    for (let index = 0; index < await fields.count(); index += 1) {
      const fontSize = await fields.nth(index).evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
      expect(fontSize).toBeGreaterThanOrEqual(16);
    }
    const submit = page.locator('button[type="submit"]:visible').first();
    if (await submit.count()) {
      const box = await submit.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
}
