let pendingSelections = {};

async function carregar(){

  let container = document.getElementById("tvs");

  let state;
  try{
    let res = await fetch("/state");
    state = await res.json();
  }catch(e){
    console.error("Erro ao buscar state:", e);
    container.innerHTML = "<p>Erro ao carregar TVs</p>";
    return;
  }

  if(!state || Object.keys(state).length === 0){
    container.innerHTML = "<p class='mensagemtv'>• Nenhuma TV conectada</p>";
    return;
  }

  // preserva o estado aberto dos detalhes enquanto faz refresh
  let openState = {};
  let savedStates = JSON.parse(localStorage.getItem('tvDetailsStates') || '{}');

  container.querySelectorAll(".tv").forEach(tvDiv => {
    let tvName = tvDiv.querySelector("h2")?.innerText;
    if(!tvName) return;

    tvDiv.querySelectorAll("details.details-block").forEach(d=>{
      let legend = d.querySelector("summary")?.innerText;
      if(legend) {
        let key = tvName + "|" + legend;
        openState[key] = d.open;
        // Atualiza savedStates com estado atual
        savedStates[key] = d.open;
      }
    });
  });
  // Salva no localStorage
  localStorage.setItem('tvDetailsStates', JSON.stringify(savedStates));

  container.innerHTML = "";

  Object.keys(state)
  .sort((a,b)=>{

    let na = parseInt(a.replace("tv",""));
    let nb = parseInt(b.replace("tv",""));

    return na - nb;

  })
  .forEach(tv => {

    let div = document.createElement("div");
    div.className = "tv";

    // título da TV
    let titulo = document.createElement("h2");
    titulo.innerText = tv;
    div.appendChild(titulo);

    // container principal (imagem + botões)
    let mainArea = document.createElement("div");
    mainArea.className = "tv-content";

    // -------------------------
    // PREVIEW
    // -------------------------

    let iframe = document.createElement("iframe");
    iframe.className = "tv-preview-frame";
    iframe.src = "/viewer-tester.html?tv=" + tv + "&preview=true";

    // -------------------------
    // BOTÕES
    // -------------------------

    let botoes = document.createElement("div");
    botoes.className = "tv-buttons";

    function criarBotao(nome, rota){

      let btn = document.createElement("button");

      btn.innerText = nome;
      btn.className = "playlist-btn";

      btn.onclick = () => {
        window.location.href = rota + "?tv=" + tv;
      };

      return btn;
    }

    botoes.appendChild(criarBotao("Vídeos", "playlists/playlists-videos.html"));
    botoes.appendChild(criarBotao("Avisos", "playlists/playlists-avisos.html"));
    botoes.appendChild(criarBotao("Mapa do Campus", "playlists/playlists-mapa.html"));
    botoes.appendChild(criarBotao("Ensalamento", "playlists/playlists-ensalamento.html"));
    botoes.appendChild(criarBotao("Modo Padrão", "playlists/playlists-padrao.html"));

    // -------------------------
    // 🔗 JUNTA TUDO
    // -------------------------

    mainArea.appendChild(iframe);
    mainArea.appendChild(botoes);

    div.appendChild(mainArea);

    container.appendChild(div);

  });
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