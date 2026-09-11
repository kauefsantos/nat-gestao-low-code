# NAT Gestão

Este repositório contém exclusivamente a NAT Gestão, aplicação da NAT Brownies e Brigadeiros Gourmet.

## Fluxo principal
Compra → ingrediente/embalagem → produto/receita → precificação → venda → resultado.

## Regras de produto
- Mobile-first e linguagem simples.
- Títulos em GFS Didot e interface em Lato.
- Paleta NAT: Chocolate #35150A, Cacau #55281B, Rosé #EAAC93, Rosé claro #F2C5B5, Creme #F8EEE9.
- Receita pode ser preenchida manualmente ou por CSV no formato `Ingrediente;Quantidade;Unidade`.
- O navegador mostra prévias, mas o PostgreSQL é a autoridade dos snapshots financeiros.

## Regras permanentes de segurança
- RLS obrigatório por `business_id`.
- Dados comerciais exigem membership + AAL2/MFA.
- `anon` sem grants nas tabelas de negócio.
- Nunca adicionar service-role ou segredo administrativo ao frontend.
- Não persistir dados financeiros em localStorage.
- Não permitir alteração direta de histórico de vendas/compras.
- Não enfraquecer RLS, MFA, constraints ou headers para facilitar desenvolvimento.
- Toda mudança de banco deve ter migration e teste RLS.
