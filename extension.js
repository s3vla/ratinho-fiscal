// traz as ferramentas do VS Code
const vscode = require("vscode");
// ferramentas pra ler arquivos e montar caminhos
const fs = require("fs");
const path = require("path");

// guarda o painel aberto, pra poder mandar recados pra ele
let painelAtual;
// NOVO: a memória que sobrevive quando o VS Code fecha
let memoria;
// lembra se tem código colado sem explicação
let pendente = false;
// o placar do dia
let digitados = 0;
let colados = 0;
let tomatadas = 0;
let pomodoros = 0;
let placar;
// manchas de tomate que ainda estão na tela do painel
let splatsNaTela = 0;
// lembra o humor, a fala e o trecho atuais, pra reenviar quando o painel recarregar
let humorAtual = "feliz";
let falaAtual = "Tô de olho na panela e no seu código.";
let codigoAtual = null;
// o pomodoro
let segundos = 0;
let ultimaAtividade = 0; // começa sem atividade
let rodando = false; // você apertou Iniciar?
// o estilo da mancha de tomate no código
let tomate;
// NOVO: manchas de cada arquivo (endereço do arquivo → lista de { inicio, fim })
const manchas = new Map();
// o último texto copiado de dentro do VS Code
let copiadoAqui = "";
// a linha que o ratinho quer que você explique
let linhaPedida = null;
// NOVO: controle do dia
let diaAtual = hojeComoTexto();
let mudouDesdeSalvar = false;

// ===== NOVO: configurações =====

function config() {
  return vscode.workspace.getConfiguration("ratinhoFiscal");
}
function linhasMinimas() {
  return config().get("linhasMinimas", 3);
}
function metaMinutos() {
  return config().get("metaPomodoroMinutos", 25);
}
function pausaEmMs() {
  return config().get("pausaSemDigitarMinutos", 2) * 60 * 1000;
}
function tomatesLigados() {
  return config().get("tomatesVoando", true);
}
function manchasLigadas() {
  return config().get("manchasNoCodigo", true);
}

// ===== roda uma vez, quando a extensão liga =====

function activate(context) {
  // NOVO: carrega o dia salvo
  memoria = context.globalState;
  carregarDia();

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
          painel.webview.postMessage({
            tipo: "splats",
            quantidade: splatsNaTela,
          });
        }

        // os botões do pomodoro
        if (recado.tipo === "iniciar") {
          rodando = true;
          ultimaAtividade = Date.now(); // dá um tempo pra você começar a digitar
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
      const minimo = linhasMinimas();

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
        if (linhas >= minimo && !pendente) {
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
      if (linhas < minimo) return;

      // colou um bloco, o pomodoro zera
      segundos = 0;

      // NOVO: guarda a mancha deste arquivo
      if (editor && inicio) {
        adicionarMancha(editor, inicio.line, editor.selection.active.line);
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
      // NOVO: se linhas entraram ou saíram, as manchas se mexem junto
      ajustarManchas(evento.document, mudanca);

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

  // NOVO: trocou de arquivo? pinta as manchas dele
  const trocouArquivo = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) pintar(editor);
  });
  const mudouTela = vscode.window.onDidChangeVisibleTextEditors(() =>
    pintarTodos(),
  );

  // NOVO: mudou alguma configuração do ratinho? aplica na hora
  const mudouConfig = vscode.workspace.onDidChangeConfiguration((evento) => {
    if (evento.affectsConfiguration("ratinhoFiscal")) {
      pintarTodos();
      enviarTempo();
    }
  });

  // o relógio, que roda a cada 1 segundo
  let tiques = 0;
  const relogio = setInterval(() => {
    // NOVO: o dia virou?
    if (hojeComoTexto() !== diaAtual) virarDia();

    if (!estaPausado()) {
      segundos++;

      // chegou na meta? festa!
      if (segundos >= metaMinutos() * 60) {
        segundos = 0;
        pomodoros++;
        mudouDesdeSalvar = true;
        avisar(
          "festa",
          metaMinutos() + " minutos só na mão! Merece um queijo.",
        );

        // depois de 8 segundos, volta pra panela
        setTimeout(() => {
          if (humorAtual === "festa") {
            avisar("feliz", "De volta à panela. Segue o ritmo.");
          }
        }, 8000);
      }
    }

    enviarTempo();

    // NOVO: a cada 10 segundos, salva o dia (se algo mudou)
    tiques++;
    if (tiques % 10 === 0 && mudouDesdeSalvar) salvarDia();
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
    trocouArquivo,
    mudouTela,
    mudouConfig,
    { dispose: () => clearInterval(relogio) },
  );
}

