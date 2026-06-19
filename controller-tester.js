let pendingSelections = {};
let tvSelecionada = null;

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

//function criarCategoria() {}

function criarMenuTVs(lista){
  const menu = document.getElementById("menu-tvs");
  menu.innerHTML = "";

  lista.forEach(tv=>{
    const botao = document.createElement("button");
    botao.innerText = tv;
    botao.className = "botao-tv";

    botao.onclick = ()=>{
        tvSelecionada = tv;
        mostrarTV(tv);
    }
    menu.appendChild(botao);
  });
}

function mostrarTV(tv){
  const container = document.getElementById("tv-atual");

  container.innerHTML = "";
  const field = document.createElement("fieldset");
  field.className = "tv";

  field.innerHTML = `
    <h2>${tv}</h2>
    <iframe
      class="tv-preview-frame"
      src="/viewer-tester.html?tv=${tv}&preview=true">
    </iframe>

    <div id="playlist">
      <div class="playlist-header">
        <h3 class="titulo-playlist-atual">Playlist Atual</h3>
        <button class="btn-editar" onclick="editarPlaylist()">Editar</button>
      </div>

      <ol id="playlist-${tv}"></ol>
    </div>
  `;

  container.appendChild(field);
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
  mostrarTV(tvSelecionada);
}


async function mudar(tv, pagina, intervalo){

  await fetch("/update", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      tv,
      pagina,
      intervalo
    })
  });

}
carregar();