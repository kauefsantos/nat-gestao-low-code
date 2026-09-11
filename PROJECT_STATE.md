# NAT Gestão — Estado do Projeto

## Objetivo
Aplicação mobile-first para a usuária principal e o responsável pelo projeto acompanharem vendas, custos, precificação, estoque, agenda e conteúdo da NAT Brownies e Brigadeiros Gourmet com linguagem simples e cálculos explicáveis.

## Arquitetura atual
- Backend: **Lovable Cloud**, com PostgreSQL/Supabase gerenciado internamente.
- `src/domain/nat.ts`: regras de cálculo, validação defensiva e categorias de insumo (`ingredient`, `packaging`, `other`).
- `src/domain/recipe-csv.ts`: importação de receita por CSV.
- `src/domain/inventory.ts`: tipos, rótulos e formatação do Estoque.
- `src/data/nat-repository.ts`: persistência transacional, versionamento, idempotência e disponibilidade temporária.
- `src/data/inventory-repository.ts`: adaptador dos RPCs autoritativos do Estoque.
- `src/hooks/use-nat-store.ts`: estado, sincronização, recuperação de conflitos e feedback de gravação.
- `src/hooks/use-inventory.ts`: snapshot, contagem física e produção.
- `src/hooks/use-dialog-a11y.ts`: Escape, focus trap, scroll lock e restauração de foco.
- `src/components/nat/Feedback.tsx`: feedback `Salvando`, `Salvo`, `Erro` e confirmações NAT.
- `src/components/nat/InventoryView.tsx`: interface de estoque, saldos, mínimos, produção e movimentos.
- `src/domain/calendar.ts`, `src/hooks/use-calendar.ts`, `src/components/nat/CalendarView.tsx`: agenda e lembretes.
- `src/integrations/supabase`: cliente e tipos gerados; o browser usa apenas chave publicável. As RPCs de Estoque recentes permanecem isoladas no adaptador até a próxima regeneração automática de tipos, sem edição manual do arquivo gerado.
- `supabase/migrations`: schema versionado, RLS, auditoria, invariantes, RPCs, estoque e jobs.
- `supabase/tests`: regressões pgTAP/RLS contra stack descartável.
- `supabase/functions`: funções do runtime do Lovable Cloud.

## Segurança e integridade
- Isolamento por `business_id` com RLS.
- Acesso comercial exige autenticação, membership e AAL2/MFA.
- Todas as tabelas públicas do banco real estão com RLS habilitado.
- `anon` não possui grants diretos nas tabelas de negócio e não executa funções públicas.
- Tabelas comerciais são somente leitura direta para `authenticated`; mutações passam por RPCs controladas.
- Escritas administrativas em empresa, configurações e membros são limitadas por políticas de administrador e proteção do último admin.
- Funções públicas `SECURITY DEFINER` auditadas possuem `search_path` controlado.
- `vault` não possui `USAGE` para `anon` ou `authenticated`.
- Vendas recalculam custo, taxa e contribuição no PostgreSQL.
- Histórico financeiro não é apagado: vendas e compromissos são cancelados preservando rastreabilidade.
- Compras são append-only na operação autenticada.
- Ingrediente usado em receita ativa não pode ser arquivado.
- Produto pausado continua no histórico, mas novas vendas são bloqueadas também no banco.
- Estoque usa ledger imutável; movimentos já lançados não podem ser editados/apagados pela operação normal.
- Compra/produção/devolução têm direção positiva; venda/consumo têm direção negativa, validadas no banco.
- FKs incluem `business_id` onde aplicável.
- Alterações relevantes entram em `audit_log`, preservado pela retenção operacional.
- CSP usa nonce por requisição e middleware CSRF permanece ativo.
- Scanner estático bloqueia service role/segredos no browser e segredos hardcoded.
- Não há uso de `dangerouslySetInnerHTML` no código auditado.

## Backend P0–P3
### P0 — consistência financeira
- RPCs financeiras endurecidas.
- Custo histórico considera somente compras existentes na data da venda.

### P1 — pedidos e ciclo de vida
- Um pedido pode conter vários produtos.
- Cancelamento preserva cabeçalho e itens.
- Push possui VAPID, inscrições, log e quatro slots (09h, 12h, 16h e 21h de São Paulo).

### P2 — transações, concorrência e IA
- Alterações compostas são atômicas.
- Concorrência otimista por `updated_at` apenas nas entidades tocadas.
- IA possui rate limit, timeout e telemetria sem armazenar o texto do prompt.
- **IA continua intencionalmente desativada no frontend** para evitar custo. `ContentStudio`, `nat-content-ai`, RPCs e Vault foram preservados para reativação futura.

