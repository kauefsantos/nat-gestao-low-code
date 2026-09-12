# Catálogo de indicadores — NAT Gestão

## Convenções obrigatórias

- **Fuso operacional:** `America/Sao_Paulo`.
- **Venda válida:** `status = completed` e `transaction_type = sale`, salvo quando o indicador explicitar movimentações não comerciais.
- **Cancelamentos:** não entram em receita, unidades, ticket médio ou rankings.
- **Fonte autoritativa:** cálculos financeiros persistidos ou recalculados pelo PostgreSQL prevalecem sobre estimativas do frontend.
- **Snapshots:** custos, taxas e preços históricos de uma venda devem usar os snapshots da própria venda, não valores atuais do cadastro.

## Indicadores

| Indicador | Pergunta | Definição oficial | Fonte principal | Responsável |
| --- | --- | --- | --- | --- |
| Receita | Quanto entrou em vendas? | soma de `sales.total_received` das vendas válidas no período | `sales` | Data Owner de Vendas |
| Pedidos | Quantas vendas foram concluídas? | contagem de vendas válidas | `sales` | Data Owner de Vendas |
| Unidades vendidas | Quantas unidades foram vendidas? | soma de `sale_items.quantity` das vendas válidas | `sale_items` + `sales` | Data Owner de Vendas |
| Ticket médio | Quanto cada pedido gera em média? | receita / quantidade de pedidos válidos | `sales` | Data Owner de Vendas |
| Contribuição / "Sobrou" | Quanto sobra depois de custo variável e custo dos itens? | soma de `contribution_snapshot` das movimentações ativas conforme contexto da tela | `sales` | Data Owner Financeiro |
| Resultado estimado | Quanto sobra após despesas do mês? | contribuição − gastos esporádicos − custos fixos | `sales`, `sporadic_expenses`, `business_settings` | Data Owner Financeiro |
| Produto mais vendido | Qual produto teve maior volume? | maior soma de quantidade; desempate por receita/nome conforme implementação documentada | `sale_items` + `sales` | Data Owner Comercial |
| Melhor dia | Em qual data houve maior receita? | maior soma diária de receita usando o fuso de São Paulo | `sales` | Data Owner Comercial |
| Receita últimos 7 dias | Quanto vendeu hoje + 6 dias anteriores? | receita das datas de negócio entre D-6 e D | `sales` | Data Owner Comercial |
| Variação semanal | Como os últimos 7 dias se comparam aos 7 anteriores? | `(receita atual - receita anterior) / receita anterior` | `sales` | Data Owner Comercial |
| Custo unitário | Quanto custa produzir uma unidade? | custo de ingredientes + perdas elegíveis + embalagem + mão de obra + produção, dividido pelo rendimento | compras, receita e produto | Data Owner de Custos |
| Preço mínimo | Qual preço respeita a margem mínima? | custo unitário / `(1 - margem mínima - taxa aplicável)` | produto + configurações | Data Owner de Preços |
| Preço recomendado | Qual preço respeita a margem alvo? | custo unitário / `(1 - margem alvo - maior taxa usada na precificação)` | produto + configurações | Data Owner de Preços |
| Estoque atual | Quanto existe disponível? | soma do ledger de movimentos do item | `inventory_movements` | Data Owner de Estoque |
| Estoque baixo | O que precisa de atenção? | item monitorado cujo saldo esteja no limite definido pelo controle de estoque | estoque | Data Owner de Estoque |
| Recompra | Cliente voltou a comprar? | cliente com pelo menos duas vendas válidas | clientes + vendas | Data Owner de CRM |
| RFM | Qual relação recente/frequente/valiosa? | regras determinísticas documentadas no domínio e cobertas por regressão | clientes + vendas | Data Owner de CRM |

## Amostra mínima da área de Inteligência

A área só apresenta padrões depois de:

- pelo menos **10 vendas válidas**;
- distribuídas por pelo menos **7 datas distintas de negócio**.

As datas distintas são calculadas no fuso `America/Sao_Paulo`.

## Controle de mudanças

Qualquer PR que altere uma das fórmulas acima deve:

1. atualizar este catálogo;
2. declarar a regra anterior e a nova;
3. adicionar regressão de domínio e/ou PostgreSQL;
4. validar bordas de data quando o KPI usar período;
5. preservar snapshots históricos quando aplicável.
