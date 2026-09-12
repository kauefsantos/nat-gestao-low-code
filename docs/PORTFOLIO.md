# NAT Gestão — Portfolio One-Pager

> **Case de produto low-code com operação real:** uma PWA mobile-first que conecta custos, vendas, caixa, estoque, clientes e agenda de uma pequena confeitaria sem exigir experiência com sistemas de gestão.

## Em uma frase

A NAT Gestão começou como uma solução rápida em Lovable e evoluiu para um produto com **React + TypeScript + PostgreSQL no Lovable Cloud**, regras autoritativas no backend, RLS, automações, testes e CI.

O princípio é deliberado: **low-code onde acelera; código sob medida onde a regra precisa ser garantida**.

## O problema

A operação precisava responder, no mesmo fluxo, perguntas que normalmente ficam espalhadas em planilhas e anotações:

| Pergunta | Resposta no produto |
| --- | --- |
| Quanto custa produzir? | compras + receita + rendimento + perdas + embalagem + mão de obra |
| Quanto cobrar? | preço mínimo, recomendado e margem |
| Quanto foi vendido? | faturamento econômico da venda |
| Quanto realmente entrou? | caixa recebido separado do faturamento |
| Quem ainda precisa pagar? | contas a receber + promessa + SLA de cobrança |
| Quem é um bom pagador? | ficha de cliente + histórico de compras e pagamentos |
| O que está acabando? | ledger de estoque + mínimo + alertas |
| O que fazer hoje? | agenda + lembretes + resumo executivo diário |

## Meu papel

Atuação ponta a ponta:

- descoberta e tradução das dores da operação;
- desenho de regras de negócio;
- UX e linguagem para público não técnico;
- prototipação e evolução visual no Lovable;
- frontend em React/TypeScript;
- modelagem de dados e PostgreSQL;
- RPCs, jobs e Edge Functions;
- precificação, custos, estoque e contas a receber;
- RLS, MFA, privacidade e integridade;
- testes de domínio, pgTAP e E2E;
- CI/CD e governança de mudanças.

## Quatro decisões que representam o produto

### 1. Faturamento não é caixa

Uma venda a prazo entra no faturamento, mas o dinheiro só entra no caixa quando a quitação acontece. A aplicação preserva os dois conceitos separadamente.

### 2. Crédito tem regra, não memória informal

Venda fiada exige cliente cadastrado e promessa de pagamento. O sistema acompanha SLA, alerta atraso, registra advertência crítica e mantém o histórico na ficha do cliente.

### 3. Estoque é histórico, não um número editável

Compras, produção, venda, cancelamento e ajuste geram movimentos. O saldo é consequência desse ledger.

### 4. Dinheiro dos proprietários não vira receita

Aporte, reinvestimento da empresa, compras e retiradas são dimensões separadas. Isso evita confundir financiamento da operação com resultado comercial.

## Arquitetura do case

```text
PWA / React + TypeScript
        ↓
Domínio e validações
        ↓
Adaptadores de dados
        ↓
RPCs / Edge Functions
        ↓
PostgreSQL / Lovable Cloud
        ↓
RLS + invariantes + auditoria + jobs
```

O frontend orienta a experiência; o backend reaplica regras financeiras, autorização e integridade.

## Engenharia proporcional ao risco

O projeto possui:

- RLS + FORCE RLS;
- isolamento por negócio;
- MFA/AAL2;
- idempotência e proteção contra duplicidade;
- retries e dead-letter para notificações;
- concorrência otimista;
- migrations reproduzíveis;
- pgTAP para RLS/integridade;
- Playwright autenticado;
- Chromium, Firefox e WebKit;
- verificações automatizadas de WCAG 2.2 AA;
- orçamento de performance;
- auditoria de dependências.

## Competências demonstradas

`Product Discovery` · `Regras de negócio` · `Low-code` · `UX mobile-first` · `React` · `TypeScript` · `PostgreSQL` · `Lovable Cloud` · `RLS` · `Automação` · `PWA` · `Web Push` · `CI/CD` · `E2E` · `Segurança` · `Governança de dados`

## O que eu destacaria em uma entrevista

O ponto forte deste projeto não é apenas a stack. É a capacidade de **partir de uma operação pequena e real, decidir o que precisa ser simples para a usuária e o que precisa ser rigoroso por baixo da interface, e evoluir de low-code para engenharia sem reescrever o produto inteiro**.

---

### Aprofundamento

- [README principal](../README.md)
- [Case Study](CASE_STUDY.md)
- [Arquitetura](ARCHITECTURE.md)
- [Segurança](../SECURITY.md)
- [Escopo de publicação](PUBLICATION_NOTES.md)
