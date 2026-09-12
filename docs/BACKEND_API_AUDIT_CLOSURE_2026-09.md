# Fechamento da auditoria de Backend e APIs — 2026-09

Escopo: processamento server-side, validações, tratamento de erros, consistência, concorrência, idempotência e escalabilidade das APIs da NAT Gestão.

## Correções aplicadas

1. **RPCs legadas de venda**: as assinaturas históricas foram mantidas apenas como fachadas de compatibilidade e agora delegam às regras comerciais atuais (`save_sale_items_v4`). As implementações antigas reais (`*_impl`) não são executáveis por `authenticated`.
2. **Venda e duplo envio**: criação de venda passou a ser operação `create_sale` dentro de `apply_nat_transition_v2`, herdando o ledger `mutation_requests` e retry com a mesma request id. A tela usa um `saleId` estável por abertura e trava submissões repetidas de forma síncrona.
3. **Atomicidade da venda**: venda não é mais gravada por uma RPC separada antes da transição. Venda + demais alterações da mesma transição são uma única transação PostgreSQL.
4. **Produção idempotente**: nova `record_inventory_production_v2` recebe `request_id`, grava hash e resultado em `api_idempotency_requests` e devolve o mesmo `production_id` em retry idêntico. A assinatura histórica também converge retries exatos imediatos para o registro recém-criado.
5. **Concorrência de compras/insumos**: `save_supply` agora serializa por `business_id + supply_id` com `pg_advisory_xact_lock` antes do padrão read-then-insert.
6. **Proteção de estoque**: preservados advisory locks, validação de saldo e rollback transacional existentes em produção/venda/cancelamento.
7. **Contrato de leitura de vendas**: `list_sales_page` foi atualizado para transportar todos os campos atuais do domínio (cliente, tipo, canal, entrega, desconto, override e mão de obra por item) mantendo paginação keyset e limite máximo 100.
8. **Retenção operacional**: o novo ledger de idempotência é removido após 7 dias pelo job de limpeza existente, evitando crescimento indefinido, e a tabela usa RLS habilitado e forçado.
9. **Erros e superfície de API**: o cliente classifica conflitos de versão, conflitos de idempotência, validação, autorização, rede e erros internos. APIs de compatibilidade continuam disponíveis sem permitir o bypass das regras atuais; implementações internas permanecem fechadas.

## Critérios de aceite

- As RPCs históricas de venda não contêm mais a lógica antiga permissiva: delegam à regra atual.
- `authenticated` não executa `save_sale_items_v3_impl`, `save_sale_items_v4_impl` nem `record_inventory_production_impl`.
- `apply_nat_transition_v2` com mesma request id + mesmo payload não duplica alterações.
- A tela de venda não aceita uma segunda submissão enquanto a primeira está sendo entregue ao store.
- `record_inventory_production_v2` com mesma request id + mesmo payload retorna o mesmo resultado e não duplica movimentos.
- Reutilizar a mesma chave idempotente com payload diferente produz conflito.
- Alterações de um mesmo insumo são serializadas antes de criar snapshots de compra.
- Falha em qualquer operação de uma transição desfaz também a criação da venda da mesma transação.
- APIs paginadas limitam volume e retornam os campos atuais do domínio.

Os diretórios `supabase/` deste repositório representam a camada PostgreSQL/Edge Functions usada pelo **Lovable Cloud** do projeto; não indicam uso de um projeto Supabase separado do Lovable Cloud.
