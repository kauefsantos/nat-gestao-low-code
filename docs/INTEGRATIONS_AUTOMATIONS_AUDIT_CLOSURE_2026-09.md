# Fechamento da auditoria de Integrações e Automações — 2026-09

Escopo: Lovable Cloud, integrações externas, tarefas agendadas, fuso horário, limites de uso, novas tentativas após falhas e prevenção de processamento duplicado.

> O diretório `supabase/` deste repositório representa a camada técnica PostgreSQL/Edge Functions gerenciada pelo Lovable Cloud. Não existe um projeto Supabase separado para esta aplicação.

## Resultado por achado

1. **Push duplicável em concorrência — fechado.** `notification_delivery_log` virou ledger de entrega. `claim_push_delivery` faz claim atômico antes do efeito externo, com a chave única `(subscription_id, local_date, slot)`. Replay imediato perde o claim; lease expirado pode ser retomado. A Edge Function só chama Web Push depois de receber `claimed=true`.
2. **Push sem retry persistente — fechado.** Falhas transitórias usam `retry` + `next_retry_at`, backoff 1m/5m/15m/60m com jitter, `Retry-After` quando presente e máximo de cinco tentativas. `404/410` viram `expired` e desabilitam a subscription. Erro não transitório vai para `dead_letter`. Um worker dedicado `nat-push-delivery-retry` roda a cada cinco minutos para processar entregas vencidas sem depender do próximo slot diário.
3. **Scheduler não observava o resultado real do pg_net — fechado.** `private.nat_scheduler_dispatches` persiste `request_id`; `private.reconcile_nat_push_dispatches()` lê `net._http_response`, marca sucesso/falha e reenvia falhas transitórias de forma idempotente. Job `nat-push-reconcile` roda a cada cinco minutos e cobre tanto slots normais quanto o worker de retry.
4. **Segredo do cron com hash fixo — fechado.** O hash compilado foi removido. Scheduler e Edge Function usam o mesmo segredo armazenado no backend seguro/Vault do Lovable Cloud; a Edge valida `x-nat-cron-secret` em comparação constant-time. O endpoint deixou de aceitar service key genérica como autenticação de cron.
5. **Jobs dependiam da ordem entre migration e secrets — fechado.** `private.reconcile_nat_push_jobs()` é idempotente, verifica configuração e garante exatamente os quatro jobs de Push atuais, o worker de retry e o reconciliador. Se URL/segredo não existirem, retorna configuração pendente sem criar jobs quebrados.
6. **CI sem regressões de integração — fechado.** `supabase/tests/integrations_automations_hardening.sql` cobre claim/replay, cinco competidores simulados, lease expirado, retry 503, dead-letter, 410/expired, timezone, separação de quota da IA, privilégios backend-only e idempotência do reconciliador de jobs. O CI existente continua executando `deno check/lint` das Edge Functions e a suíte de banco em stack descartável.
7. **IA sem retry seguro — fechado para futura reativação.** `nat-content-ai` faz no máximo três tentativas para falha de conexão ou HTTP 408/425/429/500/502/503/504, respeita `Retry-After` com limite defensivo e backoff curto com jitter. Timeout de 30 s é ambíguo e não é reexecutado automaticamente. O frontend continua com IA desativada.
8. **Quota da IA misturava tentativa e custo — fechado.** `claim_content_ai_quota` permanece como rate limit antiabuso por tentativa. `claim_content_ai_provider_quota` consome quota de custo somente antes da primeira chamada ao provedor e é idempotente para a mesma geração. Retries incrementam `provider_attempt_count`, sem consumir nova unidade de custo.

## Fuso horário

`business_settings.timezone` passa a existir com default `America/Sao_Paulo` e validação contra nomes IANA do PostgreSQL. A NAT mantém o comportamento atual; a Edge Function calcula data local por empresa usando o timezone configurado.

## Jobs esperados no Lovable Cloud

- `nat-push-09` — `0 12 * * *`
- `nat-push-12` — `0 15 * * *`
- `nat-push-16` — `0 19 * * *`
- `nat-push-21` — `0 0 * * *`
- `nat-push-delivery-retry` — `*/5 * * * *`
- `nat-push-reconcile` — `*/5 * * * *`
- `nat-operational-retention` — limpeza operacional já existente

Os quatro horários continuam representando 09h, 12h, 16h e 21h no contexto operacional atual da NAT em São Paulo.

## Validação no Lovable Cloud real

- Migrations de hardening aplicadas com sucesso.
- `reconcile_nat_push_jobs()` retornou `configured=true` e os seis jobs de Push/retry/reconciliação ficaram configurados; a retenção operacional continua separada.
- RPCs de claim/finalização/falha/retry, segredo de cron e quota de provedor não são executáveis por `authenticated`; o backend possui execução.
- Teste reversível com subscription real e data futura confirmou: primeiro claim vence; replay imediato não vence; a transação foi revertida.
- Outro teste reversível confirmou: lease expirado é retomado, `503` entra em retry, retry vencido pode ser reclamado e o limite de tentativas termina em `dead_letter`; a transação foi revertida.
- Nenhum registro fictício desses testes permaneceu no banco.

## Arquivos principais

- `supabase/migrations/20260912040000_integrations_automations_hardening.sql`
- `supabase/migrations/20260912041000_integrations_cleanup_compat.sql`
- `supabase/migrations/20260912042000_push_retry_worker_timezone_permissions.sql`
- `supabase/functions/nat-push-dispatch/index.ts`
- `supabase/functions/nat-content-ai/index.ts`
- `supabase/tests/integrations_automations_hardening.sql`

## Critério de fechamento

Os oito achados são considerados fechados quando a PR desta implementação estiver com os checks obrigatórios verdes e as Edge Functions atualizadas no runtime do Lovable Cloud. A camada de banco e os jobs já foram validados no Lovable Cloud real; o status final de CI/runtime deve ser registrado após o merge/deploy.
