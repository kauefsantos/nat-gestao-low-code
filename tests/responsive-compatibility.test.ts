import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source=(path:string)=>readFileSync(path,"utf8");

test("touch targets e inputs touch mantêm dimensões seguras",()=>{
  const css=source("src/styles.css");
  assert.match(css,/\.icon-button \{[^}]*height:44px; width:44px;/);
  assert.match(css,/\.tab-button \{ min-height:44px;/);
  assert.match(css,/\.mobile-nav-button \{[^}]*min-height:44px;/);
  assert.match(css,/@media \(pointer:coarse\)[\s\S]*?\.nat-input\{font-size:16px;\}/);
  assert.match(css,/@media \(pointer:coarse\)[\s\S]*?button,summary\{min-height:44px;\}/);
  assert.match(css,/button,a,summary \{ touch-action:manipulation; \}/);
  assert.match(css,/\.nat-input \{[^}]*min-width:0;/);
});

test("hover visual só é aplicado quando há ponteiro fino",()=>{
  const css=source("src/styles.css");
  assert.match(css,/@media \(hover:hover\) and \(pointer:fine\)/);
});

test("formulário de receita quebra a linha em celulares estreitos",()=>{
  const product=source("src/components/nat/ProductEditorSheet.tsx");
  assert.match(product,/grid-cols-\[minmax\(0,1fr\)_74px_44px\]/);
  assert.match(product,/col-span-3 min-w-0 sm:col-span-1/);
  assert.match(product,/sm:grid-cols-\[minmax\(0,1fr\)_82px_76px_44px\]/);
});

test("diálogos críticos suportam viewport reduzido e safe area",()=>{
  const feedback=source("src/components/nat/Feedback.tsx");
  const sales=source("src/components/nat/SalesHistoryView.tsx");
  const search=source("src/components/nat/GlobalSearchSheet.tsx");
  const css=source("src/styles.css");
  assert.match(feedback,/max-h-\[100dvh\].*overflow-y-auto/);
  assert.match(sales,/max-h-\[100dvh\].*overflow-y-auto/);
  assert.match(search,/max-h-\[calc\(100dvh-32px\)\].*overflow-y-auto/);
  assert.match(css,/inventory-balance-title/);
  assert.match(css,/inventory-production-title/);
});

test("shell evita safe area duplicada e protege o botão flutuante",()=>{
  const shell=source("src/components/nat/AppShell.tsx");
  assert.match(shell,/style=\{\{right:"max\(16px, env\(safe-area-inset-right\)\)"/);
  assert.match(shell,/max-h-\[100dvh\].*overflow-y-auto/);
  assert.match(shell,/max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6/);
});

test("matriz E2E cobre celular compacto tablet desktop paisagem WebKit e Firefox",()=>{
  const config=source("playwright.config.ts");
  const authenticated=source("e2e/responsive-authenticated.spec.ts");
  const workflow=source(".github/workflows/mobile-e2e.yml");
  assert.match(config,/width: 320, height: 568/);
  assert.match(config,/width: 768, height: 1024/);
  assert.match(config,/width: 1440, height: 900/);
  assert.match(config,/name: "mobile-webkit"/);
  assert.match(config,/name: "desktop-webkit"/);
  assert.match(config,/browserName: "firefox"/);
  assert.match(config,/workers: process\.env\.CI \? 1 : undefined/);
  assert.match(authenticated,/width:844,height:390/);
  assert.match(authenticated,/fontSize="200%"/);
  assert.match(workflow,/playwright install --with-deps chromium firefox webkit/);
  assert.match(workflow,/responsive-authenticated\.spec\.ts/);
});

test("páginas públicas esperam CSS antes de medir toque e geram evidência visual",()=>{
  const mobile=source("e2e/mobile.spec.ts");
  assert.match(mobile,/--color-cream/);
  assert.match(mobile,/fontSize="200%"/);
  assert.match(mobile,/testInfo\.attach/);
  assert.doesNotMatch(mobile,/locator\("body"\)\.toBeVisible/);
});

test("importação CSV usa confirmação acessível e trava repetição durante aplicação",()=>{
  const importer=source("src/components/nat/RecipeCsvImporter.tsx");
  assert.match(importer,/ConfirmDialog/);
  assert.match(importer,/applying/);
  assert.match(importer,/Substituir receita atual\?/);
  assert.doesNotMatch(importer,/window\.confirm/);
});

test("editores legados de produto e gasto foram removidos de Sheets",()=>{
  const sheets=source("src/components/nat/Sheets.tsx");
  assert.match(sheets,/export function SettingsSheet/);
  assert.doesNotMatch(sheets,/export function ProductSheet/);
  assert.doesNotMatch(sheets,/export function ExpenseSheet/);
  assert.doesNotMatch(sheets,/RecipeCsvImporter/);
});

test("política de compatibilidade e smoke real estão documentados",()=>{
  const policy=source("docs/RESPONSIVE_COMPATIBILITY.md");
  const smoke=source("docs/REAL_DEVICE_SMOKE.md");
  assert.match(policy,/duas versões principais estáveis mais recentes/);
  assert.match(policy,/Chromium/);
  assert.match(policy,/Firefox/);
  assert.match(policy,/WebKit/);
  assert.match(policy,/200%/);
  assert.match(smoke,/iPhone/);
  assert.match(smoke,/iPad/);
  assert.match(smoke,/Android/);
  assert.match(smoke,/Edge/);
  assert.match(smoke,/Safari/);
});
