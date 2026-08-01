# Follow-ups Ponto da Camisa

Aplicação standalone que substitui a automação de follow-up do n8n. A cada 10 minutos ela consulta as conversas da equipe Orçamento/Pedido, envia os follow-ups, ativa o chatbot e transfere o atendimento conforme a tag do vendedor.

## Regras

- 30–40 minutos: envia o primeiro follow-up, ativa a IA e transfere por tag.
- 2h–2h10: envia o segundo follow-up, ativa a IA e transfere por tag.
- 23–24 horas: envia a mensagem de encerramento e conclui o atendimento.
- Processa apenas conversas abertas da equipe configurada em `SOURCE_DEPARTMENT_ID`.
- Exige que a última mensagem da empresa seja posterior à última mensagem do cliente.
- Cada mensagem, chatbot, transferência e conclusão possui controle independente de duplicidade no SQLite.
- Uma ação com falha é repetida sem refazer as etapas anteriores que já tiveram sucesso.

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

O modo simulação consulta dados reais, mas não envia mensagens, não ativa chatbot, não transfere e não conclui atendimentos. Confira os eventos `action.would_run` nos logs.

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

## Testes

```bash
npm test
```

## Observações de produção

- Não coloque o token diretamente no código ou no `compose.yaml`.
- Faça backup do volume que contém `/app/data/followups.sqlite`.
- Execute apenas uma réplica da aplicação com o mesmo banco SQLite.
- Primeiro valide pelo menos uma execução completa com `DRY_RUN=true`.

