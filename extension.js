// traz as ferramentas do VS Code
const vscode = require("vscode");
// ferramentas pra ler arquivos e montar caminhos
const fs = require("fs");
const path = require("path");

// meta do pomodoro, em segundos (25 minutos)
const META = 25 * 60;
// quanto tempo sem digitar conta como "parado" (2 minutos)
const PARADO = 2 * 60 * 1000;

// guarda o painel aberto, pra poder mandar recados pra ele
let painelAtual;
// lembra se tem código colado sem explicação
let pendente = false;
// o placar
let digitados = 0;
let colados = 0;
let placar;
// lembra o humor e a fala atuais, pra reenviar quando o painel recarregar
let humorAtual = "feliz";
let falaAtual = "Tô de olho na panela e no seu código.";
// o pomodoro
let segundos = 0;
let pomodoros = 0;
let ultimaAtividade = Date.now();
// NOVO: manchas de tomate no código
let tomate;
let manchas = [];
let editorManchado;

// roda uma vez, quando a extensão liga
function activate(context) {
  // cria o placar na barra de baixo
  placar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  placar.tooltip =
    "Ratinho Fiscal: quanto do código foi digitado e quanto foi colado";
  atualizarPlacar();
  placar.show();

  // NOVO: o estilo da mancha de tomate
  tomate = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(247, 118, 142, 0.13)",
    isWholeLine: true,
    overviewRulerColor: "#f7768e",
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    after: {
      contentText: "  🍅 splat! explica com um //",
      color: "#f7768e",
      fontStyle: "italic",
    },
  });

  // quem desenha o painel do ratinho
  const provedor = {
    resolveWebviewView(painel) {
      painelAtual = painel;
      painel.webview.options = { enableScripts: true };
      const arquivo = path.join(context.extensionPath, "media", "painel.html");
      painel.webview.html = fs.readFileSync(arquivo, "utf8");

      // quando o painel avisar que carregou, manda tudo pra ele
      painel.webview.onDidReceiveMessage((recado) => {
        if (recado.tipo === "pronto") {
          enviarHumor(0);
          atualizarPlacar();
          enviarTempo();
        }
      });
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

      // NOVO: guarda onde o cursor estava ANTES de colar
      const editor = vscode.window.activeTextEditor;
      const inicio = editor ? editor.selection.start : null;

      await vscode.commands.executeCommand(
        "editor.action.clipboardPasteAction",
      );

      // conta o que foi colado
      colados += texto.length;
      atualizarPlacar();

      // colou pouco? deixa passar
      if (linhas < 3) return;

      // colou um bloco, o pomodoro zera
      segundos = 0;

      // NOVO: mancha de tomate do início até onde o cursor parou
      if (editor && inicio) {
        const fim = editor.selection.active;
        if (editorManchado !== editor) manchas = [];
        manchas.push(new vscode.Range(inicio, fim));
        editor.setDecorations(tomate, manchas);
        editorManchado = editor;
      }

      const total = digitados + colados;

      // decide o humor (e quantos tomates jogar)
      if (pendente) {
        avisar(
          "bravo",
          "Colou de novo sem explicar o anterior! Comentário // antes de seguir.",
          3,
        );
      } else if (total > 1000 && porcentagemColada() >= 25) {
        avisar(
          "bravo",
          porcentagemColada() + "% do código foi colado. Bora digitar!",
          3,
        );
      } else {
        avisar(
          "desconfiado",
          "Esse bloco veio pronto, né? " +
            linhas +
            " linhas coladas. Explica com um comentário //",
          1,
        );
      }

      pendente = true;
      enviarTempo();
    },
  );

  // roda a cada mudança no texto de qualquer arquivo
  const ouvinte = vscode.workspace.onDidChangeTextDocument((evento) => {
    // ignora o que não é arquivo de código (terminal, saída, etc.)
    const tipo = evento.document.uri.scheme;
    if (tipo !== "file" && tipo !== "untitled") return;

    for (const mudanca of evento.contentChanges) {
      // digitou tecla por tecla? (1 ou 2 caracteres, como "a" ou "()")
      if (mudanca.text.length >= 1 && mudanca.text.length <= 2) {
        digitados += mudanca.text.length;
        ultimaAtividade = Date.now();
      }

      // se não tem nada pra explicar, segue pra próxima mudança
      if (!pendente) continue;

      // a mudança foi só um Enter?
      const foiEnter = /^\r?\n[ \t]*$/.test(mudanca.text);
      if (!foiEnter) continue;

      // pega a linha onde o Enter foi apertado
      const numero = mudanca.range.start.line;
      const linha = evento.document.lineAt(numero).text.trim();
      const palavras = linha.replace("//", "").trim().split(/\s+/);

      // comentário com pelo menos 3 palavras? explicou!
      if (linha.startsWith("//") && palavras.length >= 3) {
        pendente = false;
        limparManchas(); // NOVO
        avisar("feliz", "Agora sim! Quem explica é porque entendeu.");
      }
    }

    atualizarPlacar();
  });

  // o relógio, que roda a cada 1 segundo
  const relogio = setInterval(() => {
    if (!estaPausado()) {
      segundos++;

      // chegou na meta? festa!
      if (segundos >= META) {
        segundos = 0;
        pomodoros++;
        avisar("festa", "25 minutos só na mão! Merece um queijo.");

        // depois de 8 segundos, volta pra panela
        setTimeout(() => {
          if (humorAtual === "festa") {
            avisar("feliz", "De volta à panela. Segue o ritmo.");
          }
        }, 8000);
      }
    }

    enviarTempo();
  }, 1000);

  // guarda tudo na lista de limpeza (inclusive o relógio e a mancha)
  context.subscriptions.push(placar, registro, colar, ouvinte, tomate, {
    dispose: () => clearInterval(relogio),
  });
}

