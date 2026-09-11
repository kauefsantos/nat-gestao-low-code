import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const root = process.cwd();
const trackedFiles = execFileSync("git", ["ls-files", "-z"], { cwd: root })
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

const textExtensions = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".jsonc",
  ".toml", ".yml", ".yaml", ".md", ".sql", ".html", ".css", ".txt",
]);

const textFiles = trackedFiles.filter((file) =>
  file !== "package-lock.json" && (textExtensions.has(extname(file)) || file === "Dockerfile")
);

const failures = [];
const read = (file) => readFileSync(file, "utf8");

for (const file of textFiles) {
  const source = read(file);

  // Migrations públicas devem conter apenas schema/regra de negócio, nunca dados operacionais reais.
  if (file.startsWith("supabase/migrations/") && file.endsWith(".sql")) {
    const forbiddenMigrationPatterns = [
      [
        /insert\s+into\s+public\.customers\s*\(\s*business_id\s*,\s*name\s*\)/i,
        "seed direto de clientes",
      ],
      [
        /update\s+public\.customers\s+set\s+name\s*=\s*'[^']+'/i,
        "nome de cliente hardcoded",
      ],
      [
        /customer_id\s*=\s*\(\s*select\s+c\.id\s+from\s+public\.customers[\s\S]{0,300}?c\.name\s*=\s*'[^']+'/i,
        "vínculo de venda por nome de cliente hardcoded",
      ],
      [
        /backfill\s+real/i,
        "backfill declarado como dado real",
      ],
    ];

    for (const [pattern, label] of forbiddenMigrationPatterns) {
      if (pattern.test(source)) failures.push(`${file}: ${label}. Dados reais devem ser inseridos somente no banco de produção.`);
    }
  }

  // Arquivos exportados pelo app podem conter clientes, vendas e dados financeiros e nunca devem ser versionados.
  if (/nat-gestao-backup-\d{4}-\d{2}-\d{2}\.json$/i.test(file) || /nat-gestao-\d{4}-\d{2}-\d{2}\.csv$/i.test(file)) {
    failures.push(`${file}: export operacional da NAT não pode ser versionado.`);
  }
}

if (failures.length) {
  console.error("\nPublic-data privacy checks failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error("\nUse somente dados fictícios em código, migrations, testes, docs, issues e screenshots públicos.");
  process.exit(1);
}

console.log("Public-data privacy checks passed.");
