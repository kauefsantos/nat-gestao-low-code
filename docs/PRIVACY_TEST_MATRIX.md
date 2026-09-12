# Matriz de validação de privacidade

- Auditoria de clientes sem PII: `supabase/tests/privacy_lgpd.sql`
- Ledger de consentimento e revogação: `supabase/tests/privacy_lgpd.sql`
- Exclusão com preservação de vendas: `supabase/tests/privacy_lgpd.sql`
- Bloqueio cross-tenant: `supabase/tests/privacy_lgpd.sql`
- Retenção de CRM: `supabase/tests/privacy_lgpd.sql`
- Bloqueio de CPF/CNPJ em observações: `supabase/tests/privacy_lgpd.sql` e `privacy_notes.sql`
- Backup minimizado: `tests/privacy-regressions.test.ts`
- Redaction e TTL de diagnósticos: `tests/privacy-regressions.test.ts`

A validação final deve incluir `lint`, `typecheck`, `security:static`, `security:privacy`, testes de domínio, build e testes de banco executados pelo CI.