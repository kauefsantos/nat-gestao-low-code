# Regras comerciais e financeiras da NAT

Este documento descreve as regras que o sistema aplica para apoiar a operação. Ele não substitui orientação contábil ou jurídica.

## Preço e margem

Cada produto tem uma margem mínima e uma margem-alvo configuráveis. A cotação autoritativa considera custo congelado/estoque, taxa do meio de pagamento e custo de entrega.

- **Abaixo do custo:** exige confirmação explícita e justificativa.
- **Acima do custo, mas abaixo da margem mínima:** exige confirmação explícita e justificativa.
- **Entre a margem mínima e a margem-alvo:** a venda é permitida, mas recebe aviso.
- **Na margem-alvo ou acima:** fluxo normal.

Não existe um valor fixo de “frete grátis”. O valor mínimo do pedido é recalculado com o custo real da entrega, evitando que um frete absorvido pela NAT transforme uma venda aparentemente positiva em prejuízo.

## Prospecção, cortesia e venda

Uma saída deliberadamente promocional que não representa receita deve ser registrada como cortesia/saída não comercial, e não como venda. Quando houver receita real, mesmo em condição promocional, permanece venda e a exceção de margem fica registrada com seu motivo.

## Capital dos donos

- **Capital inicial:** valor de abertura do negócio; não é faturamento e não é novo aporte mensal.
- **Novo aporte:** dinheiro colocado pelos donos depois da abertura; também não é receita.
- **Retirada:** dinheiro retirado pelos donos; não reduz faturamento, mas afeta o fluxo de caixa.

O resultado operacional é apurado separadamente dessas origens de caixa.

## Fiado

Venda com pagamento posterior exige cliente cadastrado e data prometida. Promessa para o mesmo dia exige horário. A cobrança segue o SLA operacional já implementado, com alertas de atraso e criticidade.

## Fiscal

O sistema não presume que a NAT esteja enquadrada em MEI nem grava limite legal fixo no código. Obrigações, teto de faturamento e reserva tributária devem ser configurados apenas quando o enquadramento formal estiver definido e revistos quando a legislação mudar.