### P3 — escala, idempotência e agenda
- `apply_nat_transition_v2`: request id idempotente evita duplicação em retry/rede instável.
- `get_dashboard_summary`: KPIs mensais no servidor.
- Históricos usam paginação keyset/cursor.
- Retenção: request ids 7 dias; logs técnicos de IA/push 90 dias; histórico comercial e auditoria são preservados.
- Agenda suporta criar, editar, concluir, reabrir e cancelar sem apagar histórico.
- Seed editorial é one-time.
- Limites e consistência de status também são impostos no banco.

## Superfície RPC atual
O frontend atual usa os contratos endurecidos:
- `apply_nat_transition_v2`
- `save_sale_items`
- `cancel_sale`
- `save_calendar_event_v2`
- `cancel_calendar_event_v2`
- RPCs atuais de Estoque

A migration `20260911023000_reduce_legacy_rpc_surface.sql` removeu de `public`, `anon` e `authenticated` a permissão de executar as entradas antigas:
- `apply_nat_transition(uuid,jsonb)`
- `save_sale(...)` de produto único
- `delete_sale(...)`
- `save_calendar_event(...)` v1
- `delete_calendar_event(...)`

As funções legadas permanecem no schema apenas por compatibilidade interna/histórica, sem superfície para clientes autenticados. A suíte de regressão foi migrada para testar somente as APIs atuais.

## Portfólio e disponibilidade
- Catálogo inclui **Brownie • Doce de Leite** (`brownie-doce-de-leite`).
- `products.available` é disponibilidade temporária; `active` permanece arquivamento.
- Produto pode ser **Pausado/Retomado** sem perder receita, custos ou histórico.
- Produto pausado não aparece em nova venda e é bloqueado no banco.
- Pausa não remove o produto das comparações de custo/precificação.

## Estoque — backend
### Modelo
- `inventory_tracking`: controle por item, unidade-base e mínimo.
- `inventory_movements`: ledger de abertura, compra, produção, consumo, venda, cancelamento e ajuste.
- `inventory_productions`: histórico auditável de produção.
- Suporta produtos acabados, ingredientes, embalagens e **outros insumos**.
- Normalização: kg/g → g; L/ml → ml; unidade → un.

### Adoção gradual
- Controle **opt-in por item**.
- Item só passa a bloquear/automatizar depois de informado o saldo inicial.
- Compras anteriores não são retroimportadas; o saldo físico inicial representa o estoque existente no momento da ativação.

### Regras
- `get_inventory_snapshot`: saldos, mínimos, alertas e movimentos recentes.
- `set_inventory_balance`: abertura/contagem física como movimento, sem apagar histórico.
- `record_inventory_production`: produção transacional, consome insumos monitorados e soma produto acabado.
- Nova compra monitorada entra automaticamente.
- Venda monitorada baixa produto acabado e é recusada sem saldo suficiente.
- Cancelamento devolve apenas estoque efetivamente baixado pela venda.
- Produção é recusada sem insumo monitorado suficiente.
- `source_key` idempotente evita duplicidade.
- Advisory locks serializam alterações concorrentes.
- `save_supply` aceita `ingredient`, `packaging` e `other`; a migration `20260911024000_supply_other_category.sql` alinhou a RPC autoritativa ao domínio/frontend e mantém categorias não suportadas bloqueadas.

### Testes e produção
- `supabase/tests/inventory.sql`: 26 regressões específicas.
- `supabase/tests/supply_categories.sql`: regressão dedicada para **Outro insumo**, incluindo persistência da compra e rejeição de categoria inválida.
- Migrations de Estoque e hardening estão aplicadas ao Lovable Cloud real.
- E2E real reversível de Estoque: 5.000 g → produção consumiu 200 g → 4.800 g; produto 10 → 20; venda de 3 → 17; cancelamento → 20; rollback integral (`cleaned_up=true`).
- E2E real reversível de **Outro insumo**: `Papel-manteiga` foi salvo via `save_supply` com categoria `other`, a compra foi criada corretamente e a transação foi revertida; checagem posterior confirmou zero registros fictícios.
- Leitura autenticada de `get_inventory_snapshot` validada no banco real.

## Frontend P1–P4
### P1 — mobile e acessibilidade
- Barra mobile fixa: **Início, Vendas, Agenda, Estoque e Mais**.
- Mais contém **Produtos, Portfólio, Preços e Identidade visual**.
- Dialogs/bottom-sheets usam Escape, backdrop, focus trap, scroll lock e retorno de foco.

