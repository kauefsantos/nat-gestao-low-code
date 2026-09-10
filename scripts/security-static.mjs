import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const read = (p) => readFileSync(join(root, p), "utf8");
const walk = (p) => readdirSync(join(root, p)).flatMap((name) => {
  const child = join(p, name);
  return statSync(join(root, child)).isDirectory() ? walk(child) : [child];
});

const sourceFiles = walk("src").filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));
const source = sourceFiles.map((file) => `${file}\n${read(file)}`).join("\n");
for (const forbidden of ["SUPABASE_SERVICE_ROLE_KEY", "sb_secret_", "service_role"]) {
  if (source.includes(forbidden)) failures.push(`Segredo/cliente administrativo proibido em src: ${forbidden}`);
}
if (source.includes("dangerouslySetInnerHTML")) failures.push("dangerouslySetInnerHTML exige revisão explícita de segurança.");
const store = read("src/hooks/use-nat-store.ts");
if (store.includes("localStorage.setItem")) failures.push("Dados financeiros não podem ser persistidos em localStorage.");
const signup = read("src/routes/signup.tsx");
if (!signup.includes("minLength={12}")) failures.push("Cadastro deve exigir no mínimo 12 caracteres na interface.");
const migrations = walk("supabase/migrations").filter((f) => f.endsWith(".sql")).map(read).join("\n").toLowerCase();
for (const required of [
  "enable row level security",
  "private.is_business_member",
  "private.is_business_admin",
  "'aal2'",
  "revoke all on all tables in schema public from anon",
  "revoke insert, update, delete on public.sales from authenticated",
  "revoke insert, update, delete on public.sale_items from authenticated",
  "revoke update, delete on public.supply_purchases from authenticated",
  "v_unit_cost :=",
  "v_contribution :=",
]) {
  if (!migrations.includes(required.toLowerCase())) failures.push(`Fundação de segurança ausente: ${required}`);
}
const latestHardening = read("supabase/migrations/20260910015000_nat_integrity_hardening.sql").toLowerCase();
const saveSaleStart = latestHardening.indexOf("create or replace function public.save_sale(");
const saveSaleEnd = latestHardening.indexOf("create or replace function public.delete_sale", saveSaleStart);
const saveSale = saveSaleStart >= 0 && saveSaleEnd > saveSaleStart ? latestHardening.slice(saveSaleStart, saveSaleEnd) : "";
for (const forbiddenParam of ["p_unit_cost_snapshot", "p_variable_fee_snapshot", "p_contribution_snapshot"]) {
  if (saveSale.includes(forbiddenParam)) failures.push(`save_sale não pode confiar em snapshot enviado pelo navegador: ${forbiddenParam}`);
}
if (!saveSale.includes("security definer") || !saveSale.includes("private.is_business_member")) failures.push("save_sale autoritativo precisa validar membership explicitamente.");
const workflow = read(".github/workflows/ci.yml");
if (!workflow.includes("supabase@2.117.0 test db")) failures.push("CI precisa executar os testes reais de RLS.");
if (!workflow.includes("npm run typecheck")) failures.push("CI precisa executar typecheck.");
if (failures.length) {
  console.error("\nSecurity static checks failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Security static checks passed.");