// ===== NOVO: salvar o dia =====

// a data de hoje no formato "2026-09-27"
function hojeComoTexto() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + mes + "-" + dia;
}

// o placar de hoje, pronto pra guardar
function placarDoDia() {
  return { data: diaAtual, digitados, colados, tomatadas, pomodoros };
}

// lê o dia salvo quando a extensão liga
function carregarDia() {
  const salvo = memoria.get("dia");
  if (!salvo) return;

  if (salvo.data === diaAtual) {
    // ainda é o mesmo dia: continua de onde parou
    digitados = salvo.digitados;
    colados = salvo.colados;
    tomatadas = salvo.tomatadas;
    pomodoros = salvo.pomodoros;
  } else {
    // é outro dia: guarda o antigo e dá bom dia com o resumo
    memoria.update("ontem", salvo);
    falaAtual = resumo(salvo);
  }
}

// grava o dia na memória
function salvarDia() {
  mudouDesdeSalvar = false;
  return memoria.update("dia", placarDoDia());
}

// o dia virou com o VS Code aberto: guarda o antigo e zera
function virarDia() {
  const velho = placarDoDia();
  memoria.update("ontem", velho);

  diaAtual = hojeComoTexto();
  digitados = 0;
  colados = 0;
  tomatadas = 0;
  pomodoros = 0;
  salvarDia();
  atualizarPlacar();
  avisar("feliz", resumo(velho));
}

// "Bom dia! Da última vez: 3 🏆, 12% colado e 4 tomatadas."
function resumo(dia) {
  const total = dia.digitados + dia.colados;
  const colado = total === 0 ? 0 : Math.round((dia.colados / total) * 100);
  return (
    "Bom dia! Da última vez: " +
    dia.pomodoros +
    " 🏆, " +
    colado +
    "% colado e " +
    dia.tomatadas +
    " tomatadas."
  );
}

// ===== NOVO: manchas de cada arquivo =====

// o "endereço" de um arquivo, usado como chave no Map
function chave(documento) {
  return documento.uri.toString();
}

// guarda uma mancha nova e pinta
function adicionarMancha(editor, inicio, fim) {
  const lista = manchas.get(chave(editor.document)) || [];
  lista.push({ inicio: inicio, fim: fim });
  manchas.set(chave(editor.document), lista);
  pintar(editor);
}

// pinta as manchas de um arquivo aberto
function pintar(editor) {
  const lista = manchas.get(chave(editor.document)) || [];
  const trechos = lista.map((m) => new vscode.Range(m.inicio, 0, m.fim, 0));
  editor.setDecorations(tomate, manchasLigadas() ? trechos : []);
}

// pinta todos os arquivos que estão na tela
function pintarTodos() {
  vscode.window.visibleTextEditors.forEach(pintar);
}

// tira todas as manchas de todos os arquivos
function limparManchas() {
  manchas.clear();
  pintarTodos();
}

// linhas entraram ou saíram: as manchas abaixo descem ou sobem junto
function ajustarManchas(documento, mudanca) {
  const lista = manchas.get(chave(documento));
  if (!lista) return;

  const removidas = mudanca.range.end.line - mudanca.range.start.line;
  const adicionadas = mudanca.text.split("\n").length - 1;
  const diferenca = adicionadas - removidas;
  if (diferenca === 0) return;

  for (const m of lista) {
    if (m.inicio > mudanca.range.end.line) {
      // a mudança foi acima da mancha: ela inteira se move
      m.inicio += diferenca;
      m.fim += diferenca;
    } else if (m.fim >= mudanca.range.start.line) {
      // a mudança foi dentro da mancha: ela estica ou encolhe
      m.fim = Math.max(m.inicio, m.fim + diferenca);
    }
  }
}

// ===== a linha pedida =====

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

// ===== pomodoro, placar e recados =====

// o relógio está pausado?
function estaPausado() {
  const parado = Date.now() - ultimaAtividade > pausaEmMs();
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
    meta: metaMinutos() * 60,
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
  mudouDesdeSalvar = true;

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

  // soma as tomatadas (mesmo com os tomates voando desligados)
  if (tomates > 0) {
    tomatadas += tomates;
    if (tomatesLigados()) splatsNaTela = Math.min(splatsNaTela + tomates, 14);
    atualizarPlacar();
  }

  // NOVO: com os tomates desligados, o painel não joga nada
  enviarHumor(tomatesLigados() ? tomates : 0);
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

// roda quando a extensão desliga: NOVO: salva o dia antes de sair
function deactivate() {
  if (memoria) return salvarDia();
}

// diz ao VS Code quais funções ele pode chamar
module.exports = {
  activate,
  deactivate,
};
