import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source=(path:string)=>readFileSync(path,"utf8");

test("touch targets e inputs touch mantêm dimensões seguras",()=>{
  const css=source("src/styles.css");
  assert.match(css,/\.icon-button \{[^}]*height:44px; width:44px;/);
  assert.match(css,/\.tab-button \{ min-height:44px;/);
  assert.match(css,/\.mobile-nav-button \{[^}]*min-height:44px;/);
  assert.match(css,/@media \(pointer:coarse\)\{\.nat-input\{font-size:16px;\}\}/);
  assert.match(css,/button,a,summary \{ touch-action:manipulation; \}/);
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

test("matriz E2E cobre celular compacto tablet desktop WebKit e Firefox",()=>{
  const config=source("playwright.config.ts");
  const workflow=source(".github/workflows/mobile-e2e.yml");
  assert.match(config,/width: 320, height: 568/);
  assert.match(config,/width: 768, height: 1024/);
  assert.match(config,/width: 1440, height: 900/);
  assert.match(config,/browserName: "webkit"/);
  assert.match(config,/browserName: "firefox"/);
  assert.match(workflow,/playwright install --with-deps chromium firefox webkit/);
  assert.match(workflow,/responsive-authenticated\.spec\.ts/);
});
