let pendingSelections = {};
let tvSelecionada = null;
let playlistAtual = [];
let modoEdicao = false;
let dragIndex = null;

function adicionarConteudo(event) {

  event.preventDefault(); 
  
  var input = document.getElementById("inputconteudo");

  if (input.style.display === "none") {
      input.style.display = "block";
      input.focus(); 
  } else {
      input.style.display = "none";
  }

  var criarconteudo =  document.getElementById("criarconteudo");

  if (criarconteudo.style.display === "none") {
      criarconteudo.style.display = "block";
      criarconteudo.focus(); 
  } else {
      criarconteudo.style.display = "none";
  }
}

function adicionarPlaylist(event) {

  event.preventDefault(); 
  
  var input = document.getElementById("inputplaylist");

  if (input.style.display === "none") {
      input.style.display = "block";
      input.focus(); 
  } else {
      input.style.display = "none";
  }

  var criarplaylist =  document.getElementById("criarplaylist");

  if (criarplaylist.style.display === "none") {
      criarplaylist.style.display = "block";
      criarplaylist.focus(); 
  } else {
      criarplaylist.style.display = "none";
  }
}


function criarMenuTVs(lista){
  const menu = document.getElementById("menu-tvs");
  menu.innerHTML = "";

  lista.forEach(tv=>{
    const botao = document.createElement("button");
    botao.innerText = tv;
    botao.className = "botao-tv";

    botao.onclick = async ()=>{
      tvSelecionada = tv;
      await mostrarTV(tv);
    }
    menu.appendChild(botao);
  });
}

function renderizarPlaylist(tv){

  const lista = document.getElementById(`playlist-${tv}`);
  lista.innerHTML = "";

  const totalSegundos = playlistAtual.reduce((total, item) => total + (item.duracao ?? 30),0);

  const minutos = Math.floor(totalSegundos / 60);
  const segundos = totalSegundos % 60;

  document.getElementById("titulo-playlist").textContent = `Playlist Atual (${playlistAtual.length} itens • ${minutos} min ${segundos}s)`;

  playlistAtual.forEach((item, index) => {

    const li = document.createElement("li");

    li.dataset.index = index;

    const numero = String(index + 1).padStart(2, "0");
    const duracao = item.duracao ?? 30;

    li.innerHTML = `

      <div class="playlist-item">
        <div class="playlist-esquerda">

          <span class="playlist-numero">
            ${numero}.
          </span>

          <span class="playlist-titulo">
            ${
              item.titulo ||
              item.nome ||
              item.tipo ||
              "Item"
            }
          </span>

        </div>

      <span class="playlist-duracao">
        ${duracao}s
      </span>

      </div>

    ${
      modoEdicao
      ? `
        <button
          class="btn-remover"
          onclick="removerItem(${index})">
          ✖
        </button>
      `
      : ""
    }
  `;

  if(modoEdicao){

    li.draggable = true;

    li.addEventListener(
      "dragstart",
      dragStart
    );

    li.addEventListener(
      "dragover",
      dragOver
    );

    li.addEventListener(
      "drop",
      dropItem
    );
  }

  lista.appendChild(li);
  });
}

async function mostrarTV(tv){

  const container = document.getElementById("tv-atual");
  container.innerHTML = "";
  const field = document.createElement("fieldset");
  field.className = "tv";

  field.innerHTML = `
    <h2>${tv}</h2>

    <iframe class="tv-preview-frame" src="/viewer-tester.html?tv=${tv}&preview=true"></iframe>

    <div id="playlist">

      <div class="playlist-header">

        <h3 class="titulo-playlist-atual" id="titulo-playlist"> Playlist Atual </h3>

        <button class="btn-editar" onclick="editarPlaylist()">Editar</button>

      </div>

      <ol id="playlist-${tv}" class="listaPlaylistAtual"></ol>

    </div>
  `;

  container.appendChild(field);

  try{

    const res = await fetch(`/playlist-tv/${tv}`);

    playlistAtual = await res.json();

    renderizarPlaylist(tv);

  }catch(err){

    console.error(
      "Erro ao carregar playlist da TV:",
      err
    );

  }
}

function editarPlaylist(){

  modoEdicao = !modoEdicao;
  renderizarPlaylist(tvSelecionada);
  const btn =document.querySelector(".btn-editar");

  btn.textContent =
    modoEdicao
      ? "Salvar"
      : "Editar";

  if(!modoEdicao){
    salvarPlaylistEditada();
  }
}

function removerItem(index){
  if(
    !confirm("Remover este item da playlist?")
  ){
    return;
  }

  playlistAtual.splice(index,1);
  renderizarPlaylist(tvSelecionada);
  salvarPlaylistEditada();
}

function dragStart(e){

  dragIndex =
    Number(
      e.target.dataset.index
    );
}

function dragOver(e){

  e.preventDefault();
}

function dropItem(e){

  e.preventDefault();

  const dropIndex =
    Number(
      e.currentTarget.dataset.index
    );

  const item =
    playlistAtual.splice(
      dragIndex,
      1
    )[0];

  playlistAtual.splice(
    dropIndex,
    0,
    item
  );

  renderizarPlaylist(tvSelecionada);

  salvarPlaylistEditada();
}

async function salvarPlaylistEditada(){

  try{

    await fetch("/playlist/reorder",{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        tv: tvSelecionada,
        items: playlistAtual
      })
    });

    await fetch("/update",{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        tv: tvSelecionada,
        refresh: Date.now()
      })
    });

  }catch(err){

    console.error(err);

  }
}

async function carregar(){
  const res = await fetch("/state");
  const state = await res.json();

  const tvs = Object.keys(state).sort();

  if(tvs.length === 0){
    document.getElementById("tv-atual").innerHTML =
      "<p class='mensagemtv'>Nenhuma TV conectada</p>";
    return;
  }

  if(!tvSelecionada){
    tvSelecionada = tvs[0];
  }

  criarMenuTVs(tvs);
  await mostrarTV(tvSelecionada);
}

async function mudar(tv, pagina, intervalo){

  await fetch("/update",{
  method:"POST",
  headers:{
    "Content-Type":"application/json"
  },
  body:JSON.stringify({
    tv,
    refresh: Date.now()
  })
});

}
carregar();