# Privacidade e retenção — NAT Gestão

Versão do aviso: **privacy-2026-09**  
Data: **2026-09-11**

Este documento registra a política operacional de privacidade da NAT Gestão. Os prazos abaixo são escolhas de governança da NAT e **não representam um prazo universal imposto pela LGPD**. Obrigações legais/regulatórias específicas podem justificar retenção diferente.

## Dados, finalidade e retenção

| Categoria | Exemplos | Finalidade | Retenção operacional | Destino final |
|---|---|---|---|---|
| CRM identificável | nome, telefone, Instagram, origem, observações | atendimento e relacionamento comercial | até 24 meses sem relacionamento comercial ativo, se não houver consentimento de marketing válido | exclusão dos identificadores e desvinculação das vendas |
| Consentimento de marketing | status, data, origem, versão do aviso, ator | comprovar autorização/revogação | consentimento válido por até 24 meses; histórico mínimo pode permanecer sem PII direta | expiração/revogação; evidência pseudonimizada conforme necessidade de governança |
| Vendas e financeiro | itens, valores, datas, custos, pagamento | operação, gestão financeira e histórico comercial | conforme necessidade operacional/contábil | preservado sem identificação do cliente após erasure/retention |
| Logs de IA | formato, contagem de caracteres, status, latência, tokens | segurança, custo e observabilidade | 90 dias | exclusão automática |
| Entrega de push | IDs técnicos, slot/data/status | entrega e diagnóstico de notificações | 90 dias | exclusão automática |
| Mutation requests | idempotência e consistência | evitar duplicidade de gravações | 7 dias | exclusão automática |
| Diagnósticos do navegador | erros redigidos, rota e stack redigida | suporte técnico | 14 dias no dispositivo | expiração automática ou limpeza manual |
| Solicitação de privacidade | UUID técnico do cliente, tipo, data, ator, resultado | provar atendimento da solicitação sem reter PII direta | até 5 anos | exclusão automática |

## Compartilhamentos

- **Lovable Cloud**: hospeda o banco PostgreSQL e a infraestrutura da aplicação.
- **OpenAI**: a função de IA está atualmente desativada na interface. Se reativada, somente prompts sem dados pessoais evidentes podem ser enviados. O backend bloqueia e-mail, telefone, CPF/CNPJ e identificadores explícitos antes de qualquer chamada ao provedor.
- Backups gerados pela aplicação são, por padrão, **privacy-safe** e não incluem nome, telefone, Instagram, observações ou consentimento de marketing.

## Direitos do titular

O titular pode solicitar confirmação/acesso, correção, revogação do consentimento de marketing e exclusão/anonymização dos dados pessoais, observadas as hipóteses de conservação legal aplicáveis.

Canal operacional da NAT: **Instagram @natgourmet.doces**.

Na exclusão de um cliente, a aplicação preserva fatos financeiros e itens vendidos, mas remove o vínculo `customer_id` e apaga o cadastro identificável. O audit log de `customers` mantém apenas metadados técnicos mínimos e não conserva nome, telefone, Instagram, origem, observações ou consentimento.

## Minimização

O campo Observações aceita no máximo 500 caracteres e não deve conter CPF, documentos, informações de saúde ou dados sensíveis/desnecessários. O backend rejeita padrões claros de CPF/CNPJ nesse campo.

## Revisão

Revisar esta política a cada mudança material de finalidade, fornecedor, categoria de dados ou fluxo de compartilhamento e, no mínimo, na revisão periódica de governança.