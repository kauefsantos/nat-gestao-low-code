# Auditoria de Arquitetura e Qualidade do Código — 2026-09

## Escopo

Auditoria da NAT Gestão a partir do head da funcionalidade de ROI, cobrindo organização, responsabilidades, duplicação, dependências, facilidade de manutenção, regras de ROI e tipografia. O backend de produção é o Lovable Cloud.

## Resumo executivo

A arquitetura-base é saudável: domínio TypeScript, camada de dados, hooks/UI e Lovable Cloud autoritativo para regras críticas. O principal risco encontrado não é uma falha estrutural de fundação, mas o acúmulo de responsabilidades e versões paralelas conforme a aplicação cresceu.

As correções desta auditoria foram feitas em branch isolada e não alteram produção, não publicam frontend e não publicam Edge Functions.

## Achados e correções

### A1 — ROI mensal dependia do fuso do dispositivo

**Gravidade:** alta  
**Prioridade:** P1

**Evidência:** `src/domain/roi.ts` usava o recorte mensal herdado de `monthSales`, que classifica `Date` pelo fuso local do runtime. Uma venda próxima da virada do mês poderia entrar no mês incorreto em um dispositivo configurado fora do fuso da NAT.

**Reprodução:** criar venda em `2026-10-01T01:30:00Z`. Em `America/Sao_Paulo`, ainda é 30/09. Um recorte por UTC/dispositivo pode classificá-la como outubro.

**Correção aplicada:** `businessRoi` agora usa `businessDate()` e, portanto, o fuso de negócio `America/Sao_Paulo` para determinar o mês.

**Teste:** adicionado caso explícito de virada UTC/horário de São Paulo em `tests/roi-analytics.test.ts`.

### A2 — Inteligência acessava Lovable Cloud diretamente

**Gravidade:** média-alta  
**Prioridade:** P1

**Evidência:** `src/components/nat/IntelligenceView.tsx` importava o cliente de infraestrutura e consultava `supply_purchases`, contrariando a arquitetura documentada em `docs/ARCHITECTURE.md`, que define `src/data` como adaptador de persistência.

**Reprodução:** localizar import do cliente do Lovable Cloud em `IntelligenceView.tsx` e a consulta a `supply_purchases` dentro do efeito React.

**Correção aplicada:** criada `src/data/intelligence-repository.ts`; a tela agora consome `loadSupplyPurchaseInsights` e não conhece detalhes de persistência.

**Teste:** `tests/architecture-code-quality.test.ts` garante que a tela não importe o cliente de infraestrutura e que a consulta permaneça na camada `data`.

### A3 — Loader operacional legado duplicava responsabilidade

**Gravidade:** média  
**Prioridade:** P1

**Evidência:** coexistiam `nat-operational-repository.ts`, `nat-operational-v2.ts` e `nat-operational-v3.ts`. O store ativo usa V2/V3; o arquivo não versionado tinha aproximadamente 16 KB de implementação paralela.

**Reprodução:** comparar `src/data/` e confirmar que `use-nat-store.ts` importa apenas V2/V3.

**Correção aplicada:** removido `src/data/nat-operational-repository.ts`.

**Teste:** teste arquitetural confirma que o arquivo legado não existe e que o store permanece ligado ao fluxo ativo V3.

### A4 — Tipos gerados do Lovable Cloud estão atrasados

**Gravidade:** média-alta  
**Prioridade:** P1

**Evidência:** produção possui campos como `business_settings.timezone`, `fixed_cost_funding_source`, `sales.customer_id`, `transaction_type`, `sale_channel`, `delivery_cost_snapshot`, `discount_reason`, `below_cost_override`, `sale_items.labor_cost_snapshot` e `funding_source` em compras/gastos. O snapshot gerado em `src/integrations/supabase/types.ts` não representa integralmente esse schema, obrigando casts de compatibilidade em loaders.

**Reprodução:** comparar `information_schema.columns` do Lovable Cloud com o tipo `Database` versionado.

**Correção recomendada:** regenerar o arquivo inteiro a partir do schema real do Lovable Cloud em uma mudança isolada; depois remover casts e extensões temporárias. Não editar manualmente apenas alguns campos, para não transformar um arquivo gerado em fonte híbrida.

**Resultado nesta auditoria:** validado e documentado, mas não alterado por segurança.

### A5 — Concentração excessiva de responsabilidades em arquivos grandes

**Gravidade:** média  
**Prioridade:** P2

**Evidência:** `src/domain/nat.ts` concentra tipos, unidades, custos, pricing, dashboard, CRM/RFM, analytics e construção de vendas. `NatApp.tsx` concentra composição, sheets, comandos, deduplicação, undo e feedback. Há ainda telas de 13–18 KB.

