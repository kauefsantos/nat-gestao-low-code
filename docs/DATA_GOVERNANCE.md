# Governança de dados — NAT Gestão

## Objetivo

Este documento define quem responde pelos dados, como mudanças críticas são aprovadas, como acessos são revisados e como a origem das informações é rastreada.

## Papéis

| Papel | Responsabilidade |
| --- | --- |
| **Data Owner / responsável de negócio** | aprova significado dos dados, regras comerciais e indicadores |
| **Technical Owner** | implementa schema, RPCs, integrações, testes e controles técnicos |
| **Data Steward / operação** | mantém cadastros corretos no uso diário e sinaliza inconsistências |
| **Reviewer** | revisa alterações críticas de regra, dados, segurança e indicadores |

Enquanto o projeto tiver um único mantenedor técnico, o Pull Request é o registro formal de mudança. Mudanças críticas precisam declarar regra anterior, regra nova, impacto esperado e teste de regressão. Quando houver um segundo mantenedor apto, a proteção da `main` deve passar a exigir uma aprovação independente para mudanças críticas.

## Responsabilidade por domínio

| Domínio | Data Owner | Technical Owner | Fonte autoritativa | Revisão |
| --- | --- | --- | --- | --- |
| Vendas e movimentações | responsável pelo negócio NAT | mantenedor da aplicação | PostgreSQL / RPCs de venda | mensal |
| Custos e precificação | responsável pelo negócio NAT | mantenedor da aplicação | compras + receitas + regras autoritativas | ao alterar receita, taxa ou margem |
| Caixa e despesas | responsável pelo negócio NAT | mantenedor da aplicação | PostgreSQL | mensal |
| Estoque e produção | responsável pela operação NAT | mantenedor da aplicação | ledger de estoque | mensal |
| Clientes / CRM | responsável pelo negócio NAT | mantenedor da aplicação | PostgreSQL | trimestral |
| Produtos e receitas | responsável pela produção NAT | mantenedor da aplicação | PostgreSQL | ao alterar produto/receita |
| Agenda | responsável pela operação NAT | mantenedor da aplicação | PostgreSQL | conforme rotina |
| Segurança e acessos | administrador do negócio | mantenedor da aplicação | Auth + `business_members` | trimestral |
| Indicadores | responsável pelo negócio NAT | mantenedor da aplicação | catálogo de métricas + backend | ao alterar fórmula |

## Regras para mudanças

Mudanças em `src/domain/**`, `src/data/**`, `supabase/migrations/**`, regras de precificação, indicadores ou autorização devem registrar no Pull Request:

1. regra ou definição alterada;
2. fonte dos dados afetada;
3. impacto esperado para a usuária;
4. risco e rollback;
5. teste de regressão correspondente;
6. eventual alteração no `METRIC_CATALOG.md`.

A `main` continua protegida por Pull Request, histórico linear e checks obrigatórios. A aprovação humana independente deve ser habilitada no ruleset assim que existir um segundo reviewer qualificado.

## Revisão de acessos

A periodicidade padrão é **90 dias**. O histórico fica em `public.access_reviews`.

- `retain`: mantém o acesso e agenda a próxima revisão;
- `revoke`: registra a decisão e remove o membership;
- somente administradores podem registrar ou consultar revisões;
- a proteção de último administrador continua valendo;
- uma revisão vencida é aquela sem revisão registrada ou com `next_review_at < current_date`.

RPCs:

- `record_access_review_v1`
- `list_access_review_status_v1`

## Origem e linhagem dos dados

### Dados digitados manualmente

A origem operacional é a própria aplicação. Alterações relevantes permanecem cobertas pelo `audit_log` e pelos snapshots históricos existentes.

### Receitas importadas por CSV

O conteúdo do CSV **não é armazenado**. A aplicação registra somente:

- tipo de origem (`file_csv` ou `pasted_csv`);
- nome do arquivo, quando houver;
- SHA-256 do conteúdo;
- versão do parser;
- quantidade de linhas importadas;
- usuário;
- produto associado;
- data/hora.

A etapa de importação cria um registro temporário em `private.pending_recipe_imports`. Quando o produto é efetivamente salvo, um trigger converte esse registro em `public.recipe_import_batches`, ligando a origem ao produto. Registros temporários com mais de duas horas não são associados automaticamente.

## Contexto da trilha de auditoria

O `audit_log` preserva `before_data` e `after_data` e, além disso, registra contexto suficiente para explicar a alteração:

- `source`: fluxo que originou a mudança, como `ui_transition`, `csv_import`, `access_review`, `application` ou `system`;
- `request_id`: identificador de correlação das alterações realizadas na mesma transação idempotente;
- `change_reason`: motivo quando o fluxo fornece uma justificativa, como cancelamento ou revisão de acesso;
- `actor_type`: `user`, `system` ou `service`;
- `app_version`: versão do aplicativo quando o chamador disponibilizar esse contexto.

Transições normais da interface propagam o mesmo `request_id` para os registros gerados pelo fluxo. Importações de receita registram `csv_import`; revisões de acesso registram `access_review` e a justificativa da decisão. Alterações sem usuário autenticado são classificadas como `system`.

O campo `app_version` é intencionalmente opcional: a estrutura já está preparada, mas não deve receber uma versão inventada quando o runtime não fornece um identificador confiável de release.

## Indicadores

O significado oficial de cada KPI está em [`METRIC_CATALOG.md`](METRIC_CATALOG.md). O fuso operacional oficial é **America/Sao_Paulo**.

Alterar uma fórmula de indicador exige atualizar o catálogo e criar ou ajustar regressão automatizada.

## Retenção e rastreabilidade

- vendas canceladas permanecem no histórico;
- estoque usa ledger de movimentos;
- compras preservam histórico de custo;
- alterações relevantes permanecem no `audit_log`;
- revisões de acesso e lotes de importação são históricos de governança e não devem ser usados como dados temporários de interface.
