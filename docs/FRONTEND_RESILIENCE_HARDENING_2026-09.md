# Hardening de frontend e integrações — setembro/2026

## Escopo

Esta rodada fecha os sete achados da auditoria de frontend/integrações e adiciona doze melhorias de maturidade operacional. A infraestrutura considerada é o **Lovable Cloud** do projeto NAT. O diretório `supabase/` permanece como artefato técnico versionado do backend gerenciado pelo Lovable Cloud; nenhum projeto Supabase externo faz parte desta entrega.

## Correções da auditoria

1. **Agenda idempotente** — o formulário mantém um `event_id` estável; `save_calendar_event_v3` adiciona `request_id`, ledger privado e replay seguro. Um commit confirmado cuja resposta se perdeu pode ser repetido sem criar outro compromisso.
2. **Push concorrente** — `claim_push_delivery` reserva atomicamente a entrega antes do efeito externo. A unicidade é por subscription/data/slot e há lease para recuperação de worker interrompido.
3. **Retry de Push** — 429, 408/425, 5xx, timeout/rede entram em retry persistente com backoff+jitter; 404/410 expiram a subscription; depois do limite a entrega vai para `dead_letter`.
4. **Escala do frontend** — a abertura do app carrega somente dados operacionais: vendas dos últimos 45 dias, despesas do mês e o último custo de cada insumo. Vendas e despesas históricas são carregadas sob demanda via paginação keyset de 100 registros.
5. **Fuso horário** — slots de Push são escolhidos por `America/Sao_Paulo` no momento da execução. O cron apenas faz tick horário; não existe dependência de `UTC-3` fixo. Datas do frontend também usam utilitários IANA.
6. **Rotação do segredo de cron** — o hash esperado saiu do código-fonte e passa a ser lido do secret/env `NAT_PUSH_CRON_SECRET_SHA256`; a autenticação ocorre antes da criação do cliente administrativo.
7. **IA preparada para futura reativação** — a UI continua desativada. Backend ganhou correlation ID, retry transitório, `Retry-After`, idempotência de tentativa, orçamento de requests/tokens e circuit breaker.

## Melhorias de maturidade

A. `resilientRequest`: timeout real, retry idempotente, backoff/jitter, request ID e classificação centralizada de falhas.
B. Banner de `offline/reconectando`, sem prometer gravação offline.
C. AbortController e proteção por revisão de leitura para impedir resposta obsoleta no calendário.
D. Dois níveis de cache/carga: operacional limitado e histórico paginado sob demanda; reload respeita o modo atual.
E. RPC admin-only `get_integration_health` e painel técnico sob demanda na Home.
F. Circuit breaker persistente para IA; Push faz isolamento por subscription e retry persistente.
G. Estado `dead_letter` para Push após esgotar tentativas.
H. Correlation/request ID entre frontend, RPCs, jobs, Edge Functions e logs técnicos.
I. Testes determinísticos de timeout, falha 503/429, retry e reutilização de request ID, sem serviços pagos reais.
J. Testes de timezone, virada UTC/local, ano bissexto e janela entre meses.
K. Orçamento de IA por empresa por quantidade de requests e tokens. Não representa faturamento monetário exato do provedor.
L. Heartbeat de jobs e reconciliação dos requests `pg_net`, com indicação de job atrasado no diagnóstico.

## Limite técnico de exatamente-uma-vez no Web Push

O claim atômico elimina a corrida normal em que dois workers enviavam simultaneamente a mesma notificação. Como o provedor Web Push não participa da transação PostgreSQL, existe uma janela rara: o provedor pode aceitar a notificação e o worker cair antes de marcar `sent`. Após o lease expirar, um retry pode ocorrer. O `tag` determinístico da notificação ajuda o navegador a colapsar essa duplicidade. Portanto, a garantia é de prevenção robusta de duplicata concorrente, não uma promessa matemática de exactly-once entre dois sistemas distribuídos.

## Configuração operacional necessária antes do deploy

O Edge Function de Push exige o secret/env:

`NAT_PUSH_CRON_SECRET_SHA256 = SHA-256(valor atual de nat_push_cron_secret)`

O valor bruto continua no Vault/secret do Lovable Cloud usado pelo scheduler e **não** deve ser versionado. A rotação passa a exigir somente atualização de configuração/secret, não alteração de código.

## Validação

A entrega adiciona regressões em `tests/resilience.test.ts` e `supabase/tests/frontend_resilience.sql` e permanece sujeita aos workflows existentes: lint, typecheck, security/privacy static checks, Deno check/lint das Edge Functions, testes de domínio, build, dependency audit, rebuild completo das migrations, pgTAP/RLS/integridade e Mobile E2E.

## Estado de ativação

As alterações desta rodada estão na branch `audit/frontend-resilience-hardening` e na PR #36. Enquanto a PR não for mergeada/deployada pelo fluxo do Lovable, o código e migrations constituem a versão candidata e **não devem ser descritos como já ativos em produção**. O agente de edição do Lovable estava sem créditos durante a execução; o Lovable Cloud foi usado para validar o estado real do banco e reconciliar drift, sem modificar produção diretamente.
