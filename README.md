# Roteamento automático Ponto da Camisa

Aplicação standalone que substitui a parte de roteamento do workflow do n8n. A cada 10 minutos ela consulta as conversas da equipe de origem, transfere os atendimentos conforme a tag do vendedor e, depois da transferência, inicia o chatbot.

O serviço não envia mensagens de follow-up e não conclui atendimentos.

## Documentação

- [Índice operacional](docs/README.md)
- [Arquitetura e regras de negócio](docs/01-arquitetura-e-regras.md)
- [Instalação em produção](docs/02-instalacao-producao.md)
- [Homologação pelo painel](docs/03-homologacao.md)
- [Operação e solução de problemas](docs/04-operacao-e-troubleshooting.md)

## Regras

- 15–30 minutos: transfere o atendimento conforme a tag do vendedor e inicia o chatbot.
- 2h–2h10: tenta a transferência como contingência e inicia o chatbot se a transferência for bem-sucedida.
- Processa apenas conversas abertas da equipe configurada em `SOURCE_DEPARTMENT_ID`.
- Exige que a última mensagem da empresa seja posterior à última mensagem do cliente.
- Transferência e chatbot possuem controles independentes de duplicidade no SQLite.
- O chatbot somente é iniciado depois do sucesso da transferência.
- Uma ação com falha pode ser repetida até o limite configurado.

Não existe ação de encerramento na antiga janela de 23–24 horas.

## Roteamento

As tags `ALYNNE`, `ESTER`, `GABRIELA`, `KATIANA`, `MARINES`, `MONICA`, `SONIA` e `SUELEN` são reconhecidas sem diferenciar caixa ou acentos. Quando nenhuma delas está presente, a conversa vai para Comercial.

Se o contato possuir mais de uma tag de vendedor, vale a primeira na ordem acima.

## Primeira execução segura

Requer Node.js 22.13 ou mais recente. Nenhuma dependência npm externa é necessária.

1. Copie `.env.example` para `.env`.
2. Preencha `API_TOKEN` com um token permanente novo.
3. Mantenha `DRY_RUN=true`.
4. Execute uma varredura:

```bash
npm run run:once
```

O modo simulação consulta dados reais, mas não transfere atendimentos nem inicia o chatbot. Confira os eventos `action.would_run` nos logs.

Para ativar, altere `DRY_RUN=false` e execute:

```bash
npm start
```

## Docker

```bash
cp .env.example .env
docker compose up -d --build
docker compose logs -f followup
```

O banco fica no volume Docker `followup-data`. O serviço reinicia automaticamente, e o SQLite impede duplicações após reinícios.

## Saúde

```bash
curl http://127.0.0.1:3000/health
```

A resposta mostra a última execução, quantidade analisada, conversas elegíveis e contadores das ações persistidas.

## Painel de homologação

O painel permite buscar um telefone, simular o roteamento e executar uma transferência seguida da ativação do chatbot. Ele fica desabilitado por padrão. Configure:

```env
TEST_PANEL_ENABLED=true
ALLOW_LIVE_TEST=true
TEST_ADMIN_TOKEN=use-um-token-aleatorio-com-pelo-menos-32-caracteres
```

Em um servidor remoto, acesse somente por túnel SSH:

```bash
ssh -L 3000:127.0.0.1:3000 usuario@servidor
```

Depois abra `http://localhost:3000/test`. O teste real exige exatamente uma sessão aberta, uma resposta da empresa posterior à mensagem do cliente e o departamento de origem configurado. Transferência e chatbot usam o mesmo SQLite e não são repetidos para a mesma sessão e referência.

Após homologar, defina `ALLOW_LIVE_TEST=false` e recrie o container.

## Testes

```bash
npm test
```

## Observações de produção

- Não coloque o token diretamente no código ou no `compose.yaml`.
- Faça backup do volume que contém `/app/data/followups.sqlite`.
- Execute apenas uma réplica da aplicação com o mesmo banco SQLite.
- Primeiro valide pelo menos uma execução completa com `DRY_RUN=true`.
- Desative o workflow equivalente no n8n antes de ativar o serviço.
