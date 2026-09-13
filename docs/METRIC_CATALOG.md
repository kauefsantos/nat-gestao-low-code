# Catálogo de indicadores — NAT Gestão

## Convenções obrigatórias

- **Fuso operacional:** `America/Sao_Paulo`.
- **Venda válida:** `status = completed` e `transaction_type = sale`, salvo quando o indicador explicitar movimentações não comerciais.
- **Cancelamentos:** não entram em faturamento, recebido, unidades, ticket médio, CRM ou rankings.
- **Fonte autoritativa:** cálculos financeiros e de inteligência persistidos ou recalculados pelo Lovable Cloud prevalecem sobre estimativas do frontend.
- **Snapshots:** custos, taxas, preço efetivo e preço de tabela históricos de uma venda devem usar os snapshots da própria venda, não valores atuais do cadastro.
- **Histórico vitalício:** indicadores de Inteligência e CRM são calculados sobre o histórico completo no Lovable Cloud; o recorte operacional de 45 dias do navegador não limita esses indicadores.
- **Fato ≠ padrão ≠ recomendação:** fatos observados podem aparecer com base pequena; padrões, rankings interpretativos e recomendações comerciais exigem a amostra mínima definida abaixo.
- **Conciliação:** indicadores principais da área de Inteligência devem possuir drill-down para os registros que formam o valor exibido.

## Indicadores

| Indicador | Pergunta | Definição oficial | Fonte principal | Responsável |
| --- | --- | --- | --- | --- |
| Faturamento | Quanto foi vendido, independentemente de já ter sido pago? | soma de `sales.sale_value_snapshot` das vendas válidas no período | `sales` | Data Owner de Vendas |
| Recebido | Quanto dinheiro efetivamente entrou dos clientes? | soma de `sales.total_received` das vendas válidas no período | `sales` | Data Owner Financeiro |
| A receber | Quanto das vendas concluídas ainda não entrou? | soma de `greatest(sale_value_snapshot - total_received, 0)` das vendas válidas | `sales` | Data Owner Financeiro |
| Pedidos | Quantas vendas foram concluídas? | contagem de vendas válidas | `sales` | Data Owner de Vendas |
| Pedidos pagos | Quantas vendas concluídas já estão quitadas? | contagem de vendas válidas com `payment_status = paid` | `sales` | Data Owner Financeiro |
| Pedidos pendentes | Quantas vendas concluídas ainda aguardam pagamento? | contagem de vendas válidas com `payment_status = pending` | `sales` | Data Owner Financeiro |
| Unidades vendidas | Quantas unidades foram vendidas? | soma de `sale_items.quantity` das vendas válidas | `sale_items` + `sales` | Data Owner de Vendas |
| Ticket médio de venda | Qual valor econômico médio de cada pedido? | faturamento / quantidade de pedidos válidos | `sales` | Data Owner de Vendas |
| Contribuição / "Sobrou" | Quanto sobra depois de custo variável e custo dos itens? | soma de `contribution_snapshot` das movimentações ativas conforme contexto da tela | `sales` | Data Owner Financeiro |
| Resultado estimado | Quanto sobra após despesas do mês? | contribuição − gastos esporádicos − custos fixos | `sales`, `sporadic_expenses`, `business_settings` | Data Owner Financeiro |
| ROI do negócio | Quanto o investimento operacional do mês retornou? | `(faturamento do mês − investimento operacional) / investimento operacional × 100`; investimento = custos congelados dos itens + taxas + entrega + gastos esporádicos + custos fixos | Lovable Cloud | Data Owner Financeiro |
| ROI por produto | Quanto o custo variável histórico de um produto retornou? | `contribuição vitalícia / (custo congelado dos itens + taxa alocada + entrega alocada) × 100` | Lovable Cloud | Data Owner Comercial |
| ROI de promoções | Quanto retornaram as vendas realizadas abaixo do preço de tabela? | contribuição das vendas com desconto / investimento variável dessas vendas × 100 | Lovable Cloud | Data Owner Comercial |
| Produto mais vendido | Qual produto teve maior volume? | maior soma de quantidade; ranking somente quando a amostra mínima estiver pronta | `sale_items` + `sales` | Data Owner Comercial |
| Melhor dia recebido | Em qual data houve maior entrada de clientes? | maior soma diária de `total_received` usando o fuso de São Paulo | `sales` | Data Owner Comercial |
| Recebido últimos 7 dias | Quanto entrou hoje + 6 dias anteriores? | recebido das datas de negócio entre D-6 e D | `sales` | Data Owner Comercial |
| Variação semanal de recebido | Como os últimos 7 dias se comparam aos 7 anteriores? | `(recebido atual - recebido anterior) / recebido anterior` | `sales` | Data Owner Comercial |
| Desconto concedido | Quanto foi vendido abaixo da tabela vigente na data da venda? | soma de `list_unit_price_snapshot × quantidade - sale_value_snapshot`, quando positiva | `sale_items` + `sales` | Data Owner Comercial |
| Custo unitário | Quanto custa produzir uma unidade? | custo de ingredientes + perdas elegíveis + embalagem + mão de obra + produção, dividido pelo rendimento | compras, receita e produto | Data Owner de Custos |
| Preço mínimo | Qual preço respeita a margem mínima? | custo unitário / `(1 - margem mínima - taxa aplicável)` | produto + configurações | Data Owner de Preços |
| Preço recomendado | Qual preço respeita a margem alvo? | custo unitário / `(1 - margem alvo - maior taxa usada na precificação)` | produto + configurações | Data Owner de Preços |
| Estoque atual | Quanto existe disponível? | soma do ledger de movimentos do item | `inventory_movements` | Data Owner de Estoque |
| Estoque baixo | O que precisa de atenção? | item monitorado cujo saldo esteja no limite definido pelo controle de estoque | estoque | Data Owner de Estoque |
| Recompra | Cliente voltou a comprar? | cliente com pelo menos duas vendas válidas em todo o histórico | clientes + vendas | Data Owner de CRM |
| Taxa de recompra | Qual parcela dos clientes com compra voltou? | clientes com 2+ vendas válidas / clientes com pelo menos 1 venda válida × 100 | Lovable Cloud | Data Owner de CRM |
| Novo cliente no mês | Quantos clientes fizeram sua primeira compra no mês? | cliente cuja primeira venda válida vitalícia ocorreu no mês de negócio analisado | Lovable Cloud | Data Owner de CRM |
| Coorte de aquisição | Clientes que começaram no mesmo mês voltaram a comprar? | agrupamento pelo mês da primeira venda válida e taxa de clientes com 2+ compras | Lovable Cloud | Data Owner de CRM |
| RFM | Qual relação recente/frequente/valiosa? | regras determinísticas abaixo sobre todo o histórico, com datas de negócio em São Paulo | Lovable Cloud | Data Owner de CRM |
| Origem de clientes | De onde vieram clientes e vendas? | agrupamento vitalício pelo campo `customers.source`, normalizando vazio para `Não informado` | Lovable Cloud | Data Owner Comercial |
| Canal de venda | Por qual canal os pedidos foram fechados? | agrupamento vitalício de vendas válidas por `sales.sale_channel` | Lovable Cloud | Data Owner Comercial |

