# Segurança — NAT Gestão

## Princípios obrigatórios

- Dados comerciais pertencem a um `business_id` e são isolados por RLS no PostgreSQL.
- Acesso a dados protegidos exige usuário autenticado, associação à empresa e AAL2 (MFA).
- `anon` não recebe grants sobre tabelas comerciais.
- Funções usadas pelo aplicativo são `SECURITY INVOKER`, exceto rotinas mínimas de bootstrap/autorização explicitamente revisadas.
- Chaves `service_role`, `sb_secret_` e equivalentes administrativos não podem existir no bundle ou em módulos genéricos de `src`.
- Dados financeiros não são persistidos em `localStorage`.
- Alterações críticas são registradas em `audit_log`; o frontend não possui permissão de escrita direta nessa tabela.
- Relações entre entidades usam `business_id` também nas foreign keys para impedir referências entre tenants.

## Credenciais

Somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` podem ser expostas ao navegador. Segredos administrativos devem permanecer exclusivamente em backend revisado.

## Alterações de banco

Toda alteração de schema, grant, função ou policy deve ser versionada em `supabase/migrations` e acompanhada de teste em `supabase/tests/rls.sql` quando afetar autorização.

## Relato de vulnerabilidade

Não abra issue pública com credenciais, tokens ou dados reais. Use canal privado do proprietário do repositório.
