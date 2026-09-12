# Integrações e Automações — matriz de validação

| Cenário | Resultado esperado |
|---|---|
| Cinco claims para subscription/data/slot iguais | somente o primeiro vence; existe um ledger |
| Replay durante lease ativo | `claimed=false` |
| Lease expirado | novo worker pode retomar e incrementa tentativa |
| Push 503/429 | `retry`, `next_retry_at` futuro e tentativa persistida |
| Push 404/410 | `expired`, sem retry; Edge desabilita subscription |
| Limite de tentativas | `dead_letter`, sem novo retry |
| Scheduler pg_net 2xx | dispatch marcado `success` |
| Scheduler transitório/timeout | dispatch original `retry_scheduled` e nova tentativa registrada |
| Reconciliador executado novamente | não repete dispatch já reconciliado |
| `reconcile_nat_push_jobs()` repetido | exatamente um job por nome |
| Secrets ausentes | retorna configuração pendente sem jobs Push quebrados |
| Segredo rotacionado | validação usa valor corrente do backend seguro, sem hash compilado |
| Timezone `America/Sao_Paulo` | aceito |
| Timezone IANA inexistente | rejeitado pelo banco |
| IA sem chave | não consome quota de custo do provedor |
| Primeira chamada IA ao provedor | consome uma unidade de quota de custo |
| Retry da mesma geração | incrementa tentativa, não consome nova unidade de custo |
| Timeout da IA | não executa retry automático |
| HTTP transitório da IA | no máximo três tentativas com backoff/jitter |
| Usuário `authenticated` tenta RPC interna | sem permissão |
