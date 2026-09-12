import { readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join } from "node:path";

const root = process.cwd();
const failures = [];
const read = (p) => readFileSync(join(root, p), "utf8");
const walk = (p) => readdirSync(join(root, p)).flatMap((name) => {
  const child = join(p, name);
  return statSync(join(root, child)).isDirectory() ? walk(child) : [child];
});

// Public-repository guardrails. Scan tracked text files, not only browser/runtime code,
// so accidental credentials in docs, migrations or config are rejected by CI too.
const trackedFiles = execFileSync("git", ["ls-files", "-z"], { cwd: root })
  .toString("utf8")
  .split("\0")
  .filter(Boolean);
const forbiddenTrackedEnv = trackedFiles.filter((file) => {
  const name = file.split("/").at(-1) ?? "";
  return (name === ".env" || name.startsWith(".env.")) && name !== ".env.example";
});
if (forbiddenTrackedEnv.length) failures.push(`Arquivo de ambiente real versionado: ${forbiddenTrackedEnv.join(", ")}`);
for (const file of trackedFiles) {
  if (/\.(?:pem|key|p12|pfx)$/i.test(file)) failures.push(`Material de chave privada não deve ser versionado: ${file}`);
}
const textExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".jsonc", ".toml", ".yml", ".yaml", ".md", ".sql", ".html", ".css", ".txt", ".example"]);
const publicScanFiles = trackedFiles.filter((file) => file !== "scripts/security-static.mjs" && file !== "package-lock.json" && (textExtensions.has(extname(file)) || file.endsWith(".env.example") || file === "Dockerfile"));
const publicSource = publicScanFiles.map((file) => `${file}\n${read(file)}`).join("\n");
for (const [label, pattern] of [
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{12,}/],
  ["OpenAI API key", /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
  ["GitHub classic token", /ghp_[A-Za-z0-9]{20,}/],
  ["GitHub fine-grained token", /github_pat_[A-Za-z0-9_]{20,}/],
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  ["Google API key", /AIza[0-9A-Za-z_-]{30,}/],
  ["Stripe live secret", /sk_live_[A-Za-z0-9]{20,}/],
  ["Private key block", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["Hardcoded Supabase service role", /SUPABASE_SERVICE_ROLE_KEY\s*=\s*["'][A-Za-z0-9._-]{20,}["']/],
]) {
  if (pattern.test(publicSource)) failures.push(`${label} aparentemente hardcoded em arquivo versionado.`);
}

const sourceFiles = walk("src").filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));
const source = sourceFiles.map((file) => `${file}\n${read(file)}`).join("\n");
const browserSourceFiles = sourceFiles.filter((file) => !file.endsWith(".server.ts"));
const browserSource = browserSourceFiles.map((file) => `${file}\n${read(file)}`).join("\n");
for (const forbidden of ["SUPABASE_SERVICE_ROLE_KEY", "service_role"]) {
  if (browserSource.includes(forbidden)) failures.push(`Cliente administrativo proibido em código de browser: ${forbidden}`);
}
if (/sb_secret_[A-Za-z0-9_-]{12,}/.test(source)) failures.push("Supabase secret key aparentemente hardcoded em src.");
if (source.includes("dangerouslySetInnerHTML")) failures.push("dangerouslySetInnerHTML exige revisão explícita de segurança.");

const functionFiles = walk("supabase/functions").filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));
const functionSource = functionFiles.map((file) => `${file}\n${read(file)}`).join("\n");
for (const [label, pattern] of [
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{12,}/],
  ["OpenAI API key", /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
]) {
  if (pattern.test(functionSource)) failures.push(`${label} aparentemente hardcoded em supabase/functions.`);
}

const login = read("src/routes/login.tsx");
if (!login.includes("new URL(target, window.location.origin)") || !login.includes("destination.origin !== window.location.origin") || !login.includes('target.includes("\\\\")')) {
  failures.push("Redirect pós-login precisa validar origem e rejeitar backslashes.");
}

const resetPassword = read("src/routes/reset-password.tsx");
if (!resetPassword.includes('event==="PASSWORD_RECOVERY"&&session') || resetPassword.includes("supabase.auth.getSession().then")) {
  failures.push("Reset de senha só pode ser liberado por evento PASSWORD_RECOVERY, não por sessão genérica.");
}

// The cron secret is now rotatable in Lovable Cloud/Vault. The dispatcher may create its
// backend-only client to retrieve that one secret, but must validate it before reading VAPID
// configuration or processing any delivery. Generic apikey/service-key request auth is forbidden.
const pushDispatcher = read("supabase/functions/nat-push-dispatch/index.ts");
const adminClient = pushDispatcher.indexOf("const admin = createClient");
const cronSecretLookup = pushDispatcher.indexOf('admin.rpc("get_push_cron_secret")');
const suppliedSecret = pushDispatcher.indexOf('req.headers.get("x-nat-cron-secret")');
const secretComparison = pushDispatcher.indexOf("secureEqual(suppliedSecret, expectedSecret)");
const privilegedConfig = pushDispatcher.indexOf('admin.rpc("get_push_backend_config")');
if (adminClient < 0 || cronSecretLookup < adminClient || suppliedSecret < cronSecretLookup || secretComparison < suppliedSecret) {
  failures.push("Push dispatcher precisa buscar o segredo dedicado e validá-lo antes de operações privilegiadas.");
}
if (privilegedConfig < 0 || privilegedConfig < secretComparison) {
  failures.push("Push dispatcher não pode consultar configuração VAPID antes de autenticar o cron.");
}
if (pushDispatcher.includes('req.headers.get("apikey")') || pushDispatcher.includes("CRON_SECRET_SHA256")) {
  failures.push("Push dispatcher não pode autenticar cron por service-key genérica nem hash fixo compilado.");
}
if (!pushDispatcher.includes("secureEqual") || !pushDispatcher.includes('admin.rpc("get_push_cron_secret")')) {
  failures.push("Segredo do cron deve vir da fonte segura rotacionável e ser comparado em constant-time.");
}

const start = read("src/start.ts");
const router = read("src/router.tsx");
if (!start.includes("nonce-${nonce}") || start.includes("script-src 'self' 'unsafe-inline'")) {
  failures.push("CSP precisa usar nonce por requisição e não permitir unsafe-inline em script-src.");
}
if (!router.includes("ssr: { nonce: getCspNonce() }") || !start.includes("createCsrfMiddleware")) {
  failures.push("Nonce CSP deve ser propagado ao SSR e o middleware CSRF deve permanecer ativo.");
}

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
if (!workflow.includes("deno check") || !workflow.includes("deno lint") || !workflow.includes("supabase/functions")) failures.push("CI precisa validar as Edge Functions com Deno.");
if (failures.length) {
  console.error("\nSecurity static checks failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Security static checks passed.");