### P2 — limpeza e manutenção
- Fluxo ativo de vendas: `SalesHistoryView` + `SaleOrderSheet`.
- Fluxo ativo de Portfólio: `PortfolioHierarchyView`.
- Implementações antigas de Vendas/Portfólio e `SaleSheet` foram removidas.
- `SheetShell` reutiliza `useDialogA11y`.
- `ContentStudio` foi preservado para futura reativação da IA.

### P3 — clareza de vendas
- Cancelamento usa dialog NAT acessível.
- Venda mostra **Valor realmente recebido**, **Desconto/Acréscimo** e **Quanto sobra nesta venda**.
- Valores relevantes usam `aria-live`.
- PostgreSQL permanece fonte autoritativa.

### P4 — confiança e feedback
- Operação normal não depende de `window.alert`, `window.prompt` ou `window.confirm`.
- Fluxos mostram **Salvando alteração... → Tudo salvo.**
- Falha recarrega a versão autoritativa e informa quando a alteração foi desfeita.
- Conflitos entre aparelhos recebem mensagem específica.
- Confirmações destrutivas usam `ConfirmDialog` NAT.
- Carregamento com falha oferece **Tentar novamente**.
- Contagem/produção aguardam confirmação do backend antes de fechar.

## Limpeza final de código
- Removida a segunda implementação obsoleta de Produtos que ainda existia dentro de `Views.tsx`.
- Removido o `SupplySheet` legado duplicado de `Sheets.tsx`; existe uma única implementação ativa do cadastro de compras.
- Com a remoção das duplicações, também desapareceram os `window.confirm` antigos que ainda existiam em código morto.
- `SupplyCategory` foi alinhado ao banco: `ingredient | packaging | other`; não há mais casts para forçar “Outro insumo”.
- Testes antigos deixaram de chamar RPCs v1 e passaram a exercitar `save_sale_items`, `apply_nat_transition_v2` e agenda v2.
- O arquivo de tipos gerados do Supabase não foi editado manualmente; RPCs novas de Estoque continuam encapsuladas no adaptador até a próxima regeneração oficial.

## Funcionalidades atuais
1. Ingredientes, embalagens e outros insumos com histórico de compras.
2. Receita manual ou por CSV (`Ingrediente;Quantidade;Unidade`).
3. Conversões kg/g, L/ml e unidade.
4. Custo de lote e custo unitário.
5. Preço mínimo, recomendado e simulador.
6. Pedidos multiproduto com snapshot financeiro autoritativo.
7. Indicadores mensais e históricos paginados.
8. Custos fixos, taxas e margens.
9. Agenda operacional/editorial e lembretes.
10. Estúdio de conteúdo preservado, IA desativada por decisão de custo.
11. MFA TOTP para dados comerciais.
12. Portfólio com disponibilidade temporária e Doce de Leite.
13. Estoque opt-in com produção, mínimos, alertas e ledger.

## Auditoria consolidada final — encerrada
A varredura final pós-P4/Estoque cobriu frontend, backend, banco real, RLS, permissões, RPCs, vendas, custos, agenda, push, estoque, navegação, código morto, tipagem e regressões cruzadas.

Durante essa última varredura foi encontrado e corrigido um desalinhamento real: `other` já existia no frontend/schema, mas `save_supply` ainda aceitava apenas ingrediente/embalagem. A correção foi testada em CI e no Lovable Cloud real antes do encerramento.

Resultado:
- frontend e build: **aprovados**;
- TypeScript/lint: **aprovados**;
- scanner estático: **aprovado**;
- Edge Functions check/lint: **aprovados**;
- testes de domínio: **aprovados**;
- auditorias de dependências: **aprovadas**;
- rebuild integral do banco pelas migrations: **aprovado**;
- pgTAP/RLS/integridade: **aprovados**;
- lint do schema: **aprovado**;
- hardening das RPCs antigas aplicado e conferido no banco real;
- Estoque, Outro insumo e Agenda possuem validação E2E real.

## Estado operacional externo ao código
- `nat-content-ai` e `nat-push-dispatch` estão provisionadas; IA segue desativada no frontend.
- Push real já validado em iPhone/PWA; quatro jobs seguem ativos (09h, 12h, 16h e 21h de São Paulo).
- Não há chave OpenAI configurada no Vault e ela não é necessária neste momento.
- O workspace Lovable continua sem créditos para execução do agente por essa via; não criar projeto/banco alternativo para contornar isso.
- **Único hardening externo não encerrado:** branch protection/ruleset da `main`. A API do GitHub retornou `403` para rulesets/branch protection no repositório privado pela integração/nível disponível. Isso não é falha da aplicação nem do banco.
