// traz as ferramentas do VS Code
const vscode = require("vscode");
// NOVO: ferramentas pra ler arquivos e montar caminhos
const fs = require("fs");
const path = require("path");

// guarda o painel aberto, pra poder mandar recados pra ele
let painelAtual;
// lembra se tem código colado sem explicação
let pendente = false;
// NOVO: o placar
let digitados = 0;
let colados = 0;
let placar;

// roda uma vez, quando a extensão liga
function activate(context) {
  // NOVO: cria o placar na barra de baixo
  placar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  placar.tooltip =
    "Ratinho Fiscal: quanto do código foi digitado e quanto foi colado";
  atualizarPlacar();
  placar.show();

  // quem desenha o painel do ratinho
  const provedor = {
    resolveWebviewView(painel) {
      painelAtual = painel;
      painel.webview.options = { enableScripts: true };
      // NOVO: lê o desenho do arquivo media/painel.html
      const arquivo = path.join(context.extensionPath, "media", "painel.html");
      painel.webview.html = fs.readFileSync(arquivo, "utf8");
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

      // NOVO: conta o que foi colado
      colados += texto.length;
      atualizarPlacar();

      // colou pouco? deixa passar
      if (linhas < 3) return;

      const total = digitados + colados;

      // NOVO: decide o humor
      if (pendente) {
        avisar(
          "bravo",
          "Colou de novo sem explicar o anterior! Comentário // antes de seguir.",
        );
      } else if (total > 1000 && porcentagemColada() >= 25) {
        avisar(
          "bravo",
          porcentagemColada() + "% do código foi colado. Bora digitar!",
        );
      } else {
        avisar(
          "desconfiado",
          "Esse bloco veio pronto, né? " +
            linhas +
            " linhas coladas. Explica com um comentário //",
        );
      }

      pendente = true;
    },
  );

  // roda a cada mudança no texto de qualquer arquivo
  const ouvinte = vscode.workspace.onDidChangeTextDocument((evento) => {
    // NOVO: ignora o que não é arquivo de código (terminal, saída, etc.)
    const tipo = evento.document.uri.scheme;
    if (tipo !== "file" && tipo !== "untitled") return;

    for (const mudanca of evento.contentChanges) {
      // NOVO: digitou tecla por tecla? (1 ou 2 caracteres, como "a" ou "()")
      if (mudanca.text.length >= 1 && mudanca.text.length <= 2) {
        digitados += mudanca.text.length;
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
        avisar("feliz", "Agora sim! Quem explica é porque entendeu.");
      }
    }

    atualizarPlacar();
  });

  // guarda tudo na lista de limpeza
  context.subscriptions.push(placar, registro, colar, ouvinte);
}

// NOVO: calcula quanto por cento foi colado
function porcentagemColada() {
  const total = digitados + colados;
  if (total === 0) return 0;
  return Math.round((colados / total) * 100);
}

// NOVO: escreve o placar na barra de baixo
function atualizarPlacar() {
  const colado = porcentagemColada();
  placar.text = `$(edit) ${100 - colado}% digitado  $(clippy) ${colado}% colado`;
}

// NOVO: manda o humor e a fala pro painel
function avisar(humor, fala) {
  if (painelAtual) {
    painelAtual.webview.postMessage({ humor: humor, fala: fala });
  }
}

// roda quando a extensão desliga
function deactivate() {}

// diz ao VS Code quais funções ele pode chamar
module.exports = {
  activate,
  deactivate,
};
