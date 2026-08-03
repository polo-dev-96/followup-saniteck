# Arquitetura e regras de negócio

## Objetivo

O serviço substitui o workflow de follow-ups do n8n por um processo Node.js leve. A aplicação consulta periodicamente a API Helena/WTS, identifica conversas elegíveis e executa as ações correspondentes.

## Arquitetura

```text
Agendador interno (10 minutos)
           |
           v
API de sessões Helena/WTS
           |
           v
Filtro da equipe Geral e sessões abertas
           |
           +-- 15 minutos -> mensagem -> chatbot
           +-- 30 minutos -> mensagem -> chatbot -> transferência
           +-- 2 horas    -> mensagem -> chatbot -> transferência
           +-- 23 horas   -> encerramento -> conclusão
           |
           v
SQLite: estado, tentativas e idempotência
```

## Redis

O workflow principal do n8n grava `chatbot-context:<sessionId>` no Redis, mas o serviço de follow-up não precisa consultar essa chave. A listagem da API fornece a sessão e o telefone, enquanto `BOT_KEY` e `CHANNEL_FROM` são configurações fixas.

O SQLite substitui o Redis no controle interno das ações. Ele registra mensagem, chatbot, transferência e conclusão separadamente, evitando repetição depois de reinícios.

## Equipes homologadas

```text
Equipe de origem Geral:
6e9426e0-1166-46a7-9c4b-129e46af49bc

Fallback Comercial:
20a67e6a-83dc-4f95-9430-5bc51eeae7e4
```

Todas as mensagens novas chegam inicialmente à equipe Geral. Após o follow-up, o atendimento é transferido conforme a tag do vendedor. Sem tag reconhecida, segue para Comercial.

## Sessões aceitas

Uma sessão somente é considerada quando:

- Pertence ao `SOURCE_DEPARTMENT_ID`.
- Está em `STARTED`, `PENDING` ou `IN_PROGRESS`.
- Não possui `endAt`.
- Possui datas válidas em `lastMessageIn` e `lastMessageOut`.
- `lastMessageOut` é posterior a `lastMessageIn`.

A última condição significa que a empresa já respondeu ao cliente e agora aguarda uma nova manifestação dele.

Exemplo elegível:

```text
10:00 Cliente: Quero um orçamento.
10:05 Empresa: Quantas camisas você precisa?
10:35 Cliente ainda não respondeu.
```

Exemplo bloqueado:

```text
10:00 Empresa: Quantas camisas você precisa?
10:10 Cliente: Preciso de 30 camisas.
10:40 Empresa ainda não respondeu.
```

No segundo exemplo, seria incorreto enviar uma mensagem dizendo que a empresa aguarda o cliente.

## Janelas

- De 15 até menos de 25 minutos: primeiro follow-up, sem transferência.
- De 30 até menos de 40 minutos: segundo follow-up, com transferência.
- De 120 até menos de 130 minutos: follow-up de 2 horas, com transferência.
- De 1.380 até menos de 1.440 minutos: encerramento.
- A consulta considera interações das últimas 25 horas.

Na implementação homologada, o tempo é calculado desde `lastMessageIn`, preservando o comportamento do workflow original.

## Roteamento

Tags reconhecidas, sem diferenciar caixa ou acentos:

```text
ALYNNE, ESTER, GABRIELA, KATIANA,
MARINES, MONICA, SONIA, SUELEN
```

Se houver mais de uma tag de vendedor, vale a primeira na ordem configurada. Sem correspondência, usa-se o departamento Comercial.

## Idempotência

A chave lógica de cada ação combina:

```text
sessionId + actionType + referência da última mensagem recebida
```

Isso impede repetir a mesma ação para a mesma interação. Uma nova sessão ou nova mensagem do cliente cria outra referência e pode gerar um novo ciclo válido.
