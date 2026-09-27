// traz as ferramentas do VS Code
const vscode = require("vscode");

// guarda o painel aberto, pra poder mandar recados pra ele
let painelAtual;

// NOVO: lembra se tem código colado sem explicação
let pendente = false;

// roda uma vez, quando a extensão liga
function activate(context) {
  // comando que mostra a notificação
  const comando = vscode.commands.registerCommand(
    "ratinho-fiscal.helloWorld",
    function () {
      vscode.window.showInformationMessage(
        "O Ratinho Fiscal está de olho no seu código!",
      );
    },
  );

  // quem desenha o painel do ratinho
  const provedor = {
    resolveWebviewView(painel) {
      painelAtual = painel;
      painel.webview.options = { enableScripts: true };
      painel.webview.html = htmlDoRatinho();
    },
  };

  const registro = vscode.window.registerWebviewViewProvider(
    "ratinho.painel",
    provedor,
  );

  // roda no lugar do Ctrl+V
  const colar = vscode.commands.registerCommand(
    "ratinho-fiscal.colar",
    async function () {
      const texto = await vscode.env.clipboard.readText();
      const linhas = texto.split("\n").length;

      await vscode.commands.executeCommand(
        "editor.action.clipboardPasteAction",
      );

      if (linhas >= 3) {
        pendente = true; // NOVO: agora tem código pra explicar
        if (painelAtual) {
          painelAtual.webview.postMessage({ tipo: "colou", linhas: linhas });
        }
      }
    },
  );

  // NOVO: roda a cada mudança no texto de qualquer arquivo
  const ouvinte = vscode.workspace.onDidChangeTextDocument((evento) => {
    // se não tem nada pra explicar, nem olha
    if (!pendente) return;

    for (const mudanca of evento.contentChanges) {
      // a mudança foi só um Enter? (quebra de linha + espaços do recuo)
      const foiEnter = /^\r?\n[ \t]*$/.test(mudanca.text);
      if (!foiEnter) continue;

      // pega a linha onde o Enter foi apertado
      const numero = mudanca.range.start.line;
      const linha = evento.document.lineAt(numero).text.trim();

      // conta as palavras depois do //
      const palavras = linha.replace("//", "").trim().split(/\s+/);

      // é um comentário com pelo menos 3 palavras? então explicou!
      if (linha.startsWith("//") && palavras.length >= 3) {
        pendente = false;
        if (painelAtual) {
          painelAtual.webview.postMessage({ tipo: "explicou" });
        }
      }
    }
  });

  // guarda tudo na lista de limpeza
  context.subscriptions.push(comando, registro, colar, ouvinte);
}

// roda quando a extensão desliga
function deactivate() {}

