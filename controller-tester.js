
// VARIÁVEIS GLOBAIS
let pendingSelections = {};
let tvSelecionada = null;
let playlistAtual = [];
let modoEdicao = false;
let dragIndex = null;
let estadoTVs = {};

// CONFIGURAÇÃO DA TV SELECIONADA
const CHAVE_TV_SELECIONADA = "tvSelecionada";

// SALVAR TV SELECIONADA
function salvarTVSelecionada(tv) {

  if (!tv) {
    return;
  }
  tvSelecionada = tv;
  localStorage.setItem(CHAVE_TV_SELECIONADA, tv);
}

// OBTER TV SALVA
function obterTVSelecionadaSalva() {
  return localStorage.getItem(CHAVE_TV_SELECIONADA);
}

// OBTER NOME DA TV
function obterNomeTV(tv) {
  if (!tv) {
    return "";
  }
  return tv.nome || tv.id;
}

// ATUALIZAR TEXTO DO BOTÃO
function atualizarTituloTV() {

  const titulo = document.getElementById("tv-selecionada-navbar");

  if (!titulo) {
    return;
  }

  if (!tvSelecionada) {
    titulo.textContent = "Nenhuma TV selecionada";
    return;
  }

  const dadosTV = estadoTVs[tvSelecionada] || {};
  const nomeTV = dadosTV.nome || tvSelecionada;
  const status = dadosTV.status === "inativa" ? "🔴 Offline" : "🟢 Online";
  titulo.textContent = `${nomeTV} — ${status}`;
}

// ABRIR MENU
function abrirMenuTVs() {
  const menu = document.getElementById("menu-tvs-navbar");
  const container = document.getElementById("seletor-tv-container");
  if (!menu || !container) {
    return;
  }
  menu.classList.add("aberto");
  container.classList.add("aberto");
}

// FECHAR MENU
function fecharMenuTVs() {
  const menu = document.getElementById("menu-tvs-navbar");
  const container = document.getElementById("seletor-tv-container");

  if (!menu || !container) {
    return;
  }

  menu.classList.remove("aberto");
  container.classList.remove("aberto");
}

// ALTERNAR MENU
function alternarMenuTVs() {
  const menu = document.getElementById("menu-tvs-navbar");

  if (!menu) {
    return;
  }

  if (menu.classList.contains("aberto")) {
    fecharMenuTVs();
  } else {
    abrirMenuTVs();
  }
}

// CRIAR MENU DAS TVs
function criarMenuTVs(estado) {
  const menu = document.getElementById("menu-tvs-navbar");

  if (!menu) {
    console.error("Elemento #menu-tvs-navbar não encontrado.");
    return;
  }

  menu.innerHTML = "";
  const listaTVs = Object.keys(estado).sort();

  if (listaTVs.length === 0) {
    const mensagem = document.createElement("div");
    mensagem.className = "menu-tv-vazio";
    mensagem.textContent = "Nenhuma TV cadastrada";
    menu.appendChild(mensagem);
    atualizarTituloTV();
    return;
  }

  listaTVs.forEach(tv => {
    const dadosTV = estado[tv] || {};
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "item-tv-navbar";

    if (tv === tvSelecionada) {
      botao.classList.add("selecionada");
    }

    if (dadosTV.status === "inativa") {
      botao.classList.add("tv-inativa");
    } else {
      botao.classList.add("tv-ativa");
    }

    const nomeTV = dadosTV.nome || tv;
    const status = dadosTV.status === "inativa" ? "Offline" : "Online";

    const icone = dadosTV.status === "inativa" ? "🔴" : "🟢";

    botao.innerHTML = `<span class="nome-tv-menu">${nomeTV}</span>
      <span class="status-tv-menu">${icone} ${status}</span>`;

    botao.addEventListener("click", async function(event) {
      event.stopPropagation();
      console.log("TV selecionada:", tv);
      await selecionarTV(tv);
    });

    menu.appendChild(botao);
  });
  atualizarTituloTV();
}

// SELECIONAR TV
async function selecionarTV(tv) {

  if (!tv) {
    return;
  }

  console.log("Alterando TV para:", tv);
  salvarTVSelecionada(tv);

  const estado = await obterEstadoTVs();
  estadoTVs = estado;
  atualizarTituloTV();
  fecharMenuTVs();
  criarMenuTVs(estado);
  await mostrarTV(tv);
}

