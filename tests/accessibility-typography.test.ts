import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(path:string)=>fs.readFileSync(path,"utf8");

test("WCAG 2.2 AA: navegação tem skip link, foco de rota e aria-current",()=>{
  const source=read("src/components/nat/AppShell.tsx");
  assert.match(source,/Pular para o conteúdo principal/);
  assert.match(source,/id="main-content"/);
  assert.match(source,/tabIndex=\{-1\}/);
  assert.match(source,/document\.title=/);
  assert.match(source,/aria-current=\{active\?"page":undefined\}/);
});

test("WCAG 2.2 AA: estilos preservam contraste, foco, legibilidade e forced colors",()=>{
  const css=read("src/styles.css");
  assert.match(css,/\.nat-input[^}]*border:1px solid #956454/s);
  assert.match(css,/\.nat-input[^}]*font-size:16px/s);
  assert.match(css,/\.field-label[^}]*font-size:14px/s);
  assert.match(css,/\.field-help[^}]*font-size:14px/s);
  assert.match(css,/outline:3px solid #55281B/);
  assert.match(css,/@media \(forced-colors:active\)/);
});

test("Tipografia: hierarquia mantém display editorial e números tabulares",()=>{
  const css=read("src/styles.css");
  assert.match(css,/font-variant-numeric:tabular-nums/);
  assert.match(css,/body[^}]*line-height:1\.55/s);
  assert.match(css,/\.font-display[^}]*GFS Didot[^}]*font-weight:400/s);
  assert.match(css,/\.section-title[^}]*font-size:clamp\(/s);
  assert.match(css,/\.primary-button[^}]*font-weight:700/s);
  assert.match(css,/\.field-label[^}]*font-weight:700/s);
});

test("WCAG 2.2 AA: busca anuncia resultados e define foco inicial",()=>{
  const source=read("src/components/nat/GlobalSearchSheet.tsx");
  assert.match(source,/role="status"/);
  assert.match(source,/aria-live="polite"/);
  assert.match(source,/initialFocusRef:searchInputRef/);
  assert.doesNotMatch(source,/autoFocus/);
});

test("WCAG 2.2 AA: diálogo permite foco inicial explícito e mantém trap",()=>{
  const source=read("src/hooks/use-dialog-a11y.ts");
  assert.match(source,/initialFocusRef/);
  assert.match(source,/event\.key === "Escape"/);
  assert.match(source,/event\.key !== "Tab"/);
  assert.match(source,/previousFocus\?\.focus/);
});

test("WCAG 2.2 AA: formulários principais associam erro ao campo",()=>{
  for(const path of ["src/components/nat/SaleOrderSheet.tsx","src/components/nat/ProductEditorSheet.tsx","src/components/nat/SupplySheet.tsx","src/components/nat/CustomersView.tsx","src/components/nat/Sheets.tsx"]){
    const source=read(path);
    assert.match(source,/aria-invalid=/,`${path} precisa marcar campo inválido`);
    assert.match(source,/aria-describedby=/,`${path} precisa ligar campo e mensagem`);
    assert.match(source,/role="alert"/,`${path} precisa anunciar erro`);
  }
});

test("Acessibilidade cognitiva: interface principal não expõe jargões evitáveis",()=>{
  const login=read("src/routes/login.tsx");
  const app=read("src/app/NatApp.tsx");
  const calendar=read("src/components/nat/CalendarView.tsx");
  const supply=read("src/components/nat/SupplySheet.tsx");
  assert.doesNotMatch(login,/bypass de MFA|variáveis públicas do Supabase/i);
  assert.match(app,/Status do sistema/);
  assert.match(calendar,/Lembretes no celular/);
  assert.doesNotMatch(calendar,/Web Push/);
  assert.match(supply,/Outro material/);
});

test("Acessibilidade: ajuda contextual não usa details interativo aninhado",()=>{
  const feedback=read("src/components/nat/Feedback.tsx");
  const product=read("src/components/nat/ProductEditorSheet.tsx");
  assert.match(feedback,/aria-expanded=\{open\}/);
  assert.match(feedback,/role="note"/);
  assert.doesNotMatch(feedback,/<details className="group/);
  assert.doesNotMatch(product,/<summary[^>]*>[^<]*Custos[^<]*<HelpTip/s);
});

test("Acessibilidade: redefinição de senha não redireciona automaticamente",()=>{
  const source=read("src/routes/reset-password.tsx");
  assert.doesNotMatch(source,/setTimeout\(.*login/);
  assert.match(source,/Entrar com a nova senha/);
});

test("Contraste: agenda não reduz opacidade de texto concluído ou cancelado",()=>{
  const source=read("src/components/nat/CalendarView.tsx");
  assert.doesNotMatch(source,/opacity-55|opacity-70/);
  assert.match(source,/Concluído/);
});

test("UX: scrollbar lateral é delicada, sem fundo e sem setas",()=>{
  const css=read("src/styles.css");
  assert.match(css,/scrollbar-color:rgba\(122,73,57,\.38\) transparent/);
  assert.match(css,/::-webkit-scrollbar-track\s*\{[^}]*background:transparent/s);
  assert.match(css,/::-webkit-scrollbar-thumb\s*\{[^}]*border-radius:999px/s);
  assert.match(css,/::-webkit-scrollbar-button\s*\{[^}]*display:none[^}]*width:0[^}]*height:0/s);
});

test("UX: identidade visual usa uma coluna, ícones compactos e hierarquia regular",()=>{
  const source=read("src/components/nat/BrandGuideView.tsx");
  const css=read("src/styles.css");
  assert.doesNotMatch(source,/lg:grid-cols-2/);
  assert.match(source,/brand-guide-panel-header/);
  assert.match(source,/brand-guide-panel-description/);
  assert.match(css,/\.brand-guide-panel-header[^}]*display:flex/s);
  assert.match(css,/\.brand-guide-panel-icon[^}]*width:28px[^}]*height:28px/s);
  assert.match(css,/\.brand-guide-panel-icon svg[^}]*width:11px[^}]*height:11px/s);
  assert.match(css,/\.brand-guide-panel-title[^}]*font-size:clamp\(1\.35rem,1\.25rem \+ \.35vw,1\.65rem\)/s);
  assert.match(css,/\.brand-guide-panel-description[^}]*text-align:justify/s);
  assert.match(css,/\.brand-guide-panel-toggle[^}]*min-height:34px[^}]*font-size:12px/s);
});

test("UX: identidade visual não exibe criador de conteúdo",()=>{
  const source=read("src/components/nat/BrandGuideView.tsx");
  assert.doesNotMatch(source,/ContentStudio/);
  assert.doesNotMatch(source,/Criar conteúdo|Monte seu conteúdo da NAT/);
});
