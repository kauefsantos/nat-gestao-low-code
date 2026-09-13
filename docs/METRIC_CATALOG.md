# Catálogo de indicadores — NAT Gestão

## Convenções obrigatórias

- **Fuso operacional:** `America/Sao_Paulo`.
- **Venda válida:** `status = completed` e `transaction_type = sale`, salvo quando o indicador explicitar movimentações não comerciais.
- **Cancelamentos:** não entram em faturamento, recebido, unidades, ticket médio ou rankings.
- **Fonte autoritativa:** cálculos financeiros persistidos ou recalculados pelo PostgreSQL prevalecem sobre estimativas do frontend.
- **Snapshots:** custos, taxas, preço efetivo e preço de tabela históricos de uma venda devem usar os snapshots da própria venda, não valores atuais do cadastro.
- **Histórico vitalício:** indicadores de Inteligência e CRM são calculados sobre o histórico completo no Lovable Cloud; o recorte operacional de 45 dias do navegador não limita esses indicadores.

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
| Produto mais vendido | Qual produto teve maior volume? | maior soma de quantidade; desempate por faturamento/nome conforme implementação documentada | `sale_items` + `sales` | Data Owner Comercial |
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
| RFM | Qual relação recente/frequente/valiosa? | regras determinísticas sobre todo o histórico, com datas de negócio em São Paulo | clientes + vendas | Data Owner de CRM |

> **Compatibilidade:** o nome genérico `revenue` ainda pode existir internamente em funções legadas. Na interface e em novos contratos ele não deve ser usado sem qualificação. Para caixa, use **Recebido**; para valor econômico da venda, use **Faturamento**.

## Amostra mínima da área de Inteligência

A área só apresenta padrões depois de:

- pelo menos **10 vendas válidas**;
- distribuídas por pelo menos **7 datas distintas de negócio**.

As datas distintas e coortes são calculadas no fuso `America/Sao_Paulo` sobre o histórico completo do Lovable Cloud.

## Snapshots de preço de tabela

- Novas linhas de venda congelam `sale_items.list_unit_price_snapshot` no momento do registro.
- Vendas anteriores à criação desse campo são reconciliadas uma única vez com a tabela vigente na migration da Etapa 4, porque o preço de tabela original não existia no histórico. Depois dessa reconciliação, mudanças futuras de preço não alteram o passado.

## Controle de mudanças

Qualquer PR que altere uma das fórmulas acima deve:

1. atualizar este catálogo;
2. declarar a regra anterior e a nova;
3. adicionar regressão de domínio e/ou PostgreSQL;
4. validar bordas de data quando o KPI usar período;
5. preservar snapshots históricos quando aplicável.
