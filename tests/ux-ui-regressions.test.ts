import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source=(path:string)=>readFileSync(path,"utf8");

test("fluxos auditados não usam confirmações nativas do navegador",()=>{
  for(const path of ["src/components/nat/CalendarView.tsx","src/components/nat/CustomersView.tsx","src/components/nat/SalesHistoryView.tsx"]){
    const text=source(path);
    assert.equal(text.includes("window.confirm("),false,`${path} ainda usa window.confirm`);
    assert.equal(text.includes("window.prompt("),false,`${path} ainda usa window.prompt`);
  }
});

test("cadastros financeiros e operacionais têm trava de duplo envio e id estável",()=>{
  const supply=source("src/components/nat/SupplySheet.tsx");
  const product=source("src/components/nat/ProductEditorSheet.tsx");
  const expense=source("src/components/nat/ExpenseEditorSheet.tsx");
  const customer=source("src/components/nat/CustomersView.tsx");
  const calendar=source("src/components/nat/CalendarView.tsx");
  assert.match(supply,/useSubmitGuard/);assert.match(supply,/\[draftId\]/);assert.match(supply,/Salvando compra/);
  assert.match(product,/useSubmitGuard/);assert.match(product,/\[draftId\]/);assert.match(product,/Salvando produto/);
  assert.match(expense,/useSubmitGuard/);assert.match(expense,/\[draftId\]/);assert.match(expense,/Salvando gasto/);
  assert.match(customer,/useSubmitGuard/);assert.match(customer,/\[draftId\]/);assert.match(customer,/Salvando cliente/);
  assert.match(calendar,/\[draftId\]/);assert.match(calendar,/if\(saving\|\|!title\.trim\(\)\)return/);assert.match(calendar,/Aguarde a confirmação antes de fechar/);
});

test("terminologia e CTAs principais são claros no mobile",()=>{
  const shell=source("src/components/nat/AppShell.tsx");
  const products=source("src/components/nat/ProductsView.tsx");
  const sales=source("src/components/nat/SalesHistoryView.tsx");
  assert.match(shell,/Vendas e saídas/);assert.match(shell,/label:"Agenda"/);assert.match(shell,/Produtos e compras/);assert.match(shell,/Buscar na NAT/);
  assert.match(products,/> Nova compra</);assert.match(products,/> Novo produto</);assert.match(products,/> Novo gasto</);
  assert.match(sales,/Registrar venda ou saída/);
});

test("modo rápido de venda preserva detalhes avançados e resumo antes de salvar",()=>{
  const sale=source("src/components/nat/SaleOrderSheet.tsx");
  assert.match(sale,/Mais detalhes/);assert.match(sale,/Resumo antes de salvar/);assert.match(sale,/Registrar venda/);assert.match(sale,/saleIdRef/);assert.match(sale,/submittingRef/);
});

test("Home é orientada à ação, personalizável e oferece repetição de tarefas",()=>{
  const home=source("src/components/nat/HomeOperations.tsx");
  assert.match(home,/O que precisa de atenção/);assert.match(home,/Repetir última venda/);assert.match(home,/nat-home-preferences-v1/);assert.match(home,/Registrar compra/);assert.match(home,/Definir preço/);
});

test("busca global, ajuda contextual, desfazer e fluxos guiados permanecem disponíveis",()=>{
  const search=source("src/components/nat/GlobalSearchSheet.tsx");
  const feedback=source("src/components/nat/Feedback.tsx");
  const app=source("src/app/NatApp.tsx");
  assert.match(search,/Cliente, produto, ingrediente ou venda/);assert.match(feedback,/export function HelpTip/);assert.match(app,/actionLabel:"Desfazer"/);assert.match(app,/Usar em uma receita/);assert.match(app,/Conferir preço/);assert.match(app,/Venda registrada:/);
});

test("análises começam por recomendações acionáveis e escondem detalhe denso por padrão",()=>{
  const intelligence=source("src/components/nat/IntelligenceWorkbench.tsx");
  assert.match(intelligence,/O que merece atenção/);assert.match(intelligence,/Ver todos os indicadores/);assert.match(intelligence,/<details/);
});
