# Case Study — NAT Gestão

## Contexto

A NAT Brownies e Brigadeiros Gourmet precisava de uma forma simples de acompanhar a operação sem depender de planilhas complexas ou conhecimentos técnicos.

A usuária principal não trabalha com dashboards, automações ou sistemas de gestão no dia a dia. Isso definiu a premissa do produto desde o início: **a ferramenta precisava explicar o negócio sem parecer uma ferramenta de BI**.

O projeto foi desenvolvido de forma incremental, combinando low-code para ganhar velocidade e código tradicional para garantir regras de negócio, segurança e previsibilidade.

## O problema

A operação de uma pequena confeitaria mistura decisões que parecem simples, mas estão conectadas:

- comprar ingredientes e embalagens;
- entender quanto cada receita realmente custa;
- definir um preço que não destrua a margem;
- registrar vendas rapidamente;
- acompanhar o que sobrou depois dos custos variáveis;
- saber o que está acabando;
- transformar insumo em produto acabado;
- lembrar compras, entregas e produção.

O risco de tratar cada ponto separadamente era criar várias pequenas ferramentas sem uma visão operacional única.

## Princípios de produto

### 1. A linguagem vem antes da tecnologia

Termos como “contribution margin”, “ledger”, “snapshot financeiro” ou “soft delete” não aparecem para a usuária.

Na interface, a pergunta é outra:

- “Quanto sobra nesta venda?”
- “Valor realmente recebido”
- “Pausado”
- “Estoque baixo”
- “Definir saldo inicial”

A arquitetura pode ser sofisticada; a experiência não precisa parecer sofisticada.

### 2. Mobile-first de verdade

O produto foi pensado para uso durante a rotina de produção e venda, principalmente no celular.

Isso influenciou:

- navegação inferior curta;
- formulários com inputs adequados ao iPhone;
- bottom sheets em ações operacionais;
- foco e teclado acessíveis;
- PWA;
- feedback persistente de salvamento;
- ausência de diálogos nativos de navegador nos fluxos principais.

### 3. Histórico deve ser confiável

Uma venda cancelada continua existindo como venda cancelada.

Um evento cancelado continua aparecendo no histórico.

Uma contagem de estoque não sobrescreve silenciosamente o saldo anterior: ela cria um movimento de ajuste.

Essa decisão trouxe mais rastreabilidade e simplificou auditoria.

### 4. O banco protege as regras importantes

O frontend ajuda e orienta, mas regras críticas também vivem no PostgreSQL.

Exemplos:

- produto pausado não pode ser vendido;
- venda acima do estoque monitorado é recusada;
- produção não acontece sem insumo suficiente;
- custo da venda é recalculado no backend;
- movimentos automáticos de estoque têm direção validada;
- tenant errado não consegue acessar dados de outro negócio.

## Estratégia low-code

O Lovable foi usado como acelerador de construção, especialmente na fase de prototipação e evolução visual.

A partir daí, o projeto recebeu camadas adicionais de engenharia para suportar uma operação real.

### Onde o low-code ajudou

- velocidade de prototipação;
- construção inicial do frontend;
- iteração rápida de layout;
- conexão com Lovable Cloud;
- ciclos curtos de teste com a usuária.

### Onde código sob medida foi necessário

- domínio de custos e precificação;
- pedidos multiproduto;
- disponibilidade temporária de produtos;
- ledger de estoque;
- transações de produção;
- idempotência;
- concorrência otimista;
- RLS e hardening de RPCs;
- push notifications;
- CI com banco descartável;
- testes de integridade e segurança.

O resultado é uma arquitetura híbrida: **low-code naquilo que acelera e código naquilo que precisa ser garantido**.

## Evolução do produto

### Etapa 1 — Custos e produtos

O primeiro núcleo respondeu à pergunta mais importante da operação: quanto custa fazer cada doce?

Foram modelados:

