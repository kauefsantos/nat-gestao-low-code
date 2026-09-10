# NAT Gestão

Aplicação privada de gestão para a NAT Brownies e Brigadeiros Gourmet.

Ela responde quatro perguntas do dia a dia: quanto custa fazer, por quanto vender, quanto foi vendido e quanto realmente sobrou.

## Funcionalidades
- Ingredientes e embalagens com histórico de compras.
- Receita manual ou por CSV (`Ingrediente;Quantidade;Unidade`).
- Conversão automática entre kg/g, L/ml e unidades.
- Custo unitário, perdas, produção e embalagem.
- Preço mínimo, preço recomendado e simulação.
- Registro rápido de vendas.
- Snapshots financeiros recalculados no PostgreSQL no momento da venda.
- Visão mensal de faturamento, unidades e resultado estimado.
- Interface mobile-first.
- Dois ou mais usuários na mesma empresa via membership.
- MFA obrigatório e RLS por `business_id`.

## Stack
React 19, TanStack Start/Router, TypeScript, Tailwind CSS, Supabase/PostgreSQL e Cloudflare build.

## Desenvolvimento
```bash
npm ci
npm run dev
```

Validação completa:
```bash
npm run check
```

Os testes de RLS são executados no GitHub Actions usando uma instância Supabase descartável.

## Segurança
Leia `SECURITY.md` e `PROJECT_STATE.md` antes de alterações estruturais. Nunca coloque `service_role`, `sb_secret_` ou credenciais administrativas no frontend.