> **Compatibilidade:** o nome genérico `revenue` ainda pode existir internamente em funções legadas. Na interface e em novos contratos ele não deve ser usado sem qualificação. Para caixa, use **Recebido**; para valor econômico da venda, use **Faturamento**.

## Amostra mínima e confiança

A área só transforma dados em **padrões, rankings interpretativos e recomendações** depois de:

- pelo menos **10 vendas válidas**;
- distribuídas por pelo menos **7 datas distintas de negócio**.

Antes disso:

- fatos observados continuam disponíveis, como faturamento, unidades, compras e estoque;
- ROI pode ser mostrado como **valor observado**, mas não deve fundamentar recomendação;
- segmentos RFM exibidos ao usuário ficam como **Base insuficiente**;
- alertas de comportamento, ranking de melhor/pior produto, mix e recomendações comerciais ficam bloqueados;
- a interface informa quantas vendas e quantos dias ainda faltam.

As datas distintas, coortes e recência são calculadas em `America/Sao_Paulo` sobre o histórico completo do Lovable Cloud.

## RFM — contrato determinístico

### Recência

Dias desde a última venda válida:

- `0–7 dias` → 5 pontos;
- `8–14` → 4;
- `15–30` → 3;
- `31–60` → 2;
- `61+` → 1.

### Frequência

Quantidade vitalícia de pedidos válidos:

- `8+` → 5 pontos;
- `5–7` → 4;
- `3–4` → 3;
- `2` → 2;
- `1` → 1.

### Valor

Faturamento vitalício do cliente:

- `R$ 500+` → 5 pontos;
- `R$ 250–499,99` → 4;
- `R$ 100–249,99` → 3;
- `R$ 50–99,99` → 2;
- `> R$ 0 e < R$ 50` → 1;
- sem faturamento → 0.

### Segmentos

A classificação é aplicada nesta ordem, somente quando a base global de Inteligência estiver pronta:

1. 60+ dias sem comprar → **Inativo**;
2. 30–59 dias → **Em risco**;
3. 4+ pedidos e faturamento vitalício de pelo menos R$ 100 → **VIP**;
4. 2+ pedidos → **Recorrente**;
5. demais clientes com compra → **Novo**.

Quando a base global ainda não estiver pronta, o contrato de apresentação é **Base insuficiente**, mesmo que os componentes R/F/M possam ser calculados internamente.

## Drill-down e conciliação

A área de Inteligência possui composição auditável para:

- **produto:** linhas de venda, quantidade, faturamento, investimento e contribuição;
- **cliente:** pedidos, datas, faturamento, recebido e contribuição;
- **canal:** pedidos que formam faturamento, recebido e contribuição;
- **origem:** clientes, pedidos, faturamento e recorrência daquela origem;
- **coorte:** clientes do denominador e quem efetivamente recomprou;
- **promoção:** vendas abaixo do preço de tabela, valor de tabela, faturamento, desconto, investimento e contribuição.

Os totais do drill-down devem reconciliar com o indicador correspondente, salvo diferença exclusivamente de arredondamento de apresentação.

## Snapshots de preço de tabela

- Novas linhas de venda congelam `sale_items.list_unit_price_snapshot` no momento do registro.
- Vendas anteriores à criação desse campo foram reconciliadas uma única vez com a tabela vigente na migration da Etapa 4, porque o preço de tabela original não existia no histórico. Depois dessa reconciliação, mudanças futuras de preço não alteram o passado.

## Controle de mudanças

Qualquer PR que altere uma das fórmulas acima deve:

1. atualizar este catálogo;
2. declarar a regra anterior e a nova;
3. adicionar regressão de domínio e/ou Lovable Cloud;
4. validar bordas de data quando o KPI usar período;
5. preservar snapshots históricos quando aplicável;
6. manter a conciliação do drill-down correspondente;
7. preservar a distinção entre fato observado, padrão e recomendação.