// NOVO: tira todas as manchas de tomate
function limparManchas() {
  if (editorManchado) editorManchado.setDecorations(tomate, []);
  manchas = [];
  editorManchado = undefined;
}

// o relógio está pausado?
function estaPausado() {
  const parado = Date.now() - ultimaAtividade > PARADO;
  return pendente || parado;
}

// manda o tempo pro painel
function enviarTempo() {
  if (!painelAtual) return;

  let motivo = "codando sem colar";
  if (pendente) motivo = "pausado: falta o comentário";
  else if (estaPausado()) motivo = "pausado: sem digitar";

  painelAtual.webview.postMessage({
    tipo: "tempo",
    segundos: segundos,
    meta: META,
    pomodoros: pomodoros,
    pausado: estaPausado(),
    motivo: motivo,
  });
}

// calcula quanto por cento foi colado
function porcentagemColada() {
  const total = digitados + colados;
  if (total === 0) return 0;
  return Math.round((colados / total) * 100);
}

// atualiza o placar na barra de baixo e no painel
function atualizarPlacar() {
  const colado = porcentagemColada();
  placar.text = `$(edit) ${100 - colado}% digitado  $(clippy) ${colado}% colado`;

  if (painelAtual) {
    painelAtual.webview.postMessage({
      tipo: "placar",
      digitados: digitados,
      colados: colados,
      porcentagem: colado,
    });
  }
}

// guarda o humor novo e manda pro painel (NOVO: com tomates)
function avisar(humor, fala, tomates = 0) {
  humorAtual = humor;
  falaAtual = fala;
  enviarHumor(tomates);
}

// manda o humor atual pro painel
function enviarHumor(tomates) {
  if (painelAtual) {
    painelAtual.webview.postMessage({
      tipo: "humor",
      humor: humorAtual,
      fala: falaAtual,
      tomates: tomates,
    });
  }
}

// roda quando a extensão desliga
function deactivate() {}

// diz ao VS Code quais funções ele pode chamar
module.exports = {
  activate,
  deactivate,
};