// OBTER TVs CONECTADAS
async function obterEstadoTVs() {
  const resposta = await fetch("/state", {cache: "no-store"}
  );

  if (!resposta.ok) {
    throw new Error("Não foi possível obter o estado das TVs.");
  }

  estadoTVs = await resposta.json();
  return estadoTVs;
}

// CONFIGURAR BOTÃO DO SELETOR
function configurarSeletorTV() {
  const botao = document.getElementById("botao-tv-selecionada");
  
  if (!botao) {
    console.error("Botão #botao-tv-selecionada não encontrado.");
    return;
  }
  console.log("Seletor de TV configurado.");

  botao.addEventListener(
    "click",
    function(event) {
      event.stopPropagation();
      alternarMenuTVs();
    }
  );

  const menu = document.getElementById("menu-tvs-navbar");
  
  if (menu) {
    menu.addEventListener(
      "click",
      function(event) {
        event.stopPropagation();
      }
    );
  }

  document.addEventListener(
    "click",
    function() {
      fecharMenuTVs();
    }
  );
}

function renderizarPlaylist(tv) {
  const lista = document.getElementById(`playlist-${tv}`);

  if (!lista) {
    return;
  }
  lista.innerHTML = "";

  const totalSegundos = playlistAtual.reduce((total, item) => {
    return (total + (item.duracao ?? 30));
  }, 0);

  const minutos = Math.floor(totalSegundos / 60);
  const segundos = totalSegundos % 60;
  const titulo = document.getElementById("titulo-playlist");

  if (titulo) {
    titulo.textContent = `Playlist Atual (${playlistAtual.length} itens • ${minutos} min ${segundos}s)`;
  }

  playlistAtual.forEach((item, index) => {
    const li = document.createElement("li");
    li.dataset.index = index;
    const numero = String(index + 1).padStart(2,"0");
    const duracao = item.duracao ?? 30;
    
    li.innerHTML = `

      <div class="playlist-item">
        <div class="playlist-esquerda">
          <span class="playlist-numero">${numero}.</span>
          <span class="playlist-titulo">
            ${
              item.titulo ||
              item.nome ||
              item.tipo ||
              "Item"
            }
          </span>
        </div>

        <span class="playlist-duracao">| ${duracao}s</span>
      </div>

      ${modoEdicao ? `
          <button class="btn-remover" onclick="removerItem(${index})">✖</button>` : ""
      }`;

    if (modoEdicao) {
      li.draggable =true;

      li.addEventListener("dragstart", dragStart);
      li.addEventListener("dragover", dragOver);
      li.addEventListener("drop", dropItem);
    }
    lista.appendChild(li);
  }
);

}

async function mostrarTV(tv) {

  if (!tv) {
    return;
  }

  const dadosTV = estadoTVs[tv] || {};
  const nomeTV = dadosTV.nome || tv;
  const tvEstaAtiva = dadosTV.status !== "inativa";
  const container = document.getElementById("tv-atual");

  container.innerHTML = "";
  const field = document.createElement("fieldset");
  field.className = "tv";
  field.innerHTML = `

    <div class="tv-titulo-container">
      <h2>${nomeTV}</h2>
      <button class="btn-renomear-tv" onclick="renomearTV()"title="Renomear esta TV">✏️ Renomear TV</button>
    </div>

    <div class="status-tv-detalhado">
      ${tvEstaAtiva ? `<span class="status-online">🟢 TV conectada</span>`: `<span class="status-offline">🔴 TV desconectada</span>`}
    </div>

    ${tvEstaAtiva ? `
          <iframe class="tv-preview-frame" src="/viewer-tester.html?tv=${encodeURIComponent(tv)}&preview=true"></iframe>` : `
          <div class="tv-offline-container">
            <div class="tv-offline-icone">📺</div>
            <h3>TV desconectada</h3>
            <p>Esta televisão está cadastrada no sistema,mas não está conectada no momento.</p>
          </div>`}

    <div id="playlist">
      <div class="playlist-header">

        <h3 class="titulo-playlist-atual" id="titulo-playlist">Playlist Atual</h3>
        <button class="btn-editar" onclick="editarPlaylist()">Editar</button>
      </div>

      <ol id="playlist-${tv}" class="listaPlaylistAtual"></ol>
    </div>`;

  container.appendChild(field);


  try {
    const resposta = await fetch(`/playlist-tv/${encodeURIComponent(tv)}`, {cache: "no-store"});

    if (!resposta.ok) {
      throw new Error("Não foi possível carregar a playlist.");
    }

    playlistAtual = await resposta.json();
    renderizarPlaylist(tv);
  } catch (erro) {
    console.error("Erro ao carregar playlist da TV:",erro);
  }
}

