# Backend/API final checklist

- [x] Venda criada dentro da transição atômica.
- [x] Retry da transição usa a mesma request id.
- [x] Produção possui request id idempotente e resultado persistido.
- [x] Insumo usa advisory lock antes de decidir novo snapshot de compra.
- [x] RPCs antigas/primitivas não são executáveis diretamente por `authenticated`.
- [x] Paginação de vendas preserva campos atuais do domínio.
- [x] Ledger de idempotência possui limpeza automática.
- [x] Erros de mutação possuem classificação estável no cliente.
- [x] Testes SQL adicionados para superfície de API e contratos.
