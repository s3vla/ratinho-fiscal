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
// tomatadas levadas no total, e as que ainda estão grudadas na tela
let tomatadas = 0;
let splatsNaTela = 0;
// lembra o humor, a fala e o trecho atuais, pra reenviar quando o painel recarregar
let humorAtual = "feliz";
let falaAtual = "Tô de olho na panela e no seu código.";
let codigoAtual = null;
// o pomodoro
let segundos = 0;
let pomodoros = 0;
let ultimaAtividade = 0; // começa sem atividade
let rodando = false; // você apertou Iniciar?
// manchas de tomate no código
let tomate;
let manchas = [];
let editorManchado;
// o último texto copiado de dentro do VS Code
let copiadoAqui = "";
// a linha que o ratinho quer que você explique
let linhaPedida = null;

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

  // o estilo da mancha de tomate no código
  tomate = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(247, 118, 142, 0.13)",
    isWholeLine: true,
    overviewRulerColor: "#f7768e",
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    after: {
      contentText: "  🍅 splat! explica com um comentário",
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

      // escuta os recados do painel
      painel.webview.onDidReceiveMessage((recado) => {
        // o painel carregou: manda tudo pra ele
        if (recado.tipo === "pronto") {
          enviarHumor(0);
          atualizarPlacar();
          enviarTempo();
          // redesenha as manchas que ainda estavam na tela
          painel.webview.postMessage({
            tipo: "splats",
            quantidade: splatsNaTela,
          });
        }

        // os botões do pomodoro
        if (recado.tipo === "iniciar") {
          rodando = true;
          ultimaAtividade = Date.now(); // dá 2 minutos pra você começar a digitar
          enviarTempo();
        }
        if (recado.tipo === "pausar") {
          rodando = false;
          enviarTempo();
        }
        if (recado.tipo === "reiniciar") {
          segundos = 0;
          enviarTempo();
        }
      });
    },
  };

  const registro = vscode.window.registerWebviewViewProvider(
    "ratinho.painel",
    provedor,
  );

  // roda no lugar do Ctrl+C (copia e guarda o que foi copiado)
  const copiar = vscode.commands.registerCommand(
    "ratinho-fiscal.copiar",
    async function () {
      await vscode.commands.executeCommand("editor.action.clipboardCopyAction");
      copiadoAqui = await vscode.env.clipboard.readText();
    },
  );

  // roda no lugar do Ctrl+X (recorta e guarda o que foi recortado)
  const recortar = vscode.commands.registerCommand(
    "ratinho-fiscal.recortar",
    async function () {
      await vscode.commands.executeCommand("editor.action.clipboardCutAction");
      copiadoAqui = await vscode.env.clipboard.readText();
    },
  );

  // roda no lugar do Ctrl+V
  const colar = vscode.commands.registerCommand(
    "ratinho-fiscal.colar",
    async function () {
      const texto = await vscode.env.clipboard.readText();
      const linhas = texto.split("\n").length;

      // veio de dentro do VS Code? então é código seu mudando de lugar
      const doProprioCodigo = texto === copiadoAqui;

      // guarda onde o cursor estava ANTES de colar
      const editor = vscode.window.activeTextEditor;
      const inicio = editor ? editor.selection.start : null;

      await vscode.commands.executeCommand(
        "editor.action.clipboardPasteAction",
      );

      // código seu não conta como colado e não leva tomate
      if (doProprioCodigo) {
        if (linhas >= 3 && !pendente) {
          avisar(
            "feliz",
            "Mudando seu próprio código de lugar? Pode, esse é seu.",
          );
        }
        return;
      }

      // conta o que foi colado
      colados += texto.length;
      atualizarPlacar();

      // colou pouco? deixa passar
      if (linhas < 3) return;

      // colou um bloco, o pomodoro zera
      segundos = 0;

      // mancha de tomate do início até onde o cursor parou
      if (editor && inicio) {
        const fim = editor.selection.active;
        if (editorManchado !== editor) manchas = [];
        manchas.push(new vscode.Range(inicio, fim));
        editor.setDecorations(tomate, manchas);
        editorManchado = editor;
      }

      // escolhe a linha que ele quer que você explique
      linhaPedida = escolherLinha(texto);
      const pedido = linhaPedida
        ? "Explica essa linha com um comentário logo acima dela:"
        : "Explica com um comentário.";

      // decide o humor (e quantos tomates jogar)
      if (pendente) {
        avisar(
          "bravo",
          "Colou de novo sem explicar o anterior! " + pedido,
          3,
          linhaPedida,
        );
      } else if (digitados >= 500 && porcentagemColada() >= 25) {
        avisar(
          "bravo",
          porcentagemColada() + "% do código foi colado. " + pedido,
          3,
          linhaPedida,
        );
      } else {
        avisar(
          "desconfiado",
          "Esse bloco veio pronto, né? " + pedido,
          1,
          linhaPedida,
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
      const texto = evento.document.lineAt(numero).text;

      // tem comentário nessa linha? aceita // (JS), # (Python), <!-- (HTML) e /* (CSS)
      const achou = texto.match(/(^|\s)(\/\/|#|<!--|\/\*)\s+(.*)$/);
      if (!achou) continue;

      // tira o fechamento --> ou */ e conta as palavras
      const comentario = achou[3].replace(/(-->|\*\/)\s*$/, "").trim();
      const palavras = comentario.split(/\s+/);
      if (palavras.length < 3) continue;

      // explicou a linha certa?
      if (
        !linhaPedida ||
        explicouALinha(evento.document, numero, texto, achou.index)
      ) {
        pendente = false;
        linhaPedida = null;
        splatsNaTela = 0; // o painel limpa as manchas quando fica feliz
        limparManchas();
        avisar("feliz", "Agora sim! Quem explica é porque entendeu.");
      } else {
        avisar(
          humorAtual,
          "Bom comentário, mas eu perguntei desta linha. Coloca o comentário logo acima dela:",
          0,
          linhaPedida,
        );
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

  // guarda tudo na lista de limpeza
  context.subscriptions.push(
    placar,
    registro,
    copiar,
    recortar,
    colar,
    ouvinte,
    tomate,
    {
      dispose: () => clearInterval(relogio),
    },
  );
}

// escolhe uma linha "interessante" do bloco colado
function escolherLinha(texto) {
  const candidatas = texto
    .split("\n")
    .map((linha) => linha.trim())
    .filter(
      (linha) =>
        linha.length >= 10 && // não muito curta
        !/^(\/\/|#|<!--|\/\*)/.test(linha) && // não é comentário
        !/^[\s{}()[\];,]*$/.test(linha), // não é só } ou );
    );

  if (candidatas.length === 0) return null;
  return candidatas[Math.floor(Math.random() * candidatas.length)];
}

// tira espaços, aspas e ; pra comparar linhas sem se importar com o Prettier
function normalizar(linha) {
  return linha.replace(/[\s'"`;,]/g, "");
}

// o comentário está no fim da linha pedida ou logo acima dela?
function explicouALinha(documento, numero, texto, posicao) {
  const alvo = normalizar(linhaPedida);

  // comentário no fim da própria linha: codigo(); // explicação
  const codigoAntes = texto.slice(0, posicao);
  if (normalizar(codigoAntes) === alvo) return true;

  // comentário acima: olha as 3 linhas de baixo
  for (let i = numero + 1; i <= numero + 3 && i < documento.lineCount; i++) {
    if (normalizar(documento.lineAt(i).text) === alvo) return true;
  }

  return false;
}

// tira todas as manchas de tomate do código
function limparManchas() {
  if (editorManchado) editorManchado.setDecorations(tomate, []);
  manchas = [];
  editorManchado = undefined;
}

// o relógio está pausado?
function estaPausado() {
  const parado = Date.now() - ultimaAtividade > PARADO;
  return !rodando || pendente || parado;
}

// manda o tempo pro painel
function enviarTempo() {
  if (!painelAtual) return;

  let motivo = "codando sem colar";
  if (!rodando) motivo = "parado: aperte Iniciar";
  else if (pendente) motivo = "pausado: falta o comentário";
  else if (estaPausado()) motivo = "pausado: sem digitar";

  painelAtual.webview.postMessage({
    tipo: "tempo",
    segundos: segundos,
    meta: META,
    pomodoros: pomodoros,
    pausado: estaPausado(),
    motivo: motivo,
    rodando: rodando,
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
  placar.text = `$(edit) ${100 - colado}%  $(clippy) ${colado}%`;

  if (painelAtual) {
    painelAtual.webview.postMessage({
      tipo: "placar",
      digitados: digitados,
      colados: colados,
      tomatadas: tomatadas,
      porcentagem: colado,
    });
  }
}

// guarda o humor novo e manda pro painel
function avisar(humor, fala, tomates = 0, codigo = null) {
  humorAtual = humor;
  falaAtual = fala;
  codigoAtual = codigo;

  // soma as tomatadas
  if (tomates > 0) {
    tomatadas += tomates;
    splatsNaTela = Math.min(splatsNaTela + tomates, 14);
    atualizarPlacar();
  }

  enviarHumor(tomates);
}

// manda o humor atual pro painel
function enviarHumor(tomates) {
  if (painelAtual) {
    painelAtual.webview.postMessage({
      tipo: "humor",
      humor: humorAtual,
      fala: falaAtual,
      codigo: codigoAtual,
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