async function renomearTV() {

  if (!tvSelecionada) {
    alert("Nenhuma TV selecionada.");
    return;
  }

  const nomeAtual = estadoTVs[tvSelecionada]?.nome || tvSelecionada;
  const novoNome = prompt("Digite o novo nome da TV:", nomeAtual);

  if (!novoNome) {
    return;
  }

  try {
    const resposta = await fetch("/tv/renomear", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        tv: tvSelecionada,
        nome: novoNome
      })
    });

    const dados = await resposta.json();
    if (!resposta.ok) {
      throw new Error(dados.erro || "Erro ao renomear TV.");
    }

    estadoTVs[tvSelecionada].nome = dados.nome;
    atualizarTituloTV();

    const tvs = Object.keys(estadoTVs).sort().map(id => ({id, nome: estadoTVs[id].nome || id}));
    criarMenuTVs(tvs);
    await mostrarTV(tvSelecionada);
    alert("TV renomeada com sucesso.");
  } catch (erro) {
    console.error("Erro ao renomear TV:", erro);
    alert(erro.message || "Não foi possível renomear a TV.");
  }
}

function editarPlaylist() {
  modoEdicao = !modoEdicao;

  renderizarPlaylist(tvSelecionada);

  const botao = document.querySelector(".btn-editar");

  if (!botao) {
    return;
  }

  botao.textContent = modoEdicao ? "Salvar" : "Editar";

  if (!modoEdicao) {
    salvarPlaylistEditada();
  }
}

function removerItem(index) {
  if (!confirm("Remover este item da playlist?")) {
    return;
  }

  playlistAtual.splice(index, 1);

  renderizarPlaylist(tvSelecionada);
  salvarPlaylistEditada();
}

function dragStart(event) {
  dragIndex = Number(event.target.dataset.index);
}

function dragOver(event) {
  event.preventDefault();
}

function dropItem(event) {
  event.preventDefault();

  const dropIndex = Number(event.currentTarget.dataset.index);
  const item = playlistAtual.splice(dragIndex, 1)[0];

  playlistAtual.splice(dropIndex, 0, item);
  renderizarPlaylist(tvSelecionada);
  salvarPlaylistEditada();
}

async function salvarPlaylistEditada() {
  if (!tvSelecionada) {
    return;
  }

  try {
    await fetch("/playlist/reorder", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        tv: tvSelecionada,
        items: playlistAtual
      })
    });

    await fetch("/update", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        tv: tvSelecionada,
        refresh:Date.now()
      })
    });

  } catch (erro) {
    console.error("Erro ao salvar playlist:", erro);
  }
}

async function carregar() {

  try {
    const estado = await obterEstadoTVs();
    estadoTVs = estado;
    const tvs = Object.keys(estado).sort();
    console.log("TVs encontradas:", tvs);

    if (tvs.length === 0) {
      tvSelecionada = null;
      localStorage.removeItem(CHAVE_TV_SELECIONADA);
      criarMenuTVs({});

      document.getElementById("tv-atual").innerHTML = `<p class="mensagemtv">Nenhuma TV cadastrada</p>`;
      return;
    }

    const tvSalva = obterTVSelecionadaSalva();

    if (tvSalva && tvs.includes(tvSalva)) {

      tvSelecionada =tvSalva;
    } else {
      tvSelecionada =tvs[0];
      salvarTVSelecionada(tvSelecionada);
    }
    criarMenuTVs(estado);
    configurarSeletorTV();
    await mostrarTV(tvSelecionada);

  } catch (erro) {
    console.error("Erro ao carregar TVs:", erro);
  }
}

async function mudar(tv, pagina, intervalo) {
  await fetch("/update", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        tv: tvSelecionada,
        refresh:Date.now()
      })
    });
}

// INIT
carregar();