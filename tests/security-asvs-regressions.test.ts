import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("guard autenticado exige sessão AAL2 antes de liberar a rota", () => {
  const source = read("src/hooks/use-auth.ts");
  assert.match(source, /payload\.aal === "aal2"/);
  assert.match(source, /Boolean\(session\) && sessionHasAal2\(session\)/);
});

test("Edge Function de IA rejeita sessão revogada", () => {
  const source = read("supabase/functions/nat-content-ai/index.ts");
  assert.match(source, /session_id/);
  assert.match(source, /is_active_auth_session_for_user/);
  assert.match(source, /sessionResult\.data !== true/);
});

test("hardening de sessão valida auth.sessions no banco", () => {
  const source = read("supabase/migrations/20260912001500_asvs_session_hardening.sql");
  assert.match(source, /from auth\.sessions/);
  assert.match(source, /private\.has_active_auth_session\(\)/);
  assert.match(source, /grant execute on function public\.is_active_auth_session_for_user\(uuid,uuid\) to service_role/);
});

test("CI bloqueia vulnerabilidade high também na árvore completa", () => {
  const source = read(".github/workflows/ci.yml");
  assert.match(source, /Audit complete dependency tree for high or critical issues/);
  assert.match(source, /npm audit --audit-level=high/);
  assert.doesNotMatch(source, /npm audit --audit-level=critical/);
});