- compras;
- unidades de medida;
- receitas;
- rendimento;
- perdas;
- embalagem;
- custo de produção;
- margem mínima e alvo.

### Etapa 2 — Vendas e resultado

O fluxo de vendas passou a calcular snapshots financeiros no momento da operação.

Isso evita que uma alteração futura no custo de um ingrediente reescreva a leitura histórica de uma venda antiga.

Depois, o modelo evoluiu para pedidos com múltiplos produtos e cancelamento sem exclusão do histórico.

### Etapa 3 — Agenda e lembretes

A agenda ganhou ciclo de vida completo:

- criar;
- editar;
- concluir;
- reabrir;
- cancelar;
- lembrar.

Os lembretes são processados em janelas do dia e podem chegar via push no PWA.

### Etapa 4 — Estoque

O estoque foi desenhado para não quebrar a operação existente.

Por isso, o controle é ativado item por item.

Quando um item passa a ser monitorado:

- uma compra aumenta o saldo;
- uma produção consome os insumos monitorados;
- o produto acabado entra no estoque;
- uma venda reduz o produto;
- um cancelamento devolve apenas aquilo que realmente saiu;
- uma nova contagem registra a diferença como ajuste.

O saldo é resultado de um ledger, não de um campo editável.

## Decisões importantes

### Produto pausado ≠ produto arquivado

Um sabor pode ficar indisponível por alguns dias sem perder receita, histórico ou precificação.

Por isso, disponibilidade temporária e arquivamento são estados separados.

### IA foi desativada conscientemente

A infraestrutura de geração de conteúdo foi construída, mas o recurso foi desligado quando deixou de fazer sentido assumir custo de API naquele momento do negócio.

Isso é uma decisão de produto: **tecnologia só permanece ativa se gerar valor suficiente para justificar custo e complexidade**.

### Feedback de persistência é parte da UX

Como parte do estado é otimista, a interface passou a deixar explícito quando uma alteração está:

- salvando;
- salva;
- com erro e revertida.

Isso reduz a sensação de incerteza típica de aplicativos que “fecham o modal e torcem para ter salvo”.

## Segurança e confiabilidade

O projeto recebeu uma auditoria progressiva de backend e frontend, seguida de uma auditoria consolidada.

Entre os mecanismos implementados:

- RLS em todas as tabelas públicas;
- isolamento por `business_id`;
- membership e MFA/AAL2 para acesso comercial;
- RPCs autoritativas;
- transações atômicas;
- histórico imutável de estoque;
- proteção contra duplicação por retry;
- `search_path` controlado em funções privilegiadas;
- scanner de segredos;
- testes pgTAP/RLS;
- reconstrução completa do banco no CI.

## Qualidade

O pipeline valida:

```text
lint
→ TypeScript
→ segurança estática
→ Edge Functions
→ testes de domínio
→ build
→ auditoria de dependências
→ rebuild Supabase
→ migrations
→ RLS e integridade
→ lint do schema
```

## O que este case demonstra

Mais do que a aplicação em si, o projeto mostra capacidade de:

- levantar uma dor operacional real;
- transformar regra de negócio em experiência simples;
- trabalhar com low-code sem depender exclusivamente dele;
- modelar dados e transações;
- construir UX para público não técnico;
- evoluir um MVP sem reescrever tudo a cada nova funcionalidade;
- auditar e endurecer segurança depois da velocidade inicial de construção;
- equilibrar valor de negócio, custo técnico e manutenção.

## Próximos passos possíveis

A arquitetura deixa espaço para evoluções futuras sem serem necessárias para o funcionamento atual:

- previsão de reposição por histórico de consumo;
- sugestão de produção por demanda;
- comparativos de rentabilidade por sabor;
- dashboards históricos mais analíticos;
- reativação da IA quando houver justificativa financeira;
- integrações adicionais com canais de venda.

Esses itens são possibilidades de produto, não dependências para a operação atual.
