# Documentação operacional

Esta pasta reúne a documentação da automação standalone de transferência e ativação de chatbot, desde a arquitetura que substituiu o roteamento do n8n até a homologação em produção.

## Conteúdo

1. [Arquitetura e regras de negócio](01-arquitetura-e-regras.md)
2. [Instalação em produção](02-instalacao-producao.md)
3. [Homologação pelo painel](03-homologacao.md)
4. [Operação e solução de problemas](04-operacao-e-troubleshooting.md)

## Estado homologado

- API e paginação validadas.
- Equipe de origem Geral validada.
- Telefone do contato obtido diretamente da API.
- Redis dispensado pela aplicação de transferência.
- Transferência por departamento e ativação posterior do chatbot validadas.
- Roteamento por tag e fallback Comercial validados.
- Painel de homologação validado em produção por túnel SSH.
- Idempotência persistida em SQLite validada.

Antes da ativação geral, o workflow equivalente no n8n deve ser desativado para evitar ações duplicadas.
