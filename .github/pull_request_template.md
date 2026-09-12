## Objetivo
<!-- Qual problema esta mudança resolve? -->

## Mudanças
<!-- Resuma o que foi alterado. -->

## Governança da mudança
<!-- Se a mudança tocar regra de negócio, dados, indicadores, autorização ou migrations, preencha. Caso contrário, escreva "não se aplica". -->
- Regra/definição anterior:
- Regra/definição nova:
- Fonte(s) de dados afetada(s):
- Impacto esperado para a usuária:
- Responsável de negócio que validou a regra:
- `docs/METRIC_CATALOG.md` precisa ser atualizado? [ ] sim [ ] não

## Risco e rollback
<!-- Informe risco relevante e como desfazer, ou escreva "baixo / revert do PR". -->

## Validação
- [ ] `npm run check` passou quando aplicável
- [ ] Alterações de banco vieram com migration e regressão em `supabase/tests`
- [ ] Alterações de indicador preservam `America/Sao_Paulo` e têm teste de borda de data quando aplicável
- [ ] Alterações de acesso/autorização foram conferidas contra a matriz de permissões e revisão de acesso
- [ ] UX foi conferida em mobile quando a interface mudou
- [ ] Nenhum segredo, dado pessoal, dado de cliente ou receita operacional real foi incluído
- [ ] Migrations/testes/docs usam somente dados fictícios; nenhum backfill de cliente real foi versionado
- [ ] Screenshots, issues e descrição desta PR foram revisados para não expor dados de clientes
