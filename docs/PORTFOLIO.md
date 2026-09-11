# NAT Gestão — Portfolio One-Pager

> **Case de produto low-code com operação real:** uma aplicação mobile-first para transformar custos, vendas, estoque e agenda de uma pequena confeitaria em decisões simples para uma usuária não técnica.

## Resumo executivo

A NAT Gestão nasceu de uma necessidade real: a usuária principal precisava administrar uma confeitaria sem depender de planilhas complexas, dashboards técnicos ou controles separados.

O projeto começou com **Lovable** para acelerar prototipação e iteração visual. Conforme a operação ganhou complexidade, foram adicionadas camadas de engenharia em React, TypeScript e PostgreSQL para garantir regras de negócio, segurança, histórico e automações confiáveis.

O resultado é um exemplo de abordagem híbrida: **low-code onde acelera; código sob medida onde a regra precisa ser garantida**.

## Meu papel no projeto

Atuação ponta a ponta, da descoberta à validação técnica:

- levantamento da necessidade e tradução das dores operacionais;
- desenho dos fluxos e linguagem para público não técnico;
- prototipação e evolução visual em Lovable;
- modelagem de custos, receitas, produtos e vendas;
- desenho do módulo de estoque e produção;
- automações de agenda e push;
- integração frontend/backend;
- modelagem de dados e regras autoritativas no PostgreSQL;
- RLS, hardening de RPCs e auditoria;
- testes de domínio, pgTAP/RLS e CI;
- refinamento mobile-first e acessibilidade.

## O problema

A operação precisava responder perguntas simples, mas conectadas:

| Pergunta da operação | Como o produto responde |
| --- | --- |
| Quanto custa cada doce? | Receita + histórico de compras + conversão de unidades |
| Quanto devo cobrar? | Preço mínimo, recomendado e simulação de margem |
| Quanto realmente sobrou da venda? | Snapshot financeiro calculado no backend |
| O que está acabando? | Estoque mínimo e alertas por item |
| Quanto posso produzir? | Produção consome estoque monitorado de forma transacional |
| O que preciso fazer hoje? | Agenda com ciclo de vida completo e lembretes push |

## Destaques de produto

### UX para público não técnico

A arquitetura pode ser sofisticada, mas a interface evita jargão. Em vez de “contribution margin”, a usuária vê **“Quanto sobra nesta venda”**. Em vez de “inventory reconciliation”, vê **“Ajustar contagem”**.

### Mobile-first operacional

A aplicação foi pensada para uso durante produção, compra e venda. Navegação curta, bottom sheets, formulários compatíveis com celular, feedback de persistência e PWA fazem parte do fluxo principal.

### Estoque sem ruptura

O controle é ativado item por item. Assim, a nova funcionalidade não paralisa a operação existente. O saldo é derivado de um ledger de movimentos, não de um campo editado manualmente.

### Histórico confiável

Venda cancelada permanece no histórico. Evento cancelado permanece auditável. Ajuste de estoque gera movimento. Isso preserva rastreabilidade sem complicar a experiência.

## Estratégia low-code

| Low-code | Engenharia sob medida |
| --- | --- |
| prototipação rápida | regras de custo e precificação |
| iteração visual | pedidos multiproduto |
| validação com usuária | ledger de estoque |
| conexão inicial com cloud | produção transacional |
| velocidade de MVP | RLS e segurança |
| evolução de UI | idempotência e concorrência |
| | CI e regressões de banco |

Essa divisão mostra um princípio importante do case: **não transformar low-code em dependência cega nem código tradicional em fim em si mesmo**.

## Arquitetura em uma frase

**React/TypeScript no produto, PostgreSQL como fonte autoritativa das regras críticas, Lovable como acelerador de construção e GitHub Actions como rede de segurança.**

## Competências demonstradas

- Product discovery
- UX mobile-first
- Low-code / no-code
- React + TypeScript
- Modelagem de dados
- PostgreSQL / Supabase
- Regras de negócio
- RLS e segurança
- Automação
- PWA e Web Push
- Testes e CI
- Refatoração incremental
- Comunicação para público não técnico

## Evidências técnicas

O pipeline automatizado valida:

`lint → TypeScript → scanner de segurança → Edge Functions → testes de domínio → build → dependências → rebuild do banco → migrations → pgTAP/RLS → lint do schema`

Além do CI, fluxos críticos de Agenda, Push, Estoque e “Outro insumo” foram validados no Lovable Cloud real com testes reversíveis.

## Decisões que representam maturidade de produto

- **Pausar não é arquivar:** indisponibilidade temporária não apaga contexto.
- **IA não é obrigatória:** a infraestrutura foi preservada, mas o recurso ficou desativado enquanto o custo não se justificava.
- **Banco é autoritativo:** regra financeira crítica não depende apenas do frontend.
- **Estoque é opt-in:** adoção gradual vale mais do que impor uma migração brusca.
- **Feedback de salvamento é parte da UX:** a usuária sabe quando algo está salvando, salvo ou foi revertido.

## O que eu destacaria em uma entrevista

Este projeto não é interessante porque “usa Lovable”. Ele é interessante porque mostra **como usar low-code para encurtar o caminho entre uma dor real e um produto utilizável, sem abandonar modelagem, segurança, testes e responsabilidade técnica quando a solução começa a operar dados reais**.

---

### Leia também

- [README principal](../README.md)
- [Case study completo](CASE_STUDY.md)
- [Arquitetura](ARCHITECTURE.md)
- [Segurança](../SECURITY.md)
- [Estado técnico do projeto](../PROJECT_STATE.md)
