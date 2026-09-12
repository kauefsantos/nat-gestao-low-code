# Governança de dados — NAT Gestão

## Objetivo

Este documento define quem responde pelos dados, como mudanças críticas são aprovadas, como acessos são revisados e como a origem das informações é rastreada.

## Modelo de responsabilidade da NAT

A NAT separa **autoridade de negócio** de **administração técnica**. O cargo empresarial não determina, por si só, privilégios de infraestrutura.

| Pessoa | Papel de governança | Responsabilidade principal |
| --- | --- | --- |
| **Natalia** | **CEO / Business Owner / Data Owner** | define e valida regras de negócio, significado dos dados, indicadores, operação, produtos, custos, vendas e demais decisões da NAT |
| **Kauê** | **Technical Owner / Developer / DBA / Security Admin** | implementa e mantém código, banco, migrations, RLS, autenticação, integrações, secrets, deploy, auditoria técnica, testes e segurança |

A Natalia é a autoridade final sobre **o que a regra de negócio deve significar**. O Kauê é a autoridade técnica sobre **como essa regra é implementada, protegida, testada e operada na infraestrutura**.

Exemplo: se houver dúvida sobre quando uma venda deve contar como faturamento, a regra comercial é validada pela Business Owner; a implementação, persistência, testes e controles técnicos ficam sob responsabilidade do Technical Owner.

## Papéis

| Papel | Responsabilidade |
| --- | --- |
| **Business Owner / Data Owner** | aprova significado dos dados, regras comerciais, processos operacionais e indicadores |
| **Technical Owner** | implementa schema, RPCs, integrações, migrations, testes e controles técnicos |
| **Data Steward / operação** | mantém cadastros corretos no uso diário e sinaliza inconsistências |
| **Reviewer de negócio** | valida alterações que mudam comportamento, regra, cálculo ou interpretação do negócio |
| **Reviewer técnico** | revisa alterações de código, banco, segurança e arquitetura quando houver segundo mantenedor qualificado |

No estágio atual, Natalia acumula Business Owner, Data Owner e operação. Kauê acumula Technical Owner, Developer, DBA e Security Admin.

Enquanto o projeto tiver um único mantenedor técnico, o Pull Request é o registro formal de mudança técnica. Mudanças críticas precisam declarar regra anterior, regra nova, impacto esperado e teste de regressão. Não é exigida aprovação técnica independente artificialmente. Quando houver um segundo mantenedor técnico qualificado, a proteção da `main` deverá passar a exigir aprovação independente para mudanças críticas.

Mudanças que alterem regra de negócio, indicador, processo operacional ou interpretação dos dados devem registrar a validação da Business Owner.

## Papéis técnicos na aplicação

Os papéis técnicos existentes em `business_members.role` continuam sendo `admin` e `member`. Eles representam **permissões técnicas**, não hierarquia empresarial.

| Papel técnico | Uso atual | Escopo esperado |
| --- | --- | --- |
| `admin` | Kauê | administração técnica: membros, configurações protegidas, auditoria e manutenção administrativa |
| `member` | Natalia | operação completa do negócio: produtos, receitas, insumos, compras, vendas, clientes, estoque, produção, agenda, financeiro operacional e indicadores |

A Natalia ser CEO não exige acesso a RLS, secrets, migrations, Edge Functions, configurações de autenticação, banco administrativo ou ferramentas de desenvolvimento. O princípio aplicado é **menor privilégio técnico sem reduzir a autoridade de negócio**.

O modelo atual de RLS já diferencia esses dois níveis: membros autenticados e com MFA operam os dados do negócio; operações administrativas sobre empresa, membros, configurações protegidas e trilha técnica permanecem restritas a administradores.

## Responsabilidade por domínio

| Domínio | Data Owner / validador de negócio | Technical Owner | Fonte autoritativa | Revisão |
| --- | --- | --- | --- | --- |
| Vendas e movimentações | Natalia | Kauê | PostgreSQL / RPCs de venda | mensal |
| Custos e precificação | Natalia | Kauê | compras + receitas + regras autoritativas | ao alterar receita, taxa ou margem |
| Caixa e despesas | Natalia | Kauê | PostgreSQL | mensal |
| Estoque e produção | Natalia | Kauê | ledger de estoque | mensal |
| Clientes / CRM | Natalia | Kauê | PostgreSQL | trimestral |
| Produtos e receitas | Natalia | Kauê | PostgreSQL | ao alterar produto/receita |
| Agenda | Natalia | Kauê | PostgreSQL | conforme rotina |
| Segurança e acessos | Kauê, com ciência da Natalia sobre quem pode operar o negócio | Kauê | Auth + `business_members` | trimestral |
| Indicadores | Natalia | Kauê | catálogo de métricas + backend | ao alterar fórmula |

## Regras para mudanças

Mudanças em `src/domain/**`, `src/data/**`, `supabase/migrations/**`, regras de precificação, indicadores ou autorização devem registrar no Pull Request:

1. regra ou definição alterada;
2. fonte dos dados afetada;
3. impacto esperado para a usuária;
4. risco e rollback;
5. teste de regressão correspondente;
6. eventual alteração no `METRIC_CATALOG.md`;
7. validação da Business Owner quando houver mudança funcional ou de regra de negócio.

A `main` continua protegida por Pull Request, histórico linear e checks obrigatórios. A aprovação humana técnica independente deve ser habilitada no ruleset somente quando existir um segundo reviewer técnico qualificado.

### Regra de aprovação

- **Mudança puramente técnica sem alterar comportamento do negócio:** Kauê implementa; CI, testes automatizados e PR são o controle principal.
- **Mudança de regra de negócio, cálculo, fluxo operacional ou indicador:** Natalia valida a decisão de negócio; Kauê implementa e valida tecnicamente.
- **Mudança de segurança, RLS, autenticação, banco ou infraestrutura:** Kauê é o responsável técnico; a Natalia deve ser informada quando houver impacto operacional ou risco para o negócio.

## Revisão de acessos

A aplicação é destinada, neste estágio, a **duas pessoas autorizadas**: Natalia para a operação do negócio e Kauê para a administração técnica. A periodicidade padrão de revisão é **90 dias** e o histórico fica em `public.access_reviews`.

A revisão deve confirmar:

- que Natalia continua com acesso operacional adequado;
- que Kauê continua com o acesso administrativo técnico necessário;
- que não existe conta adicional sem autorização explícita;
- que os papéis técnicos continuam compatíveis com as responsabilidades reais;
- que MFA e demais controles de autenticação permanecem ativos.

Qualquer terceiro usuário em `business_members` deve ser tratado como **exceção de governança** e exigir decisão explícita antes de permanecer com acesso.

Regras do fluxo:

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

Alterar uma fórmula de indicador exige atualizar o catálogo e criar ou ajustar regressão automatizada. A interpretação de negócio é validada pela Business Owner; a implementação técnica é responsabilidade do Technical Owner.

## Retenção e rastreabilidade

- vendas canceladas permanecem no histórico;
- estoque usa ledger de movimentos;
- compras preservam histórico de custo;
- alterações relevantes permanecem no `audit_log`;
- revisões de acesso e lotes de importação são históricos de governança e não devem ser usados como dados temporários de interface.
