# Fechamento da auditoria de privacidade — 2026-09

1. **Exclusão/anonymização de cliente — corrigido.** RPC `erase_customer_privacy_v1` remove o cadastro identificável, desvincula vendas e registra evidência mínima sem PII direta.
2. **PII no audit log — corrigido.** `private.audit_row_change` sanitiza `customers`; histórico existente foi saneado.
3. **Retenção — corrigido.** Política documentada e rotina diária integrada a `cleanup_nat_operational_logs`: 24 meses CRM, 24 meses consentimento, 90 dias IA/push, 7 dias mutation requests, 5 anos evidência mínima de solicitação.
4. **Consentimento — corrigido.** Ledger `customer_marketing_consents` registra concessão, revogação, expiração, origem, versão do aviso e ator.
5. **IA — corrigido no código e mantida desativada na UI.** Edge Function bloqueia padrões evidentes de PII antes de chamar a OpenAI e continua sem armazenar o prompt.
6. **Aviso/canal de direitos — corrigido.** Aviso `privacy-2026-09` disponível na área Clientes; canal operacional: `@natgourmet.doces`.
7. **Observações — corrigido.** Limite de 500 caracteres, aviso de minimização e rejeição de CPF/CNPJ no backend.
8. **Backups — corrigido.** Backup v2 é privacy-safe e não exporta identificadores/observações/consentimento do cliente.
9. **Diagnósticos — corrigido.** TTL de 14 dias, redaction de PII/segredos e limpeza manual na área Privacidade.

Validação: testes SQL/pgTAP e testes TypeScript de regressão foram adicionados. O banco Lovable Cloud foi inspecionado após a alteração e não há linhas de auditoria de clientes contendo as chaves `name`, `phone`, `instagram`, `source`, `notes` ou `marketing_consent`.