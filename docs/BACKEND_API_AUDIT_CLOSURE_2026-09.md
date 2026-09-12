# Fechamento da auditoria de Backend e APIs — 2026-09

Escopo: processamento server-side, validações, tratamento de erros, consistência, concorrência, idempotência e escalabilidade das APIs da NAT Gestão.

## Correções aplicadas

1. **RPCs legadas de mutação**: versões antigas e primitivas internas deixaram de ser executáveis diretamente por `authenticated`; o cliente usa APIs de comando atuais.
2. **Venda e duplo envio**: criação de venda passou a ser operação `create_sale` dentro de `apply_nat_transition_v2`, herdando o ledger `mutation_requests` e retry com a mesma request id.
3. **Atomicidade da venda**: venda não é mais gravada por uma RPC separada antes da transição. Venda + demais alterações da mesma transição são uma única transação PostgreSQL.
4. **Produção idempotente**: nova `record_inventory_production_v2` recebe `request_id`, grava hash e resultado em `api_idempotency_requests` e devolve o mesmo `production_id` em retry idêntico.
5. **Concorrência de compras/insumos**: `save_supply` agora serializa por `business_id + supply_id` com `pg_advisory_xact_lock` antes do padrão read-then-insert.
6. **Proteção de estoque**: preservados advisory locks, validação de saldo e rollback transacional existentes em produção/venda/cancelamento.
7. **Contrato de leitura de vendas**: `list_sales_page` foi atualizado para transportar todos os campos atuais do domínio (cliente, tipo, canal, entrega, desconto, override e mão de obra por item) mantendo paginação keyset e limite máximo 100.
8. **Retenção operacional**: o novo ledger de idempotência é removido após 7 dias pelo job de limpeza existente, evitando crescimento indefinido.
9. **Superfície de API**: APIs modernas e read-only permanecem expostas; primitivas internas continuam disponíveis para composição server-side por funções `SECURITY DEFINER`, sem acesso direto do cliente.

## Critérios de aceite

- `authenticated` não executa `save_sale_items`, `save_sale_items_v3`, `save_sale_items_v4`, `save_product`, `save_product_v2`, `save_supply` ou `record_inventory_production` diretamente.
- `authenticated` executa `apply_nat_transition_v2`, `record_inventory_production_v2`, `list_sales_page` e demais APIs públicas atuais necessárias.
- Repetir `apply_nat_transition_v2` com o mesmo `request_id` e payload não duplica alterações.
- Repetir `record_inventory_production_v2` com o mesmo `request_id` e payload retorna o mesmo resultado e não duplica movimentos.
- Reutilizar a mesma chave idempotente com payload diferente produz conflito.
- Alterações de um mesmo insumo são serializadas antes de criar snapshots de compra.
- Falha em qualquer operação de uma transição desfaz também a criação da venda da mesma transação.

Os diretórios `supabase/` deste repositório representam a camada PostgreSQL/Edge Functions usada pelo **Lovable Cloud** do projeto; não indicam uso de um projeto Supabase separado do Lovable Cloud.
