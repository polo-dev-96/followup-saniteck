# Operação e solução de problemas

## Comandos diários

```bash
cd /opt/followup-service
docker compose ps
docker compose logs -f --tail=200 followup
```

Healthcheck sem `curl`:

```bash
docker compose exec followup node -e fetch('http://127.0.0.1:3000/health').then(r=>r.json()).then(console.log)
```

Reiniciar:

```bash
docker compose restart followup
```

Recriar depois de mudar `.env`:

```bash
docker compose up -d --force-recreate
```

## Interpretação do healthcheck

```text
ok: true            processo saudável
running: false      aguardando a próxima varredura; comportamento normal
dryRun: true        worker geral apenas simula
lastRun             horário da última varredura em UTC
lastError: null     nenhuma falha na última varredura
scanned             sessões retornadas pela API
eligible            sessões que passaram pelos filtros e janelas
actions.success     ações reais persistidas no SQLite
```

As ações feitas pelo painel de homologação aparecem em `actions.success`, mesmo quando o worker geral está com `DRY_RUN=true`.

## `scanned: 0`

Significa que a API não retornou sessões dentro das últimas 25 horas. Não é causado pelo filtro de departamento, que somente é aplicado depois da listagem.

Para validar, gere uma nova interação e repita:

```bash
docker compose run --rm followup node src/index.js --once
```

## `eligible: 0`

Pode significar:

- Nenhuma sessão está na equipe Geral.
- A sessão está concluída.
- A empresa ainda não respondeu depois do cliente.
- A sessão não está nas janelas de 15 minutos, 30 minutos, 2 horas ou 23 horas.
- As datas estão ausentes ou inválidas.

## Painel retorna 404

Confirme:

```bash
grep '^TEST_PANEL_ENABLED=' .env
```

Deve ser:

```env
TEST_PANEL_ENABLED=true
```

Depois recrie o container.

## Painel retorna 401

O token digitado não corresponde a `TEST_ADMIN_TOKEN`. Confira o valor no servidor sem publicá-lo em logs ou mensagens compartilhadas.

## Botão real bloqueado

Confirme:

```bash
docker compose exec followup printenv ALLOW_LIVE_TEST
```

Para homologação deve retornar `true`. Depois da homologação, o valor recomendado é `false`.

## `Address already in use` no túnel

O túnel foi iniciado no servidor ou a porta local escolhida está ocupada. Execute no computador local com outra porta:

```bash
ssh -N -L 39000:127.0.0.1:3000 root@IP_DO_SERVIDOR
```

Abra `http://localhost:39000/test`.

## Acesso pelo IP público não funciona

É intencional. O Compose publica `127.0.0.1:3000:3000`. A URL sem porta chega ao Caddy, não ao follow-up. Use túnel SSH.

Não troque para `0.0.0.0:3000` sem firewall, HTTPS e análise de segurança.

## `.env` alterado, mas healthcheck mantém valor antigo

Alterar o arquivo não modifica o ambiente de um container existente. Execute:

```bash
docker compose up -d --force-recreate
```

Depois confirme:

```bash
docker compose exec followup printenv DRY_RUN
```

## Logs HTTP 401, 429 ou 5xx

- `401` ou `403`: conferir token e conta da API.
- `429`: limite de requisições; o cliente tenta novamente.
- `5xx`: indisponibilidade externa; acompanhar retries e `lastError`.

Não interprete erro de API como ausência de conversas.

## Persistência e backup

O banco está no volume `followup-data`. Não execute:

```bash
docker compose down -v
```

Isso removeria o SQLite e o histórico usado para impedir duplicidades.

Liste o volume:

```bash
docker volume ls | grep followup
```

Mantenha backup periódico do volume. Execute apenas uma réplica do serviço usando esse banco SQLite.

## Atualização e rollback operacional

Antes de atualizar, confira o commit atual:

```bash
git log --oneline -1
```

Atualize:

```bash
git pull --ff-only origin main
docker compose up -d --build
```

Valide imediatamente `docker compose ps`, logs e healthcheck.

## Checklist de incidente

1. Manter ou voltar `DRY_RUN=true`.
2. Recriar o container.
3. Conferir healthcheck e logs.
4. Confirmar API, equipe e horários.
5. Não apagar o volume.
6. Não reativar simultaneamente o workflow antigo no n8n.
