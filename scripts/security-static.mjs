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
const migrations = walk("supabase/migrations").filter((f) => f.endsWith(".sql")).map(read).join("\n");
for (const required of ["enable row level security", "private.is_business_member", "private.is_business_admin", "'aal2'", "revoke all on all tables in schema public from anon"]) {
  if (!migrations.toLowerCase().includes(required.toLowerCase())) failures.push(`Fundação de segurança ausente: ${required}`);
}
if (failures.length) {
  console.error("\nSecurity static checks failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Security static checks passed.");
