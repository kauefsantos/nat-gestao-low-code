# Smoke test em dispositivos reais

Executar antes de releases com mudanças relevantes de frontend, navegação, formulários, autenticação ou PWA.

## Dispositivos e navegadores

| Ambiente | Navegador | Prioridade |
| --- | --- | --- |
| iPhone | Safari | P0 |
| iPhone com app instalado | PWA | P1 |
| iPad | Safari | P1 |
| Android | Chrome | P0 |
| Android Samsung | Samsung Internet | P2 |
| Windows | Edge | P1 |
| Windows | Firefox | P2 |
| macOS | Safari | P1 |
| macOS | Chrome | P2 |

## Fluxo mínimo

1. Abrir login e confirmar ausência de rolagem horizontal.
2. Focar e-mail e senha e verificar que o teclado não esconde o botão de entrada.
3. Entrar com MFA e confirmar leitura/digitação do código.
4. Percorrer Início, Vendas e saídas, Clientes, Análises, Agenda, Estoque, Catálogo, Produtos, Preços e Identidade.
5. Abrir menu `Mais` em retrato e paisagem.
6. Abrir `Buscar na NAT`, focar o campo e conferir rolagem com teclado aberto.
7. Registrar uma compra de teste e cancelar antes de salvar, quando possível.
8. Abrir Novo produto, adicionar ingrediente e conferir quantidade/unidade em tela estreita.
9. Abrir um modal de confirmação e verificar que os dois botões permanecem acessíveis com teclado aberto.
10. Testar rotação retrato/paisagem sem perder conteúdo.
11. Verificar safe area inferior e superior em aparelho com notch/Dynamic Island.
12. Aumentar fonte do sistema e repetir Início, Produtos e Vendas.
13. Aplicar zoom de navegador a 200% no desktop e conferir navegação e formulários.
14. Validar toque em fechar, editar, menus, abas e botões secundários sem necessidade de precisão excessiva.
15. Confirmar que não há ação importante disponível apenas por hover.

## Critério de aprovação

O smoke é aprovado quando:

- nenhum CTA crítico fica inacessível;
- não existe rolagem horizontal da página inteira;
- não ocorre zoom involuntário ao focar inputs no Safari;
- o teclado virtual não encobre a única forma de concluir/fechar um fluxo;
- menus e modais permanecem dentro da viewport;
- os dados e regras de negócio continuam iguais entre os dispositivos;
- não há diferença funcional material entre Chrome, Edge, Firefox e Safari nos fluxos testados.

Registrar data, dispositivo, versão do sistema/navegador e resultado no PR/release correspondente.
