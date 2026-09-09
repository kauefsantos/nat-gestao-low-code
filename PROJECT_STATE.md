# NAT Gestão — Estado do Projeto

## Objetivo
Aplicação simples e responsiva para Natalia acompanhar vendas, custos e precificação da NAT Brownies e Brigadeiros Gourmet.

## Princípios
- Linguagem cotidiana, sem jargão financeiro desnecessário.
- Mobile-first.
- Poucos passos por tarefa.
- Cálculos explicáveis.
- Identidade visual da NAT em toda a experiência.

## Fluxo principal
1. Cadastrar o que foi comprado.
2. Montar o produto e sua receita.
3. Descobrir custo unitário, preço mínimo e preço recomendado.
4. Registrar a venda.
5. Acompanhar faturamento e resultado.

## Arquitetura limpa
- `src/domain/nat.ts`: regras de negócio e cálculos.
- `src/hooks/use-nat-store.ts`: estado e persistência local por usuário.
- `src/app/NatApp.tsx`: interface autenticada.
- `src/routes`: landing page, login, cadastro e dashboard.
- `src/integrations/supabase/client.ts`: autenticação Supabase.

## Implementado
- Ingredientes e embalagens.
- Conversões kg/g, L/ml e unidades.
- Receitas, rendimento, perdas e custo de produção.
- Precificação por margem.
- Simulador de preço.
- Registro de vendas com snapshot de custo.
- Indicadores mensais.
- Configurações básicas.
- Responsividade mobile/desktop.

## Próximas etapas
1. Teste E2E do fluxo principal.
2. Persistência normalizada em Supabase.
3. Histórico de compras e evolução de custo por ingrediente.
4. Estoque somente depois de validar o uso real.
