# Case Study — NAT Gestão

## Contexto

A NAT é uma pequena operação de confeitaria. A usuária principal precisava controlar custos, preços, vendas e rotina sem depender de planilhas complexas, dashboards técnicos ou vários aplicativos desconectados.

Essa restrição definiu o produto: **a ferramenta precisava organizar uma operação real sem exigir que a usuária aprendesse tecnologia para conseguir trabalhar**.

O projeto nasceu em Lovable para reduzir o tempo entre ideia e validação. Conforme passou a lidar com dinheiro, estoque, clientes e automações reais, recebeu camadas de engenharia em React, TypeScript e PostgreSQL.

---

## O problema

Uma confeitaria pequena mistura decisões que parecem independentes, mas afetam o mesmo resultado:

- comprar ingredientes e embalagens;
- saber quanto cada receita custa;
- incluir perdas, mão de obra e despesas de produção;
- definir preço sem destruir margem;
- registrar vendas rapidamente;
- separar faturamento de dinheiro efetivamente recebido;
- controlar vendas a prazo e cobrança;
- acompanhar clientes e recorrência;
- saber o que está acabando;
- transformar insumo em produto acabado;
- lembrar compras, produção e entregas.

Construir um módulo isolado para cada problema criaria outro tipo de fragmentação. A proposta passou a ser uma **camada operacional única**, com linguagem simples e regras consistentes por baixo.

---

## Princípios de produto

### 1. A linguagem vem antes da tecnologia

A arquitetura usa termos como snapshot, ledger, idempotência, RLS e SLA. A interface usa expressões como:

- “Valor da venda”;
- “Dinheiro recebido”;
- “A receber”;
- “Vai pagar depois”;
- “Marcar como pago”;
- “Estoque baixo”.

Complexidade técnica só é justificável quando reduz complexidade para a pessoa que usa o produto.

### 2. Mobile-first é uma restrição operacional

O sistema é usado enquanto a pessoa compra, produz e vende. Por isso o produto prioriza:

- navegação curta;
- formulários compatíveis com toque;
- inputs que não provocam zoom indevido no iPhone;
- safe areas;
- diálogos roláveis com teclado aberto;
- feedback de persistência;
- PWA e Web Push.

### 3. Histórico deve explicar o que aconteceu

Cancelar não significa apagar. Ajustar estoque não significa sobrescrever. Alterar o custo atual de um ingrediente não deve reescrever a margem de uma venda antiga.

O produto preserva fatos históricos por snapshots, movimentos e estados explícitos.

### 4. O backend protege a regra importante

O frontend orienta, mas não é a única barreira. O Lovable Cloud também valida regras como:

- isolamento entre negócios;
- produto pausado não entra em venda nova;
- estoque monitorado não pode ficar negativo por operação inválida;
- produção exige insumo suficiente;
- venda a prazo exige cliente e promessa de pagamento;
- recebível e dinheiro em caixa são valores distintos;
- funções privilegiadas exigem autorização adequada.

---

## Evolução do produto

### Etapa 1 — Custos e precificação

O primeiro núcleo respondeu à pergunta mais importante: **quanto custa produzir cada item?**

Foram modelados:

- compras e histórico de preço;
- unidade de medida e conversão;
- receita e rendimento;
- perdas;
- embalagem;
- mão de obra;
- gás, energia e outros custos de produção;
- taxa por forma de pagamento;
- margem mínima e recomendada.

O cálculo de preço deixou de ser um número solto e virou uma regra reproduzível.

### Etapa 2 — Vendas e resultado

As vendas passaram a congelar preço e custo no momento da operação. Depois evoluíram para:

- pedidos multiproduto;
- desconto/acréscimo com justificativa;
- confirmação explícita para venda abaixo do custo;
- cancelamento preservando histórico;
- custo de entrega;
- canal de venda;
- separação entre venda comercial, cortesia, consumo próprio e perda.

### Etapa 3 — Estoque e produção

O estoque foi introduzido sem exigir uma migração brusca da operação.

O controle pode ser ativado item por item. A partir daí:

- compra aumenta saldo;
- produção consome insumos;
- produto acabado entra no estoque;
- venda reduz saldo;
- cancelamento devolve somente o que realmente saiu;
- nova contagem registra diferença como ajuste.

O saldo é consequência de movimentos, não um campo editado silenciosamente.

### Etapa 4 — Agenda e notificações

