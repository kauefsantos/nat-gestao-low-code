# Engineering notes — business & finance hardening

Esta rodada conecta decisões de negócio diretamente à engenharia da aplicação:

- cálculo autoritativo de margem no Lovable Cloud;
- proteção contra venda abaixo da margem mínima;
- recomendação dinâmica de preço considerando taxa e entrega;
- capital inicial separado de aportes recorrentes;
- carregador operacional público com nomes estáveis, sem expor versões internas ao consumidor;
- `validate` passa a depender do resultado do workflow Mobile E2E nas pull requests;
- regressões de domínio e pgTAP cobrem os novos contratos.

Os valores de margem continuam configuráveis por produto. Não há limite tributário ou regra fiscal legal codificada como constante.
