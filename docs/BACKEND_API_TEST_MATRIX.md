# Backend/API hardening — matriz de validação

| Cenário | Resultado esperado |
|---|---|
| Chamar RPC legada de venda como `authenticated` | `permission denied` |
| `apply_nat_transition_v2` com mesma request id + mesmo payload | segunda chamada é no-op, sem duplicar |
| mesma request id + payload diferente | conflito |
| `create_sale` junto de outra operação que falha | rollback da venda e de toda a transição |
| produção v2 repetida com mesma request id | mesmo production id; sem movimentos duplicados |
| produção v2 com mesma request id e payload diferente | conflito |
| duas gravações concorrentes do mesmo insumo | serialização pelo advisory lock |
| `list_sales_page` | resposta limitada a 100, cursor keyset e campos atuais do domínio |
| limpeza diária | remove ledgers de idempotência com mais de 7 dias |
| erro de versão no cliente | classificado como `VERSION_CONFLICT` e recarga do estado |
