# Integrações e Automações — status de implementação

Backend alvo: **Lovable Cloud**. Os caminhos `supabase/` representam a camada PostgreSQL/Edge Functions gerenciada pelo Lovable Cloud e não um projeto Supabase separado.

## Aplicado no banco real

- Ledger idempotente de entrega Push e retries.
- Telemetria/reconciliação dos requests assíncronos do scheduler.
- `reconcile_nat_push_jobs()` e job `nat-push-reconcile` a cada 5 minutos.
- Timezone IANA por empresa, default `America/Sao_Paulo`.
- Separação entre rate limit antiabuso e quota de custo da IA.
- Permissões backend-only das novas RPCs conferidas.

## Código preparado na branch

- `nat-push-dispatch`: claim antes do envio, retry persistente, cron secret rotacionável e timezone por empresa.
- `nat-content-ai`: retry seletivo, sem retry de timeout ambíguo, provider attempt telemetry e quota de custo idempotente.
- Regressões pgTAP de integrações/automações.

Validação final depende dos checks obrigatórios da PR e da confirmação das versões das Edge Functions no runtime Lovable Cloud após sincronização/deploy.
