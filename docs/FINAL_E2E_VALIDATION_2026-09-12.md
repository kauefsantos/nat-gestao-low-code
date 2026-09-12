# Validação E2E final — 2026-09-12

Branch criada exclusivamente para disparar as suítes de CI/E2E contra o estado consolidado da `main` após as auditorias.

## Escopo automatizado

- build, lint, TypeScript e arquitetura;
- segurança estática, privacidade e dependências;
- rebuild completo das migrations em banco descartável;
- RLS e integridade;
- login, MFA real e isolamento entre negócios;
- área autenticada e navegação principal;
- responsividade em 320/390/768/1440 px;
- Chromium, Firefox e WebKit;
- teclado virtual/touch targets/zoom de fonte;
- acessibilidade automatizada WCAG 2.2 AA;
- páginas públicas e estados básicos.

## Escopo complementar

Após a execução dos workflows, serão confrontados também o app publicado e o Lovable Cloud para smoke checks de configuração, catálogo e dados operacionais críticos.

Este arquivo não altera regra de negócio nem comportamento da aplicação; existe apenas para gerar uma execução pós-merge rastreável das suítes de validação.
