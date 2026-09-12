# Responsividade e compatibilidade

## Escopo suportado

A NAT Gestão deve funcionar sem perda de operação nas seguintes faixas de tela:

- celular compacto: 320 px de largura ou mais;
- celular padrão: aproximadamente 390 px;
- paisagem móvel: aproximadamente 844 × 390 px;
- tablet: aproximadamente 768 × 1024 px;
- computador: 1366 × 768 px e 1440 × 900 px ou superiores.

Telas abaixo de 320 px não fazem parte da matriz oficial.

## Navegadores

A política é suportar as duas versões principais estáveis mais recentes de:

- Google Chrome;
- Microsoft Edge, pela compatibilidade com o motor Chromium;
- Mozilla Firefox;
- Safari em macOS;
- Safari em iOS/iPadOS.

O CI usa Chromium, Firefox e WebKit como motores de referência. WebKit no Playwright reduz risco de regressões do Safari, mas não substitui teste em iPhone, iPad ou Mac reais.

## Critérios mínimos de interface

- nenhum fluxo operacional pode exigir rolagem horizontal da página;
- controles principais de toque devem ter alvo mínimo de 44 × 44 px;
- inputs em dispositivos touch devem usar no mínimo 16 px para evitar zoom involuntário no Safari;
- modais, drawers e menus devem continuar utilizáveis com viewport reduzido pelo teclado virtual;
- safe areas de iPhone/iPad devem ser respeitadas;
- hover não pode ser requisito para concluir uma ação;
- formulários devem continuar utilizáveis com fonte ampliada a 200%;
- a interface deve preservar foco visível e navegação por teclado.

## Matriz automatizada

A suíte Playwright cobre:

- 320 × 568;
- 390 × 844;
- 768 × 1024;
- 844 × 390;
- 1366 × 768;
- 1440 × 900;
- Chromium;
- Firefox;
- WebKit;
- páginas públicas;
- área autenticada responsiva em Chromium;
- fonte ampliada a 200%;
- evidências visuais anexadas aos testes principais.

## Limites da automação

A automação não equivale a:

- Safari físico em iPhone/iPad;
- Safari real de macOS;
- Samsung Internet;
- teclado virtual real do sistema;
- Dynamic Island/notch físico;
- PWA instalada e aberta fora do navegador;
- configurações de acessibilidade específicas do sistema operacional.

Esses cenários ficam cobertos pelo checklist manual de dispositivos reais em `docs/REAL_DEVICE_SMOKE.md`.
