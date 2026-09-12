# Modelo de acesso — NAT Gestão

## Pessoas autorizadas

A aplicação é destinada, no estágio atual, a duas pessoas:

- **Natalia** — CEO / Business Owner / Data Owner. Usa a plataforma para a operação do negócio.
- **Kauê** — Technical Owner / Developer / DBA / Security Admin. Responsável por desenvolvimento, banco, segurança, autenticação, deploy e manutenção técnica.

## Papéis técnicos

Os papéis `admin` e `member` representam permissões técnicas e não hierarquia empresarial.

| Papel | Pessoa | Escopo |
| --- | --- | --- |
| `admin` | Kauê | administração técnica, membros, configurações protegidas, auditoria e manutenção |
| `member` | Natalia | operação do negócio: produtos, receitas, insumos, compras, vendas, clientes, estoque, produção, agenda, financeiro operacional e indicadores |

Qualquer terceiro usuário deve ser tratado como exceção e passar por decisão explícita de acesso.