A agenda ganhou ciclo completo de criar, editar, concluir, reabrir e cancelar. O processamento de lembretes passou a considerar o fuso do negócio e ganhou idempotência, retry e monitoramento operacional.

### Etapa 5 — Clientes, fiado e cobrança

Quando apareceu a necessidade real de venda a prazo, o fluxo foi integrado ao modelo financeiro em vez de virar apenas uma observação de texto.

Uma venda pode ser:

- **paga agora** — faturamento e caixa entram juntos;
- **vai pagar depois** — faturamento entra, caixa permanece zerado e surge uma conta a receber.

Para vender a prazo:

- o cliente precisa estar identificado;
- a promessa guarda uma data;
- quando a promessa é para o mesmo dia, horário também é obrigatório;
- data futura sem horário usa 09:00 como referência operacional;
- o sistema acompanha atraso, reincidência e histórico de advertência;
- a quitação posterior registra a forma de pagamento real;
- a ficha do cliente reúne contato, compras e comportamento de pagamento.

### Etapa 6 — Resumo executivo

O sistema passou a gerar uma leitura diária compacta com faturamento, resultado, unidades vendidas e clientes em atraso crítico. O envio reutiliza a mesma infraestrutura de notificações resilientes e possui recuperação sem duplicar mensagens já entregues.

---

## Uma decisão financeira importante: faturamento ≠ caixa

A evolução para contas a receber exigiu separar conceitos que pequenos negócios frequentemente misturam:

- **faturamento:** valor econômico vendido;
- **dinheiro recebido:** o que efetivamente entrou;
- **a receber:** venda concluída ainda não quitada;
- **aporte:** dinheiro dos proprietários colocado na operação;
- **reinvestimento:** dinheiro da própria empresa usado novamente;
- **resultado:** efeito econômico depois de custos e despesas.

Essa separação melhora a decisão sem transformar a interface em contabilidade formal.

---

## Estratégia low-code

| Low-code acelerou | Engenharia garantiu |
| --- | --- |
| prototipação | regras financeiras |
| iteração visual | contas a receber |
| descoberta com a usuária | estoque e produção transacional |
| conexão inicial com cloud | autorização e integridade |
| velocidade de MVP | retries, idempotência e concorrência |
| evolução rápida de UI | CI, banco descartável e E2E |

O projeto não trata low-code como atalho para ignorar engenharia. Trata low-code como **ferramenta de compressão do ciclo de produto**.

---

## Segurança e confiabilidade

A aplicação passou por auditorias progressivas e ganhou controles proporcionais ao risco dos dados:

- RLS + FORCE RLS;
- isolamento por `business_id`;
- MFA/AAL2;
- RPCs autoritativas;
- `search_path` controlado;
- funções internas sem execução por clientes;
- idempotência;
- concorrência otimista;
- ledger de notificações e dead-letter;
- retenção e minimização de dados pessoais;
- rastreabilidade de mudanças;
- migrations reproduzíveis;
- pgTAP/RLS/integridade;
- testes de domínio e navegador.

---

## Qualidade como parte do produto

O pipeline não valida apenas se o frontend compila. Ele verifica:

```text
lint
→ TypeScript
→ boundaries de arquitetura
→ segurança e privacidade
→ Edge Functions
→ domínio
→ build
→ orçamento de performance
→ dependências
→ rebuild do banco
→ migrations
→ pgTAP / RLS / integridade
→ E2E mobile e autenticado
```

Isso permite evoluir rapidamente sem transformar cada nova funcionalidade em uma regressão inesperada.

---

## O que este case demonstra

Mais do que uma aplicação de confeitaria, o projeto demonstra capacidade de:

- descobrir uma dor operacional real;
- transformar regras de negócio em UX simples;
- separar conceitos financeiros corretamente;
- usar low-code sem ficar preso a ele;
- modelar dados, autorização e transações;
- automatizar tarefas sem perder rastreabilidade;
- evoluir um MVP de forma incremental;
- testar e endurecer uma aplicação antes que sua complexidade fique invisível.

## Próximas evoluções possíveis

Não são dependências para a operação atual, mas fazem sentido conforme o volume crescer:

- política configurável de limite de crédito por cliente;
- orçamento mensal de promoções/prospecção;
- reserva de caixa e meta de capital de giro;
- categorias contábeis/gerenciais mais detalhadas para despesas;
- previsão de reposição e sugestão de produção;
- histórico analítico mais longo por cliente e produto.

Essas possibilidades entram somente quando o custo de complexidade for menor que o valor operacional gerado.
