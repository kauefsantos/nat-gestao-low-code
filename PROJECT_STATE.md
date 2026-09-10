# NAT Gestão — Estado do Projeto

## Objetivo
Aplicação mobile-first para Natalia e Kauê acompanharem vendas, custos e precificação da NAT Brownies e Brigadeiros Gourmet com linguagem simples e cálculos explicáveis.

## Arquitetura atual
- `src/domain/nat.ts`: regras de cálculo e validação defensiva no cliente.
- `src/domain/recipe-csv.ts`: importação de receita por CSV.
- `src/data/nat-repository.ts`: adaptação entre domínio e Supabase.
- `src/hooks/use-nat-store.ts`: estado, sincronização em nuvem e detecção de conflito entre aparelhos.
- `src/components/nat`: shell, views, formulários e importador CSV.
- `src/routes`: landing, login, cadastro e dashboard. Rotas autenticadas usam `ssr:false` para não executar sessão browser-only no servidor.
- `src/integrations/supabase`: cliente público tipado. Nenhuma chave administrativa no frontend.
- `supabase/migrations`: schema, RLS, auditoria e invariantes de integridade.
- `supabase/tests/rls.sql`: testes pgTAP executados pelo CI contra Supabase descartável.

## Segurança e integridade
- Isolamento por `business_id` com RLS.
- Acesso comercial exige usuário autenticado, membership e AAL2/MFA.
- `anon` sem grants em tabelas de negócio.
- Vendas são gravadas por RPC controlado; custo, taxa e contribuição são recalculados no PostgreSQL.
- `sales` e `sale_items` não aceitam escrita direta de `authenticated`.
- Histórico de compras é append-only para sessões autenticadas.
- Ingrediente usado em receita ativa não pode ser arquivado.
- Relações entre entidades usam FKs compostas com `business_id`.
- Alterações relevantes entram em `audit_log`; allowlist possui auditoria privada.
- Audit log não é apagado automaticamente se a empresa for removida administrativamente.
- Allowlist pode pré-associar múltiplos e-mails à mesma empresa antes do primeiro login.

## Funcionalidades
1. Cadastro de ingredientes e embalagens com histórico de compras.
2. Receita manual ou importada por CSV (`Ingrediente;Quantidade;Unidade`).
3. Conversões kg/g, L/ml e unidade.
4. Custo de lote e custo unitário.
5. Preço mínimo, recomendado e simulador.
6. Registro de vendas com snapshot financeiro autoritativo no servidor.
7. Indicadores mensais e histórico.
8. Configurações de custos fixos, taxas e margens.
9. Navegação do dashboard preservada na URL por `?view=`.
10. MFA TOTP obrigatório para acessar dados comerciais.

## Qualidade
O CI executa `npm ci`, lint, TypeScript, scanner estático, testes de domínio, build, auditoria de dependências, banco local Supabase, testes RLS e lint do schema.

## Pendências operacionais externas ao código
- Ativar branch protection/ruleset na `main` e exigir os checks do CI. A conexão GitHub disponível ao assistente não expõe escrita administrativa de rulesets.
- Confirmar no painel de Auth do Supabase política de senha, CAPTCHA/rate limiting, confirmação de e-mail e política de sessão; essas configurações não são expostas pela ferramenta SQL.
- Migrar a CSP de `script-src 'unsafe-inline'` para nonce por requisição quando o runtime TanStack/Lovable tiver o nonce configurado ponta a ponta. O restante da CSP já bloqueia scripts de atributo, frames e objetos.
- Se o volume crescer muito, trocar a carga completa do histórico por paginação e agregações SQL.
