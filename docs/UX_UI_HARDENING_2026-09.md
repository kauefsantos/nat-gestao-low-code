# Hardening de UX/UI — setembro de 2026

## Escopo

Rodada de correção da auditoria de UX/UI da NAT Gestão, empilhada sobre `audit/frontend-resilience-hardening`. O objetivo é preservar as garantias de resiliência e melhorar clareza, velocidade de uso, consistência, mensagens e prevenção de duplo processamento.

## 9 correções da auditoria

1. **Duplo processamento** — formulários de compra, produto, gasto e cliente usam ID estável e `useSubmitGuard`; venda preserva `saleIdRef/submittingRef`; agenda preserva `draftId` e trava durante salvamento.
2. **Terminologia** — padronizados “Vendas e saídas”, “Registrar venda ou saída”, “Agenda” e “Produtos e compras”.
3. **CTAs mobile** — ações principais mantêm texto explícito (`Nova compra`, `Novo produto`, `Novo gasto`) e nomes acessíveis.
4. **Confirmações destrutivas** — removidos `window.confirm`/`window.prompt` dos fluxos auditados; ações usam diálogo consistente.
5. **Agenda durante salvamento** — backdrop, fechar e campos ficam bloqueados enquanto a gravação está em andamento.
6. **Clientes / RFM / privacidade** — linguagem simplificada; detalhes de privacidade ficam recolhidos; explicação contextual substitui jargão como informação principal.
7. **Inteligência densa** — `IntelligenceWorkbench` começa por alertas acionáveis e move indicadores completos para detalhe expansível.
8. **Cancelamento de venda** — motivo rotulado, resumo da operação, CTA explícito e estado `Cancelando...`.
9. **Navegação** — agrupada por Operação, Catálogo e custos, Relacionamento/análise e Marca; Estoque recebeu ícone próprio.

## 12 melhorias aplicadas

1. **Venda rápida** — cliente, canal, entrega e data ficam em “Mais detalhes”.
2. **Ações contextuais na Home** — agenda, estoque baixo e produto sem preço geram próximos passos.
3. **Busca global** — clientes, produtos, insumos e vendas, com atalhos para tarefas frequentes.
4. **Ações recentes** — repetir última venda, compra e acesso rápido a clientes.
5. **Resumo antes de confirmar** — venda e produto exibem resumo antes da gravação.
6. **Desfazer** — arquivamento/exclusão reversível de produto, insumo e gasto oferece `Desfazer`.
7. **Estados vazios acionáveis** — telas vazias explicam o próximo passo e exibem CTA.
8. **Ajuda contextual** — `HelpTip` explica métricas e parâmetros sem poluir a interface.
9. **Essencial x avançado** — detalhes financeiros, parâmetros de produto, cliente e indicadores densos ficam recolhidos por padrão.
10. **Home personalizável** — atalhos, relatórios e exportação podem ser exibidos/ocultados; preferência é local ao dispositivo.
11. **Indicadores orientados à ação** — Home e Análises priorizam “o que precisa de atenção” em vez de apenas números.
12. **Fluxos guiados** — após compra há atalho para receita; após produto há atalho para preço; após venda há atalho para histórico.

## Validação automatizada

- `tests/ux-ui-regressions.test.ts` protege os contratos críticos de UX da rodada.
- Pipeline principal valida lint, TypeScript, segurança estática, privacidade, Edge Functions, testes de domínio, build e dependências.
- Job de banco reconstrói as migrations e roda RLS/integridade, garantindo que as mudanças de interface não enfraqueçam o backend.
- E2E mobile já existente continua protegendo layout mínimo de login/cadastro e a suíte de autorização cobre MFA/cross-tenant.

## Limites da validação

Os testes automatizados não substituem observação presencial da usuária final. Permanecem fora desta rodada métricas de tempo real de tarefa, teste físico de VoiceOver em iPhone e pesquisa de usabilidade moderada. A implementação desta branch também não significa publicação no Lovable Cloud até o merge/deploy correspondente.
