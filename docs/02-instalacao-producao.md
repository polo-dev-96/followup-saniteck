# Instalação em produção

## Topologia recomendada

O serviço deve permanecer separado da aplicação existente:

```text
/opt/saniteck/          aplicação existente
/opt/followup-service/ novo serviço de follow-up
```

Cada diretório é um projeto Docker Compose independente. O follow-up não precisa acessar o MySQL, Redis ou rede Docker do projeto `/opt/saniteck`.

## Pré-requisitos

```bash
docker --version
docker compose version
git --version
```

Confirme que a porta 3000 do host está livre:

```bash
ss -ltnp | grep ':3000'
```

Nenhuma saída significa que ela pode ser usada. O Compose publica o painel somente em `127.0.0.1`, sem exposição pública.

## Clonar

```bash
mkdir -p /opt/followup-service
cd /opt/followup-service
git clone https://github.com/polo-dev-96/followup-saniteck.git .
```

Em atualizações posteriores:

```bash
cd /opt/followup-service
git pull --ff-only origin main
```

## Configuração

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Configuração inicial segura:

```env
API_TOKEN=TOKEN_REAL
DRY_RUN=true

API_BASE_URL=https://api.wts.chat/chat
SOURCE_DEPARTMENT_ID=6e9426e0-1166-46a7-9c4b-129e46af49bc
COMMERCIAL_DEPARTMENT_ID=20a67e6a-83dc-4f95-9430-5bc51eeae7e4
BOT_KEY=c8ccb5ab-7f88-447d-b771-2d0ddd681a15
CHANNEL_FROM=9236121212

POLL_INTERVAL_SECONDS=600
PAGE_SIZE=100
REQUEST_TIMEOUT_MS=30000
REQUEST_RETRIES=3
ACTION_RETRIES=5
ACTION_RETRY_DELAY_MINUTES=5
DATABASE_PATH=./data/followups.sqlite
HEALTH_PORT=3000

TEST_PANEL_ENABLED=true
ALLOW_LIVE_TEST=true
TEST_ADMIN_TOKEN=TOKEN_ADMINISTRATIVO_ALEATORIO
```

Gere o token administrativo no servidor:

```bash
openssl rand -hex 32
```

Nunca envie `.env` ao Git. Confirme:

```bash
git check-ignore .env
```

## Construção e primeira varredura

```bash
docker compose config --quiet
docker compose build --pull
docker compose run --rm followup node src/index.js --once
```

Com `DRY_RUN=true`, a aplicação consulta dados reais, mas não envia mensagem, não inicia chatbot, não transfere e não conclui sessões.

Eventos esperados:

```text
run.started
action.would_run, quando houver sessão elegível
run.completed
```

## Inicialização contínua

```bash
docker compose up -d
docker compose ps
docker compose logs -f --tail=100 followup
```

Estado esperado:

```text
followup-service-followup-1   Up   127.0.0.1:3000->3000/tcp
```

## Healthcheck

Sem `curl` no host:

```bash
docker compose exec followup node -e fetch('http://127.0.0.1:3000/health').then(r=>r.json()).then(console.log)
```

Exemplo saudável:

```text
ok: true
running: false
dryRun: true
lastError: null
```

`running: false` é normal entre as varreduras. `scanned` informa quantas conversas vieram da API; `eligible` informa quantas passaram por todos os filtros e estavam dentro de uma janela.

## Ativação geral

Antes de ativar:

1. Concluir a homologação pelo painel.
2. Desativar o workflow equivalente no n8n.
3. Conferir os logs simulados.

Depois configure:

```env
DRY_RUN=false
ALLOW_LIVE_TEST=false
```

Recrie o container:

```bash
docker compose up -d --force-recreate
```

Confirme o ambiente carregado:

```bash
docker compose exec followup printenv DRY_RUN
docker compose exec followup printenv ALLOW_LIVE_TEST
```

Resultado esperado:

```text
false
false
```

## Atualizações

```bash
cd /opt/followup-service
git pull --ff-only origin main
docker compose up -d --build
docker compose logs -f --tail=100 followup
```

Não é necessário executar `docker compose down`. Se for utilizado, nunca acrescente `-v`, pois isso apagaria o volume com o SQLite.
