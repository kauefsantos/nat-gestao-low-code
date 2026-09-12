# Backend/API implementation status

Status: implementação preparada em branch `fix/backend-api-hardening` e aplicada no Lovable Cloud para a camada de banco.

Banco Lovable Cloud:
- RPCs legadas/primitivas internas: acesso direto de `authenticated` revogado.
- `apply_nat_transition_v2`: permanece pública para cliente autenticado.
- `record_inventory_production_v2`: pública e idempotente.
- `list_sales_page`: pública/read-only, keyset pagination.
- `api_idempotency_requests`: privada para cliente e com retenção operacional de 7 dias.
- `save_supply`: serializado por advisory lock.

Cliente:
- novas vendas entram como `create_sale` em `apply_nat_transition_v2`.
- produção usa `record_inventory_production_v2` e mantém a mesma request id nos retries internos.
- erros de mutação passam por classificação estável antes de virar mensagem de interface.
