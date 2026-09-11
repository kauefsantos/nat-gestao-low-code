# Auditoria de limpeza do código

Esta nota registra a varredura executada antes da limpeza de manutenção do repositório público.

## Resultado

- A análise de duplicação encontrou **0% de duplicação em TSX** e apenas um trecho mínimo no arquivo de tipos gerado do Supabase. Arquivos gerados não foram editados manualmente.
- `@tanstack/react-query` e `@tanstack/router-plugin` não possuíam consumidores no código atual e foram removidos junto com as entradas correspondentes do lockfile.
- Exports não consumidos foram convertidos em helpers internos ou removidos quando não tinham qualquer uso.
- O onboarding antigo de três passos, já permanentemente desativado na Home, foi removido; o fluxo ativo permanece em `HomeOperations` com quatro passos.
- `public/sw.js`, `nat-content-ai` e `nat-push-dispatch` foram preservados: são entrypoints de runtime e, por isso, não aparecem como imports tradicionais na análise estática.

## Critério

A limpeza priorizou redução de superfície e manutenção sem alterar regras de negócio, contratos de banco ou funcionalidades intencionalmente preservadas. Depois das alterações, lint, TypeScript, scanner estático, testes de domínio e build continuaram aprovados.
