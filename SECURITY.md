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
- Alterações de schema/RLS devem vir com migration e teste em `supabase/tests/rls.sql`.

## Credenciais
Somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` podem ser expostas ao navegador. Segredos administrativos devem permanecer fora do repositório e do bundle.

## Frontend
- Rotas que dependem da sessão do navegador são client-only (`ssr:false`).
- Não usar `dangerouslySetInnerHTML` sem revisão explícita.
- CSP bloqueia objetos, frames, scripts de atributos e conexões fora da aplicação/Supabase. `unsafe-inline` ainda é necessário para os scripts de hidratação atuais e deve ser substituído por nonce por requisição quando o runtime estiver configurado para isso.
- Formulários precisam manter labels associados, validação e dialogs acessíveis.

## CI
O pipeline deve executar lint, typecheck, testes do domínio, build, auditoria de dependências e testes reais de RLS em Supabase descartável.

## Relato de vulnerabilidade
Não abra issue pública com credenciais, tokens ou dados reais. Use canal privado do proprietário do repositório.
