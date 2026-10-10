# Homologação pelo painel

## Objetivo

O painel permite testar a transferência e a ativação do chatbot para um único contato sem liberar o worker geral. O cenário recomendado durante a homologação é:

```env
DRY_RUN=true
TEST_PANEL_ENABLED=true
ALLOW_LIVE_TEST=true
TEST_ADMIN_TOKEN=TOKEN_ALEATORIO
```

Assim, as varreduras gerais apenas simulam ações. Somente uma execução confirmada no painel pode realizar chamadas reais.

## Proteções

- A API administrativa exige `TEST_ADMIN_TOKEN`.
- O telefone é normalizado e validado.
- O painel exige exatamente uma sessão aberta para o contato.
- A sessão precisa estar no departamento de origem.
- A empresa precisa ter respondido depois do cliente.
- A execução exige confirmação explícita.
- O SQLite impede repetição para a mesma sessão e referência.
- O painel não envia mensagens e não conclui a sessão.
- O chatbot somente é iniciado depois da transferência.

## Acesso remoto seguro

O Compose publica o serviço em:

```text
127.0.0.1:3000
```

Por isso, `http://IP_PUBLICO/test` não funciona e não deve ser habilitado diretamente. O acesso é feito por túnel SSH iniciado no computador onde está o navegador.

Use uma porta local distinta para evitar confusão com aplicações locais:

```bash
ssh -N -L 39000:127.0.0.1:3000 root@IP_DO_SERVIDOR
```

Mantenha o terminal aberto e acesse:

```text
http://localhost:39000/test
```

O fluxo é:

```text
Navegador local -> localhost:39000
                 -> túnel SSH
                 -> servidor 127.0.0.1:3000
                 -> painel de produção
```

Para comprovar que é produção, feche o túnel e atualize a página. Ela deve parar de responder. Ao reabrir o túnel, volta a funcionar.

Não execute o comando de túnel dentro do servidor. Isso tenta ocupar no próprio servidor a porta já utilizada pelo container e resulta em `Address already in use`.

## Procedimento

1. No servidor, confirme:

```bash
cd /opt/followup-service
grep -E '^(DRY_RUN|TEST_PANEL_ENABLED|ALLOW_LIVE_TEST)=' .env
```

2. Recrie o container se o `.env` mudou:

```bash
docker compose up -d --force-recreate
```

3. No computador local, abra o túnel SSH.
4. Abra o painel no navegador.
5. Informe o token administrativo.
6. Informe o telefone com DDD.
7. Clique em **Buscar e simular**.
8. Confirme sessão, status, equipe, resposta da empresa, tag e destino.
9. Marque a confirmação.
10. Clique em **Executar teste real**.
11. Confira a transferência e o chatbot na plataforma.

## Resultado homologado

Os testes realizados validaram:

```text
Transferência para MARINES quando a tag existia
Fallback para Comercial quando não havia tag reconhecida
Chatbot iniciado depois da transferência
Ações registradas no SQLite
```

Uma repetição na mesma sessão e referência é bloqueada. Uma nova sessão para o mesmo telefone é considerada um novo ciclo e pode executar novas ações.

## Logs

No servidor:

```bash
docker compose logs -f --tail=100 followup
```

Sucesso real:

```text
action.success / transfer_15m
action.success / chatbot_15m
```

Simulação do worker geral:

```text
action.would_run
```

## Encerramento da homologação

Depois de validar, altere:

```env
ALLOW_LIVE_TEST=false
```

O painel pode permanecer disponível para consultas:

```env
TEST_PANEL_ENABLED=true
```

Recrie:

```bash
docker compose up -d --force-recreate
```

Para desabilitar completamente o painel:

```env
TEST_PANEL_ENABLED=false
ALLOW_LIVE_TEST=false
```
