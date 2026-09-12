import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(path:string)=>readFileSync(path,"utf8");

test("ROI usa retorno líquido sobre custo investido sem contar aporte como custo",()=>{
  const roi=read("src/domain/roi.ts");
  assert.match(roi,/netReturn\/investedCost\*100/);
  assert.match(roi,/productCost\+fee\+delivery/);
  assert.doesNotMatch(roi,/ownerContributions/);
});

test("ROI por sabor usa snapshots das vendas concluídas",()=>{
  const roi=read("src/domain/roi.ts");
  assert.match(roi,/line\.unitCostSnapshot\*line\.quantity/);
  assert.match(roi,/sale\.variableFeeSnapshot/);
  assert.match(roi,/sale\.deliveryCostSnapshot/);
  assert.match(roi,/sale\.status!=="cancelled"/);
});

test("ROI aparece no financeiro e na inteligência",()=>{
  const financial=read("src/components/nat/FinancialOverview.tsx");
  const intelligence=read("src/components/nat/IntelligenceWorkbench.tsx");
  const panel=read("src/components/nat/RoiOverview.tsx");
  assert.match(financial,/RoiOverview/);
  assert.match(intelligence,/RoiOverview/);
  assert.match(panel,/ROI por sabor/);
  assert.match(panel,/ROI do mês/);
});
