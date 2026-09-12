# Acessibilidade — WCAG 2.2 AA

## Objetivo
A NAT Gestão deve ser utilizável por pessoas com diferentes necessidades de visão, mobilidade, leitura e compreensão. Além da WCAG 2.2 nível AA, a interface prioriza linguagem simples porque a principal usuária não precisa conhecer tecnologia ou termos técnicos para operar o negócio.

## Regras de produto
- toda função essencial deve funcionar por teclado;
- o foco deve permanecer visível e previsível;
- mudanças de tela e resultados dinâmicos devem ser anunciáveis por tecnologia assistiva;
- campos devem ter nome acessível e erros devem dizer o que corrigir;
- controles necessários para identificar uma ação devem ter contraste suficiente;
- estados concluído, cancelado, inativo ou secundário não podem depender só de cor/opacidade;
- textos operacionais usam Lato; GFS Didot fica reservada principalmente à marca e a títulos;
- texto operacional deve evitar microtipografia; inputs usam 16px, rótulos e ajuda usam pelo menos 14px;
- termos técnicos ficam fora do fluxo principal ou recebem explicação em linguagem simples;
- controles de toque permanecem com área mínima de 44px na interface principal.

## Correções desta rodada
1. skip link para o conteúdo principal;
2. foco programático e título de documento ao trocar de área;
3. `aria-current` no menu desktop e mobile;
4. contraste reforçado de inputs e estados;
5. erros associados aos campos com `aria-invalid`/`aria-describedby` e foco orientado;
6. anúncio de quantidade de resultados da busca;
7. ajuda contextual sem controles interativos aninhados;
8. foco inicial determinístico na busca;
9. redefinição de senha sem redirecionamento automático curto;
10. linguagem e tipografia simplificadas para uso cotidiano.

## Automação
- regressões estáticas em `tests/accessibility-typography.test.ts`;
- Playwright + `@axe-core/playwright` nas telas públicas, filtrando WCAG A/AA e WCAG 2.2 AA;
- matriz responsiva/browsers e E2E autenticado continuam obrigatórios.

## Validação manual ainda necessária
Automação não substitui teste humano. Antes de declarar conformidade completa, realizar ao menos:
- NVDA + Chrome/Firefox no Windows;
- VoiceOver + Safari no macOS;
- VoiceOver no iPhone/iPad;
- TalkBack + Chrome no Android;
- percurso completo usando apenas teclado;
- Windows High Contrast / forced colors em dispositivo real;
- zoom de navegador e fonte ampliada do sistema;
- validação cognitiva com a usuária principal em tarefas reais: registrar compra, cadastrar produto, registrar venda, localizar cliente e criar compromisso.

## Critério de linguagem simples
Preferir frases como “O que você comprou?”, “Quanto você pagou?” e “Onde aconteceu a venda?” em vez de termos de sistema. Mensagens de erro devem informar o problema e a próxima ação. Detalhes técnicos de integrações, banco, autenticação e diagnósticos ficam em área opcional ou são direcionados ao responsável técnico.
