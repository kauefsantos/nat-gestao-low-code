# Publicação do case

Este repositório público documenta a evolução técnica da NAT Gestão, um produto ligado a uma operação real.

## O que pode aparecer no repositório

- regras de negócio e fórmulas usadas pela aplicação;
- arquitetura, migrations, testes e mecanismos de segurança;
- nomes de funcionalidades, categorias e itens de catálogo;
- exemplos operacionais e ajustes de produto necessários para explicar decisões técnicas;
- valores ou quantidades estritamente necessários para reproduzir regras e regressões de software.

Por isso, **o repositório não deve ser interpretado como uma base integralmente fictícia ou totalmente desacoplada da operação real**.

## O que não deve ser publicado

- senhas, tokens, chaves privadas ou segredos de infraestrutura;
- dados pessoais de clientes reais;
- números de telefone, documentos, endereços ou informações sensíveis;
- dumps do banco de produção;
- credenciais ou dados que permitam acesso ao Lovable Cloud;
- conteúdo privado sem necessidade técnica para o case.

A aplicação em produção e seu banco operacional permanecem separados do GitHub público. O código demonstra o raciocínio de produto, as regras de negócio e a engenharia empregada sem transformar o repositório em uma cópia dos dados de produção.

## Histórico Git

Remover um dado de um arquivo atual não o elimina automaticamente do histórico Git. Caso um segredo ou dado pessoal seja identificado em qualquer commit, o procedimento correto é revogar/rotacionar o segredo quando aplicável e tratar a remoção do histórico de forma explícita.
