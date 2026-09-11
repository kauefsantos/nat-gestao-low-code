# Segurança — NAT Gestão

## Princípios obrigatórios
- Dados comerciais pertencem a um `business_id` e são isolados por RLS no PostgreSQL.
- Acesso a dados protegidos exige usuário autenticado, associação à empresa e AAL2/MFA.
- `anon` não recebe grants sobre tabelas comerciais.
- Nenhuma chave administrativa pode existir no bundle ou em módulos de `src`.
- Dados financeiros não são persistidos em `localStorage`.
- O navegador pode calcular prévias, mas snapshots de venda são recalculados no PostgreSQL antes de serem gravados.
- `sales` e `sale_items` não aceitam INSERT/UPDATE/DELETE direto da role `authenticated`; mutações passam por RPC revisado.
- Compras históricas não podem ser UPDATE/DELETE por sessões autenticadas.
- Ingredientes usados em receitas ativas não podem ser arquivados.
- Relações entre entidades usam `business_id` também nas foreign keys para impedir referências entre tenants.
- Mudanças críticas são registradas em `audit_log`; alterações da allowlist têm auditoria privada.
- Alterações de schema/RLS devem vir com migration e teste em `supabase/tests`.

## Credenciais
Somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` podem ser expostas ao navegador. Segredos administrativos devem permanecer fora do repositório e do bundle.

Edge Functions podem usar `SUPABASE_SECRET_KEYS`, `SUPABASE_SECRET_KEY` ou compatibilidade legada de service role somente no runtime servidor. Nenhum valor secreto pode ser hardcoded ou logado.

## Autenticação
- O login exige MFA/AAL2 antes de liberar dados protegidos.
- Redirect pós-login é restrito à mesma origem e rejeita URLs externas, protocol-relative e caminhos com backslash.
- A tela `/reset-password` só libera alteração quando o Supabase Auth emite `PASSWORD_RECOVERY`; uma sessão autenticada comum não é suficiente.
- Recuperação de senha não revela se o e-mail informado existe.
- Cadastro é limitado por allowlist validada no banco, não apenas pela interface.

## Edge Functions
- `nat-content-ai` exige autenticação do usuário e valida membership antes de usar acesso administrativo.
- `nat-push-dispatch` permanece com `verify_jwt = false` por ser service-to-service, mas exige uma secret API key válida no header `apikey` antes de criar cliente administrativo ou acessar banco/Vault.
- O CI executa `deno check` e `deno lint` nas Edge Functions, além do scanner estático.

## Frontend e headers
- Rotas que dependem da sessão do navegador são client-only (`ssr:false`).
- Não usar `dangerouslySetInnerHTML` sem revisão explícita.
- CSP bloqueia objetos, frames, scripts de atributos e conexões fora da aplicação/Supabase.
- `script-src` usa nonce aleatório por requisição, propagado pelo TanStack Start ao SSR; scripts inline sem o nonce não são permitidos.
- `style-src 'unsafe-inline'` permanece apenas para estilos/hidratação visual e deve ser revisto separadamente se o runtime passar a suportar nonce completo para todos os estilos gerados.
- Ao definir `src/start.ts`, o middleware CSRF do TanStack Start deve continuar explícito para server functions.
- Formulários precisam manter labels associados, validação e dialogs acessíveis.

## CI
O pipeline deve executar lint, typecheck, scanner de segurança, validação Deno das Edge Functions, testes do domínio, build, auditoria de dependências e testes reais de RLS em Supabase descartável. Pull Requests também executam regressão mobile com Playwright.

## Governança do repositório
- A `main` é protegida por ruleset ativo.
- Mudanças entram por Pull Request e squash merge; force push e exclusão da branch principal são bloqueados.
- `validate` e `database-security` são checks obrigatórios antes do merge.
- Dependabot acompanha dependências npm e GitHub Actions; `CODEOWNERS` mantém responsabilidade explícita sobre o código.

## Relato de vulnerabilidade
Não abra issue pública com credenciais, tokens ou dados reais. Use canal privado do proprietário do repositório.