**Impacto:** maior área de regressão por mudança, conflitos de merge e dificuldade para testar uma responsabilidade isoladamente.

**Correção recomendada:** decomposição incremental, preservando APIs públicas por reexports: `domain/types`, `pricing`, `sales`, `customers`, `analytics`; e extração de comandos/orquestração do `NatApp` para hooks/use-cases. Prioridade de telas: `SaleOrderSheet`, `CalendarView`, `InventoryView`, `CustomersView` e `ProductsView`.

**Proteção aplicada:** novo gate de arquitetura rejeita arquivos de primeira parte acima de 30 KB e impede dependências invertidas entre camadas. O limite é uma trava de crescimento, não uma meta de tamanho ideal.

### A6 — Exceções explícitas de infraestrutura ainda existem na UI

**Gravidade:** média  
**Prioridade:** P2

**Evidência:** três superfícies permanecem como entrypoints de integração direta: `SaleOrderSheet` para cotação autoritativa, `IntegrationHealthPanel` para diagnóstico técnico e `ContentStudio` para integração de IA. `NatApp` usa o cliente somente para logout.

**Correção recomendada:** ao dividir essas telas, mover os detalhes de RPC/Functions para adaptadores em `src/data`/`src/lib` e expor funções semânticas à UI.

**Proteção aplicada:** o architecture gate mantém allowlist explícita dessas três exceções. Qualquer novo componente tentando importar o cliente do Lovable Cloud falha no CI.

### A7 — CI não tinha gate arquitetural

**Gravidade:** média  
**Prioridade:** P1

**Evidência:** lint e TypeScript garantiam sintaxe/tipos, mas não impediam domínio depender de UI, componente acessar banco diretamente ou retorno de arquivos legados.

**Correção aplicada:** criado `scripts/architecture-check.mjs`, script `architecture:check` e etapa `Check architecture boundaries` no workflow principal.

**Teste:** `tests/architecture-code-quality.test.ts` valida que o gate está ligado ao `package.json` e ao CI.

## ROI — regra validada

- ROI por sabor usa `unitCostSnapshot` e `unitPriceSnapshot` históricos da venda.
- Taxa e entrega são rateadas pela participação de receita de cada linha.
- Venda cancelada e movimentação não comercial não entram no ROI de venda.
- ROI consolidado mensal inclui custo vendido, taxa, entrega, custos fixos e gastos esporádicos.
- Aporte pessoal e reinvestimento NAT não são somados novamente como custo.
- O mês é determinado pelo fuso da NAT.
- Financeiro mostra ROI consolidado; Inteligência mostra consolidado + ROI por sabor.
- O título de ROI ganhou um controle acessível `i`, explicando fórmula e diferença entre margem e ROI.

## Tipografia — recomendações

A combinação atual `GFS Didot` + `Lato` é adequada à identidade da NAT, mas deve seguir uma hierarquia mais rígida:

1. manter GFS Didot somente em marca, H1/H2 e títulos de destaque; não usar em dados densos;
2. usar Lato 400 para corpo, 700 para labels/ações e reservar 900 para ênfases pequenas, evitando excesso de peso visual;
3. aplicar `font-variant-numeric: tabular-nums` em KPIs financeiros, ROI, margem e preços para facilitar comparação vertical;
4. manter informação essencial em pelo menos 14 px; `text-xs` deve ficar restrito a metadado secundário;
5. adotar `clamp()` nos maiores títulos para transição mais suave entre celulares pequenos e desktop;
6. preservar line-height de corpo na faixa de 1.5–1.6 e títulos em aproximadamente 1.1–1.2.

Não foi feita troca de fonte nesta auditoria porque acessibilidade e tipografia já tinham sido validadas anteriormente e uma mudança de família tipográfica teria impacto visual amplo sem necessidade funcional.

## Validação realizada

- código da branch baseada no head da PR de ROI;
- arquitetura documentada e dependências entre `domain`, `data`, hooks e componentes;
- regra de ROI e snapshots históricos;
- fuso horário de negócio;
- schema real do Lovable Cloud para campos críticos recentes;
- CI, lint, typecheck, testes de domínio, build, budget de performance e E2E via workflow da branch, após abertura da PR;
- ausência de merge/publicação durante a auditoria.

## Limitações

- Os tipos gerados do Lovable Cloud não foram regenerados nesta mudança porque isso deve ser feito como snapshot completo e controlado.
- As três exceções de integração direta na UI foram documentadas e bloqueadas contra expansão, mas a extração completa fica para refatoração incremental.
- A decomposição de arquivos grandes foi recomendada e protegida contra piora, não executada como big-bang para evitar regressão funcional desnecessária.
