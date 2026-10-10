export const testPage = `<!doctype html>
<html lang=pt-BR>
<head>
  <meta charset=utf-8>
  <meta name=viewport content=width=device-width,initial-scale=1>
  <title>Homologação de transferência e chatbot</title>
  <style>
    :root { color-scheme:dark; font-family:Inter,system-ui,sans-serif; background:#0b1220; color:#e5e7eb }
    * { box-sizing:border-box } body { margin:0; padding:32px 16px } main { max-width:820px; margin:auto }
    h1 { margin:0 0 8px; font-size:28px } .muted { color:#94a3b8 }
    .card { background:#111b2e; border:1px solid #26344d; border-radius:14px; padding:20px; margin-top:18px }
    label { display:block; margin:12px 0 6px; font-weight:650 }
    input { width:100%; border:1px solid #42516b; border-radius:9px; background:#08101e; color:#fff; padding:12px }
    button { border:0; border-radius:9px; padding:11px 16px; margin:12px 8px 0 0; cursor:pointer; font-weight:700; background:#2563eb; color:#fff }
    button.danger { background:#dc2626 } button:disabled { opacity:.45; cursor:not-allowed }
    pre { white-space:pre-wrap; overflow-wrap:anywhere; background:#07101d; border-radius:9px; padding:14px; min-height:48px }
    .warning { color:#fbbf24 }
  </style>
</head>
<body><main>
  <h1>Homologação de transferência e chatbot</h1>
  <p class=muted>Busca e testa somente uma sessão aberta. O worker geral mantém sua configuração de DRY_RUN.</p>
  <section class=card>
    <label for=token>Token administrativo</label>
    <input id=token type=password autocomplete=current-password>
    <label for=phone>Contato</label>
    <input id=phone inputmode=numeric placeholder=92994414222>
    <button id=lookup>Buscar e simular</button>
  </section>
  <section class=card>
    <strong>Resultado</strong>
    <pre id=result>Aguardando consulta.</pre>
    <label><input id=confirm type=checkbox style=width:auto> Confirmo a transferência real e a ativação do chatbot.</label>
    <button class=danger id=execute disabled>Executar teste real</button>
    <p class=warning>O envio real só funciona quando ALLOW_LIVE_TEST=true.</p>
  </section>
  <script>
    const token = document.querySelector('#token');
    const phone = document.querySelector('#phone');
    const result = document.querySelector('#result');
    const confirm = document.querySelector('#confirm');
    const execute = document.querySelector('#execute');
    let selectedSessionId = null;
    token.value = sessionStorage.getItem('followupTestToken') || '';
    const call = async (path, payload) => {
      sessionStorage.setItem('followupTestToken', token.value);
      const response = await fetch(path, {
        method:'POST', headers:{'content-type':'application/json','x-admin-token':token.value},
        body:JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({error:'invalid_response'}));
      if (!response.ok) throw new Error(body.message || body.error || ('HTTP ' + response.status));
      return body;
    };
    document.querySelector('#lookup').onclick = async () => {
      selectedSessionId = null; execute.disabled = true; confirm.checked = false; result.textContent = 'Consultando...';
      try {
        const body = await call('/api/test/lookup', {phone:phone.value});
        result.textContent = JSON.stringify(body, null, 2);
        if (body.sessions.length === 1) selectedSessionId = body.sessions[0].sessionId;
      } catch (error) { result.textContent = 'Erro: ' + error.message; }
    };
    confirm.onchange = () => { execute.disabled = !(confirm.checked && selectedSessionId); };
    execute.onclick = async () => {
      if (!confirm.checked || !selectedSessionId) return;
      execute.disabled = true; result.textContent = 'Executando teste real...';
      try {
        const body = await call('/api/test/execute', {phone:phone.value,sessionId:selectedSessionId,confirmation:'EXECUTAR TRANSFERENCIA'});
        result.textContent = JSON.stringify(body, null, 2);
      } catch (error) { result.textContent = 'Erro: ' + error.message; }
      finally { confirm.checked = false; }
    };
  </script>
</main></body></html>`;
