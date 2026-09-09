# NAT Gestão — Estado do Projeto

## Objetivo
Aplicação simples e responsiva para a Natalia acompanhar vendas, custos e precificação da NAT Brownies e Brigadeiros Gourmet.

## Princípios de produto
- Linguagem simples, sem jargão financeiro desnecessário.
- Mobile-first e utilizável por pessoas sem experiência com dashboards.
- Fluxo principal: cadastrar compra -> montar produto/receita -> precificar -> registrar venda -> acompanhar resultado.
- Identidade NAT: Chocolate #35150A, Cacau #55281B, Rosé #EAAC93, Rosé claro #F2C5B5, Creme #F8EEE9; GFS Didot em títulos e Lato em interface.

## Arquitetura atual
- TanStack Start + React + TypeScript + Tailwind.
- Supabase mantido para autenticação.
- Dados de negócio v2 persistidos localmente por usuário nesta primeira fundação limpa.
- Domínio e cálculos em `src/domain/nat.ts`.
- Store em `src/hooks/use-nat-store.ts`.
- Aplicação em `src/app/NatApp.tsx`.

## Funcionalidades implementadas
- Início com faturamento, unidades, sobra das vendas e resultado estimado.
- Onboarding em três passos.
- Cadastro de ingredientes e embalagens com conversão g/kg, ml/L e unidades.
- Cadastro de produtos, receita, rendimento, perdas e custos de produção.
- Precificador com custo unitário, preço mínimo, preço recomendado e simulador.
- Registro de vendas com snapshot de custo e resultado.
- Configurações de custos fixos, taxa média e margens.
- Navegação mobile inferior e sidebar em desktop.

## Próximas etapas
1. CI verde.
2. Testes E2E do fluxo principal.
3. Persistência normalizada no Supabase e histórico de compras/preços.
4. Refinos de UX após uso real pela Natalia.
