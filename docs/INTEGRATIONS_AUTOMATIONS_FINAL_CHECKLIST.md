# Integrações e Automações — checklist final

- [x] Claim de Push ocorre antes do envio externo.
- [x] Replay concorrente não obtém segundo claim.
- [x] Lease de processamento expirado pode ser retomado.
- [x] Push transitório possui retry persistente, backoff, jitter e limite.
- [x] 404/410 expiram subscription sem retry.
- [x] Entregas esgotadas vão para dead-letter.
- [x] Scheduler registra request id do pg_net e reconcilia resposta HTTP real.
- [x] Segredo de cron não possui hash fixo no código e usa fonte backend única.
- [x] Jobs podem ser reconciliados idempotentemente após configuração de secrets.
- [x] Timezone é IANA configurável, com São Paulo como default.
- [x] IA mantém frontend desativado e possui retry apenas para falhas transitórias.
- [x] Timeout ambíguo de IA não é repetido automaticamente.
- [x] Rate limit antiabuso e quota de custo da IA estão separados.
- [x] Retries da mesma geração não consomem nova unidade de quota de custo.
- [x] Regressões de integração adicionadas à suíte de banco.
- [x] Migration aplicada e testes reversíveis executados no Lovable Cloud real.
- [ ] CI da PR verde.
- [ ] Edge Functions confirmadas no runtime do Lovable Cloud após merge/deploy.
