# Etapa 5 — Inteligência & CRM Confiáveis

## Objetivo

Transformar a área de Inteligência e CRM em uma camada de decisão **auditável, explicável e conciliável**. A Etapa 4 tornou o Lovable Cloud a fonte autoritativa do histórico vitalício; a Etapa 5 deve provar que cada indicador exibido ao usuário usa a definição correta, deixa clara sua base e permite chegar aos registros que compõem o número.

## Base herdada da Etapa 4

- `America/Sao_Paulo` é o fuso operacional.
- Vendas válidas: `status = completed` e `transaction_type = sale`, salvo definição explícita em contrário.
- Histórico vitalício de BI/CRM vem do Lovable Cloud, não da janela operacional de 45 dias do navegador.
- Preço de tabela, custos, taxas e demais grandezas históricas devem usar snapshots da venda.
- Amostra mínima para **padrões e recomendações**: 10 vendas válidas em pelo menos 7 datas distintas de negócio.
- Faturamento, Recebido e A receber são conceitos separados.

## Gaps já comprovados no kickoff

1. **ROI por sabor ainda depende do estado carregado no navegador.** `RoiOverview` chama `productRoiAnalytics(state)`, cuja fonte é `state.sales`; portanto, ainda não é vitalício como os demais indicadores de produto.
2. **ROI mensal ainda possui caminho local próprio.** `businessRoi(state)` recompõe receita e investimento a partir do estado do frontend em vez de consumir um contrato autoritativo equivalente ao snapshot financeiro.
3. **Amostra mínima hoje é aviso, não trava de confiança.** `IntelligenceWorkbench` e `IntelligenceView` continuam exibindo alertas, rankings e interpretações mesmo quando `readiness.ready = false`.
4. **Indicadores não possuem contrato de explicabilidade na resposta.** O snapshot entrega valores, mas não expõe de forma estruturada período, numerador, denominador, fuso, amostra e regra de elegibilidade por métrica.
5. **Não há drill-down conciliável para os principais KPIs.** Cards e rankings mostram produtos, clientes, canais, coortes e promoções, mas não oferecem caminho determinístico até os pedidos/clientes/itens que formam o número.
6. **ROI de promoção ainda não existe como ROI.** O backend entrega pedidos com desconto, valor de desconto e contribuição, mas não investimento/base e taxa de retorno da promoção.
7. **RFM está determinístico no Lovable Cloud, mas os thresholds não estão descritos integralmente no catálogo de métricas.**
8. **Origem de clientes é reagrupada no frontend a partir da lista de clientes.** O valor é derivável, mas não existe contrato próprio para aquisição/origem e sua conciliação.

## Ordem de ataque

### 5.1 — Contratos canônicos das métricas

Para cada indicador relevante, registrar no `METRIC_CATALOG.md` e no contrato do Lovable Cloud:

- nome canônico;
- pergunta de negócio;
- numerador;
- denominador;
- período/janela;
- fuso;
- vendas/movimentos elegíveis;
- snapshot histórico usado;
- amostra mínima;
- regra quando a amostra é insuficiente;
- chave de drill-down.

Prioridade: recompra, novos clientes, coortes, RFM, canais/origens, ROI do negócio, ROI por produto, promoções e margem.

### 5.2 — Uma única fonte de verdade

- eliminar ROI por produto baseado em `state.sales` para indicadores vitalícios;
- evitar recomputação local divergente para indicadores que já possuem fonte autoritativa;
- manter fallback local apenas onde houver motivo explícito e regressão de equivalência;
- garantir que nenhuma métrica vitalícia volte a depender dos 45 dias do navegador.

### 5.3 — Amostra e confiança

Separar **fato descritivo** de **padrão/recomendação**:

- fatos observados podem ser mostrados com base pequena;
- rankings interpretativos, alertas de comportamento e recomendações devem ficar bloqueados ou claramente classificados como insuficientes quando não houver 10 vendas em 7 dias distintos;
- métricas com amostra própria (por exemplo, tempo até segunda compra) devem declarar também sua base específica.

### 5.4 — Drill-down e conciliação

Todo KPI principal deve permitir provar o número a partir dos registros subjacentes. No mínimo:

- produto → pedidos/itens que compõem faturamento, custo, contribuição, margem e ROI;
- cliente/RFM → vendas consideradas e datas usadas para recência/frequência/valor;
- canal/origem → pedidos/clientes que formam o agrupamento;
- coorte/recompra → clientes do denominador e clientes que recompraram;
- promoção → pedidos descontados, preço de tabela congelado, desconto e retorno;
- novos clientes → primeira compra que os inclui no período.

A soma do drill-down deve reconciliar exatamente com o card correspondente, respeitando arredondamento monetário documentado.

### 5.5 — Recomendações acionáveis

Alertas só devem existir quando forem rastreáveis a uma métrica confiável e uma ação possível. Exemplos:

- clientes em risco → abrir a lista exata de clientes;
- produto com margem baixa → abrir pedidos/custos que explicam a margem;
- canal com melhor contribuição → mostrar base de pedidos e ticket;
- promoção ruim → mostrar desconto concedido versus contribuição/ROI;
- produto com boa recompra ou mix → mostrar coorte/pares que sustentam a recomendação.

Sem amostra suficiente, a interface deve orientar **o que falta registrar**, não recomendar decisão comercial.

## Regressões obrigatórias

Criar uma verdade de referência com casos controlados que incluam:

- primeira compra e recompra;
- cliente novo, recorrente, VIP, em risco e inativo;
- venda cancelada;
- cortesia/saída não comercial;
- venda paga e venda pendente;
- dois canais de venda;
- duas origens de cliente;
- promoção com preço de tabela congelado;
- alteração posterior de preço de produto;
- venda com mais de 45 dias;
- venda próxima à virada de dia/mês em UTC;
- produtos vendidos juntos;
- segunda compra com intervalo conhecido.

Os testes devem provar os valores esperados no Lovable Cloud e, para os indicadores expostos, a conciliação no frontend.

## Gates da Etapa 5

Além dos gates existentes, a PR da Etapa 5 só poderá ser mergeada se provar:

1. truth-table de BI/CRM no PostgreSQL verde;
2. regressões de fuso e histórico vitalício verdes;
3. reconciliação de pelo menos um drill-down de produto, cliente/coorte, canal e promoção;
4. comportamento de amostra insuficiente validado no E2E;
5. ROI vitalício sem dependência dos 45 dias;
6. nenhuma regressão em RLS/MFA/cross-tenant;
7. `Validate NAT Gestão`, `Mobile E2E` e `Inventory Edge E2E` verdes no mesmo SHA.

## Critério de conclusão

A Etapa 5 termina quando:

- cada KPI importante possui definição canônica e fonte autoritativa;
- a interface diferencia fato, padrão e recomendação;
- recomendações respeitam suficiência de amostra;
- números relevantes têm drill-down conciliável;
- RFM, recompra, coortes, canais/origens, produtos, promoções e ROI passam pelas truth tables;
- GitHub `main`, Lovable e Lovable Cloud ficam sincronizados no mesmo release;
- publicação e validação pós-deploy são concluídas pelo rito normal do projeto.
