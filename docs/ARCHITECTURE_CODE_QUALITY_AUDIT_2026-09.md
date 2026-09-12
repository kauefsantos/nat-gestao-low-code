# Auditoria de Arquitetura e Qualidade do Código — 2026-09

## Escopo

Auditoria da NAT Gestão baseada na funcionalidade de ROI, cobrindo organização, separação de responsabilidades, duplicação, dependências, manutenção, regras financeiras e tipografia. O backend e banco de dados da aplicação são o **Lovable Cloud**.

As correções foram feitas em branch isolada. Esta etapa não realiza merge, não publica frontend, não publica Edge Functions e não altera dados de produção.

## Resumo executivo

A arquitetura foi fortalecida em quatro frentes: domínio dividido em módulos menores, acesso ao Lovable Cloud concentrado em `src/data`, comandos de negócio extraídos da composição principal e CI com regras arquiteturais explícitas. O ROI permanece baseado em snapshots históricos e passou a respeitar de forma explícita o fuso `America/Sao_Paulo`.

Não permanecem exceções de UI autorizadas para acesso direto ao cliente do Lovable Cloud. Componentes, `NatApp` e rotas de autenticação usam adaptadores semânticos.

## Achados e correções

### A1 — ROI mensal dependia do fuso do dispositivo

**Gravidade:** alta  
**Prioridade:** P1  
**Status:** corrigido

Uma venda próxima da virada do mês poderia ser classificada no mês incorreto em dispositivo com fuso diferente. `businessRoi` agora usa `businessDate()` e o fuso de negócio `America/Sao_Paulo`. Existe teste explícito para a virada UTC/São Paulo em `tests/roi-analytics.test.ts`.

### A2 — Telas acessavam o Lovable Cloud diretamente

**Gravidade:** média-alta  
**Prioridade:** P1  
**Status:** corrigido

Foram extraídos adaptadores para Inteligência, cotação autoritativa de venda, diagnóstico de integrações, privacidade de clientes e IA. As telas deixaram de importar o cliente de infraestrutura diretamente.

As rotas `login`, `signup`, `forgot-password` e `reset-password` também passaram a usar `src/data/auth-repository.ts`, mantendo sessão, MFA, recuperação e troca de senha fora da camada de apresentação.

### A3 — Loader operacional legado duplicava responsabilidade

**Gravidade:** média  
**Prioridade:** P1  
**Status:** corrigido

`src/data/nat-operational-repository.ts` foi removido. O store usa apenas o fluxo operacional ativo V2/V3, e há regressão automatizada para impedir o retorno do loader antigo.

### A4 — Snapshot gerado de tipos do Lovable Cloud estava atrasado

**Gravidade:** média-alta  
**Prioridade:** P1  
**Status:** mitigado de forma segura

O schema real possui campos e contratos mais recentes que o último snapshot gerado versionado. A integração disponível não autorizou uma regeneração completa automática. Para não editar manualmente um arquivo gerado, foi criada `src/integrations/lovable-cloud/database.ts`, uma camada de schema efetivo baseada nos campos confirmados no Lovable Cloud e nos contratos introduzidos pelas migrations da branch.

O cliente usa esse schema efetivo, e casts frágeis foram removidos das áreas críticas. A regeneração integral do snapshot continua recomendada quando houver acesso autorizado ao gerador, mas não bloqueia esta etapa arquitetural.

### A5 — Concentração excessiva de responsabilidades

**Gravidade:** média  
**Prioridade:** P2  
**Status:** corrigido no núcleo e protegido contra regressão

`src/domain/nat.ts` foi transformado em uma fachada de reexports. Regras foram separadas em módulos de tipos, formatação, pricing, finanças, clientes, analytics e vendas, preservando a API pública usada pelo restante do app.

Comandos de cliente, caixa, arquivamento, cancelamento, duplicação e proteção contra ações duplicadas saíram de `NatApp` para `useNatCommands`. O componente principal fica mais próximo de composição/navegação.

O architecture gate rejeita arquivos de primeira parte acima de 30 KB, evitando nova concentração excessiva.

### A6 — Exceções de infraestrutura na UI

**Gravidade:** média  
**Prioridade:** P2  
**Status:** corrigido

A allowlist de componentes foi removida. O gate agora bloqueia qualquer acesso direto ao cliente do Lovable Cloud em `src/components`, `src/app` e `src/routes`. O acesso autorizado à infraestrutura fica concentrado na camada `src/data` e nos adaptadores técnicos.

### A7 — CI não protegia arquitetura

**Gravidade:** média  
**Prioridade:** P1  
**Status:** corrigido

Foi criado `scripts/architecture-check.mjs`, conectado ao `package.json` e ao workflow principal. O gate verifica, entre outros pontos:

- domínio não depende de data/hooks/UI/integrations;
- data não depende de UI/hooks;
- UI e rotas não acessam o cliente do Lovable Cloud diretamente;
- `nat.ts` permanece fachada leve;
- loader legado não retorna;
- arquivos de primeira parte não ultrapassam 30 KB.

### A8 — Tipografia e leitura de dados financeiros

**Gravidade:** baixa  
**Prioridade:** P3  
**Status:** melhorado

A identidade `GFS Didot` + `Lato` foi preservada. Foram adotados números tabulares para KPIs/valores financeiros, pesos de interface mais consistentes e títulos responsivos com `clamp()`. GFS Didot permanece voltada a títulos e marca; Lato permanece como fonte de leitura e interface.

## ROI — regra validada

- ROI por sabor usa `unitCostSnapshot` e `unitPriceSnapshot` históricos.
- Taxa e entrega são rateadas pela participação da receita da linha.
- Venda cancelada e movimentação não comercial não entram no ROI de venda.
- ROI consolidado mensal inclui custo vendido, taxa, entrega, custos fixos e gastos esporádicos.
- Aporte pessoal e reinvestimento da NAT são fontes de dinheiro e não são somados novamente como custo.
- O mês é determinado pelo fuso `America/Sao_Paulo`.
- Financeiro mostra ROI consolidado; Inteligência mostra consolidado e ROI por sabor.
- ROI possui ajuda contextual acessível por um `i`, incluindo a diferença entre margem e retorno sobre o investimento.

## Validação exigida para encerramento

O head final deve passar integralmente pelos workflows da branch, incluindo:

- lint;
- TypeScript;
- architecture gate;
- segurança estática e privacidade;
- typecheck/lint das Edge Functions;
- testes de domínio e ROI;
- build;
- budget de performance;
- auditoria de dependências;
- reconstrução descartável do banco pelas migrations, RLS e integridade;
- E2E autenticado, MFA e isolamento entre empresas;
- matriz Chromium/Firefox/WebKit;
- responsividade e WCAG automatizado.

## Limitações restantes

A única dívida arquitetural deliberadamente mantida nesta etapa é o snapshot gerado antigo de tipos: ele não foi adulterado manualmente. A camada de schema efetivo do Lovable Cloud cobre o drift conhecido até que uma regeneração completa e autorizada possa substituir o snapshot.

## Segurança da mudança

A PR permanece draft e empilhada sobre a branch de ROI. Nenhuma alteração desta auditoria é considerada publicada em produção até merge e publicação explícitos.