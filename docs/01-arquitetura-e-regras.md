# Arquitetura e regras de negócio

## Objetivo

O serviço consulta periodicamente a API Helena/WTS, identifica conversas elegíveis, transfere cada atendimento para o departamento do vendedor indicado por tag e inicia o chatbot depois da transferência. Ele não envia mensagens de follow-up e não conclui sessões.

## Arquitetura

```text
Agendador interno (10 minutos)
           |
           v
API de sessões Helena/WTS
           |
           v
Filtro da equipe de origem e sessões abertas
           |
           +-- 15–30 min  -> transferência -> chatbot
           +-- 2 horas    -> transferência de contingência -> chatbot
           |
           v
SQLite: estado, tentativas e idempotência
```

## Equipes homologadas

```text
Equipe de origem Geral:
6e9426e0-1166-46a7-9c4b-129e46af49bc

Fallback Comercial:
20a67e6a-83dc-4f95-9430-5bc51eeae7e4
```

Todas as mensagens novas chegam inicialmente à equipe de origem. Quando a conversa entra em uma janela válida, o atendimento é transferido conforme a tag do vendedor e o chatbot é iniciado em seguida. Sem tag reconhecida, segue para Comercial.

## Sessões aceitas

Uma sessão somente é considerada quando:

- Pertence ao `SOURCE_DEPARTMENT_ID`.
- Está em `STARTED`, `PENDING` ou `IN_PROGRESS`.
- Não possui `endAt`.
- Possui datas válidas em `lastMessageIn` e `lastMessageOut`.
- `lastMessageOut` é posterior a `lastMessageIn`.

A última condição significa que a empresa já respondeu ao cliente.

## Janelas

- De 15 até menos de 30 minutos: transferência principal seguida do chatbot.
- De 120 até menos de 130 minutos: transferência de contingência seguida do chatbot.
- A consulta considera interações das últimas 25 horas.

O tempo é calculado desde `lastMessageIn`, preservando o comportamento do workflow original.

Depois de uma transferência bem-sucedida, a sessão deixa de pertencer ao departamento de origem e não volta a ser elegível. Por isso, a janela de 2 horas atende principalmente conversas que não foram transferidas na janela de 15–30 minutos.

Não existe ação de encerramento na antiga janela de 23–24 horas.

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
sessionId + tipo da ação + referência da última mensagem recebida
```

Transferência e chatbot são registrados separadamente. Isso impede repetir uma ação bem-sucedida para a mesma interação. O chatbot só é executado depois que a transferência tem sucesso.

Uma nova sessão ou nova mensagem do cliente cria outra referência e pode gerar um novo ciclo válido.

O SQLite registra sucesso, falha, quantidade de tentativas e o próximo horário permitido para repetição.