// o desenho do ratinho
function htmlDoRatinho() {
  return `<!DOCTYPE html>
<html>
<head>
<style>
  body{display:flex;flex-direction:column;align-items:center;gap:14px;padding:16px;font-family:var(--vscode-font-family);color:var(--vscode-foreground)}
  .balao{margin:0;border:1.5px solid #3b4261;border-radius:14px;padding:8px 12px;text-align:center}
  body.desconfiado .balao{border-color:#e0af68}
  svg{width:180px;overflow:visible}
  .anima{transform-box:view-box}
  .bigode{transform-origin:100px 116px;animation:bigode 2.6s ease-in-out infinite}
  .olhos{transform-origin:100px 100px;animation:piscar 4.5s infinite}
  .colher{transform-origin:112px 186px;animation:mexer 1.6s ease-in-out infinite}
  .vapor path{opacity:0;animation:vapor 2.4s ease-in-out infinite}
  .vapor path:nth-child(2){animation-delay:.8s}
  .vapor path:nth-child(3){animation-delay:1.6s}
  .interroga{transform-origin:166px 36px;animation:quica 1.2s ease-in-out infinite}

  .so-desconfiado{display:none}
  body.desconfiado .so-desconfiado{display:inline}
  body.desconfiado .so-feliz{display:none}
  body.desconfiado .colher{animation:none}

  @keyframes bigode{50%{transform:rotate(3deg)}}
  @keyframes piscar{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
  @keyframes mexer{0%,100%{transform:rotate(-10deg)}50%{transform:rotate(12deg)}}
  @keyframes vapor{0%{opacity:0;transform:translateY(6px)}40%{opacity:.55}100%{opacity:0;transform:translateY(-14px)}}
  @keyframes quica{0%,100%{transform:translateY(0) rotate(-6deg)}50%{transform:translateY(-6px) rotate(6deg)}}
  @media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
</head>
<body>
  <p class="balao">Tô de olho na panela e no seu código.</p>
  <svg viewBox="0 0 200 230" role="img" aria-label="Ratinho chef">
    <path d="M140 196 C 182 200, 192 162, 172 140 S 148 122, 160 104" fill="none" stroke="#e8a0b4" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="80" cy="214" rx="14" ry="7" fill="#e8a0b4"/>
    <ellipse cx="120" cy="214" rx="14" ry="7" fill="#e8a0b4"/>
    <ellipse cx="100" cy="170" rx="46" ry="44" fill="#8f96b3"/>
    <path d="M74 158 h52 v38 q-26 13 -52 0z" fill="#eef0f8"/>
    <circle cx="62" cy="72" r="22" fill="#8f96b3"/><circle cx="62" cy="72" r="13" fill="#e8a0b4"/>
    <circle cx="138" cy="72" r="22" fill="#8f96b3"/><circle cx="138" cy="72" r="13" fill="#e8a0b4"/>
    <circle cx="100" cy="104" r="40" fill="#9ea5c2"/>
    <circle cx="84" cy="42" r="13" fill="#eef0f8"/><circle cx="100" cy="34" r="15" fill="#eef0f8"/><circle cx="116" cy="42" r="13" fill="#eef0f8"/>
    <rect x="78" y="44" width="44" height="22" rx="4" fill="#eef0f8"/>
    <rect x="78" y="60" width="44" height="6" rx="2" fill="#d4d8ea"/>

    <g class="so-feliz olhos anima">
      <circle cx="86" cy="100" r="5.5" fill="#1a1b26"/><circle cx="114" cy="100" r="5.5" fill="#1a1b26"/>
      <circle cx="87.8" cy="98" r="1.7" fill="#fff"/><circle cx="115.8" cy="98" r="1.7" fill="#fff"/>
    </g>
    <g class="so-desconfiado" stroke="#1a1b26" stroke-linecap="round" fill="none">
      <path d="M79 101 h14" stroke-width="4"/><path d="M107 101 h14" stroke-width="4"/>
      <path d="M105 88 Q114 83 123 89" stroke-width="3"/>
    </g>

    <ellipse cx="100" cy="114" rx="6" ry="4.5" fill="#e8a0b4"/>
    <g class="bigode anima" stroke="#5c6488" stroke-width="1.6" stroke-linecap="round">
      <path d="M92 116 L62 109"/><path d="M92 118 L62 122"/>
      <path d="M108 116 L138 109"/><path d="M108 118 L138 122"/>
    </g>

    <path class="so-feliz" d="M92 124 Q100 131 108 124" stroke="#1a1b26" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path class="so-desconfiado" d="M93 126 Q100 123 107 127" stroke="#1a1b26" stroke-width="3" fill="none" stroke-linecap="round"/>

    <g class="so-feliz vapor anima" stroke="#a9b1d6" stroke-width="2.5" fill="none" stroke-linecap="round">
      <path d="M78 166 q-5 -7 0 -14 q5 -7 0 -14"/>
      <path d="M100 164 q-5 -7 0 -14 q5 -7 0 -14"/>
      <path d="M122 166 q-5 -7 0 -14 q5 -7 0 -14"/>
    </g>
    <rect x="58" y="178" width="84" height="36" rx="8" fill="#414868"/>
    <rect x="52" y="173" width="96" height="9" rx="4.5" fill="#565f89"/>
    <rect x="44" y="182" width="14" height="6" rx="3" fill="#565f89"/>
    <rect x="142" y="182" width="14" height="6" rx="3" fill="#565f89"/>
    <circle cx="50" cy="180" r="7.5" fill="#9ea5c2"/>
    <g class="colher anima">
      <line x1="112" y1="186" x2="134" y2="140" stroke="#e0af68" stroke-width="5" stroke-linecap="round"/>
      <circle cx="134" cy="140" r="8" fill="#9ea5c2"/>
    </g>

    <text class="so-desconfiado interroga anima" x="158" y="46" font-size="30" font-weight="700" fill="#e0af68">?</text>
  </svg>

  <script>
    // o painel escuta os recados da extensão
    const balao = document.querySelector(".balao");

    window.addEventListener("message", (evento) => {
      const recado = evento.data;

      if (recado.tipo === "colou") {
        document.body.classList.add("desconfiado");
        balao.textContent = "Esse bloco veio pronto, né? " + recado.linhas + " linhas coladas. Explica com um comentário //";
      }

      // NOVO: fez as pazes
      if (recado.tipo === "explicou") {
        document.body.classList.remove("desconfiado");
        balao.textContent = "Agora sim! Quem explica é porque entendeu.";
      }
    });
  </script>
</body>
</html>`;
}

// diz ao VS Code quais funções ele pode chamar
module.exports = {
  activate,
  deactivate,
};
