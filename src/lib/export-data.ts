import { paymentLabel, type NatState } from "../domain/nat.js";
import { buildPrivacySafeBackup } from "../domain/privacy.js";

export { buildPrivacySafeBackup } from "../domain/privacy.js";

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function today() { return new Date().toISOString().slice(0, 10); }

export function exportNatCsv(state: NatState) {
  const headers = ["tipo", "data", "nome", "categoria", "quantidade", "unidade", "valor", "pagamento", "status", "observacao"];
  const rows: unknown[][] = [];
  for (const sale of state.sales) rows.push(["venda",sale.soldAt.slice(0,10),sale.productName,"",sale.quantity,"un",sale.totalReceived,paymentLabel[sale.paymentMethod],sale.status,sale.cancelReason??""]);
  for (const supply of state.supplies) rows.push(["compra",supply.purchasedAt.slice(0,10),supply.name,supply.category,supply.packageQuantity,supply.packageUnit,supply.packagePrice,"","",""]);
  for (const product of state.products) rows.push(["produto","",product.name,product.portfolioKey??"personalizado",product.batchYield,"rendimento",product.sellingPrice,"",product.available===false?"pausado":"ativo",`${product.recipe.length} itens na receita`]);
  for (const expense of state.expenses) rows.push(["gasto",expense.spentAt.slice(0,10),expense.name,"esporadico","","",expense.amount,"","",""]);
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\n")}`;
  download(`nat-gestao-${today()}.csv`, csv, "text/csv;charset=utf-8");
}

export function exportNatBackup(state: NatState) {
  download(`nat-gestao-backup-${today()}.json`,JSON.stringify(buildPrivacySafeBackup(state),null,2),"application/json;charset=utf-8");
}