// =========================
// CONFIG INICIAL
// =========================
let params = new URLSearchParams(window.location.search);
let preview = params.get("preview") === "true";

let tvId = preview
  ? params.get("tv")
  : localStorage.getItem("tvId");

let ultimaPagina = null;
let modoAtual = "iframe";

let ultimoConteudo = "";
let ultimoRefresh = null;
let carregandoConteudo = false;

let heartbeatInterval = null;
let polling = null;

let playlistIndex = 0;
let playlistTimer = null;
let ultimaPlaylistHash = "";
let playlistAtual = [];


// DOM
const frame = document.getElementById("frame");
const content = document.getElementById("content");

// =========================
// NORMALIZAR YOUTUBE
// =========================
function normalizarYoutube(src) {
  try {
    let url = new URL(src);

    if (!url.hostname.includes("youtube")) return src;

    if (url.pathname === "/watch" || url.pathname === "/watch/") {
      url.searchParams.set("autoplay", "1");
      url.searchParams.set("mute", "1");
      return url.toString();
    }

    if (!url.pathname.includes("/embed/")) {
      let id = url.searchParams.get("v");
      if (id) {
        url = new URL(`https://www.youtube.com/embed/${id}`);
      }
    }

    url.searchParams.set("autoplay", "1");
    url.searchParams.set("mute", "1");
    url.searchParams.set("playsinline", "1");
    url.searchParams.set("rel", "0");

    return url.toString();

  } catch {
    return src;
  }
}

// =========================
// TEMPO
// =========================
function getTempoItem(item){

  return (
    item.duracao ||
    item.intervalo ||
    10
  ) * 1000;

}
// =========================
// RENDER
// =========================
async function render(item) {

  let tipo = item.tipo;

  if(!tipo){

    if(item.iframe){
      tipo = "videos";
    }

    else if(
      item.embed ||
      item.texto ||
      item.url
    ){
      tipo = "avisos";
    }

  }

  // ================= VIDEO =================
  if (tipo === "videos" || tipo === "video") {

    frame.style.display = "block";
    content.style.display = "none";

    let src = normalizarYoutube(item.iframe);

    if (frame.src !== src) {
      frame.src = src;
    }

    return;
  }

  // ================= OUTROS =================
  frame.style.display = "none";
  content.style.display = "block";

  // ================= AVISOS =================
  if (tipo === "avisos" || tipo === "aviso") {

    // Canva
    if (item.embed || item.tipoConteudo === "canva") {

      const src =
        item.embed ||
        item.url ||
        item.texto;

      content.innerHTML = `
        <div style="
          width:100vw;
          height:100vh;
          display:flex;
          justify-content:center;
          align-items:center;
          background:#000;
        ">
          <iframe
            src="${src}"
            style="
              width:100vw;
              height:100vh;
              border:none;
            "
            allowfullscreen
            allow="
              autoplay;
              fullscreen;
              clipboard-read;
              clipboard-write
            ">
          </iframe>
        </div>
      `;

      return;
    }

    // PDF
    if (item.arquivo && item.arquivo.endsWith(".pdf")) {

      content.innerHTML = `
        <iframe
          src="${item.arquivo}"
          style="
            width:100vw;
            height:100vh;
            border:none;
          ">
        </iframe>
      `;

      return;
    }

    // Imagem PNG/JPG
    if (
      item.arquivo &&
      (
        item.arquivo.endsWith(".png") ||
        item.arquivo.endsWith(".jpg") ||
        item.arquivo.endsWith(".jpeg") ||
        item.arquivo.endsWith(".webp")
      )
    ) {

      content.innerHTML = `
        <img
          src="${item.arquivo}"
          style="
            width:100vw;
            height:100vh;
            object-fit:contain;
          "
        >
      `;

      return;
    }

    // Texto
    content.innerHTML = `
      <div class="aviso">
        <fieldset class="field-texto">
          <legend>
            <img
              src="/layouts/logo-ifsc.png"
              class="warning-image"
            >
          </legend>

          ${item.texto || ""}
        </fieldset>
      </div>
    `;

    return;
  }

  // ================= MAPA =================
  if (tipo === "mapa") {

    content.innerHTML = `
      <img
        src="${item.src}"
        class="imagemViewer"
      >
    `;
    return;
  }

  // ================= ENSALAMENTO =================
  if (tipo === "ensalamento") {

    const res = await fetch("/ensalamento");
    const dados = await res.json();

    let html = `
      <div class="ensalamento">
        <h1>Ensalamento IFSC Garopaba</h1>

        <div class="ultima-atualizacao">
          ${dados.ultimaAtualizacao || ""}
        </div>
    `;

    dados.salas.forEach(sala => {

      html += `
        <div class="sala">

          <h2>${sala.nome}</h2>

          <table>
            <thead>
              <tr>
                <th>Horário</th>
                <th>Seg</th>
                <th>Ter</th>
                <th>Qua</th>
                <th>Qui</th>
                <th>Sex</th>
              </tr>
            </thead>

            <tbody>
      `;

      sala.periodos.forEach(periodo => {

        html += `
          <tr>
            <td>${periodo.nome}</td>
            <td>${periodo.seg || ""}</td>
            <td>${periodo.ter || ""}</td>
            <td>${periodo.qua || ""}</td>
            <td>${periodo.qui || ""}</td>
            <td>${periodo.sex || ""}</td>
          </tr>
        `;
      });

      html += `
            </tbody>
          </table>

        </div>
      `;
    });

    html += `
      </div>
    `;

    content.innerHTML = html;

    return;
  }

  // ================= CALENDÁRIO =================
  if (tipo === "calendario") {

    content.innerHTML = `
      <iframe
        src="${item.src}"
        style="
          width:100vw;
          height:100vh;
          border:none;
        ">
      </iframe>
    `;

    return;
  }

  // ================= FALLBACK =================
  content.innerHTML = `
    <div style="
      display:flex;
      justify-content:center;
      align-items:center;
      width:100vw;
      height:100vh;
      font-size:2rem;
    ">
      Conteúdo não suportado
    </div>
  `;
}


// =========================
// PLAYLIST
// =========================
async function rodarPlaylistTV(items){

  if(!items || items.length === 0){
    return;
  }

  const item = items[playlistIndex];

  await render(item);

  const tempo = getTempoItem(item);

  playlistIndex =
    (playlistIndex + 1) % items.length;

  clearTimeout(playlistTimer);

  playlistTimer = setTimeout(()=>{

    rodarPlaylistTV(items);

  }, tempo);
}

async function mostrarPlaylistTV(){

  try{

    const res =
      await fetch(`/playlist-tv/${tvId}`);

    const items =
      await res.json();

    if(!items.length){
      return;
    }

    playlistIndex = 0;

    clearTimeout(playlistTimer);

    await rodarPlaylistTV(items);

  }catch(err){

    console.error(err);

  }

}


// =========================
// REGISTRO
// =========================
async function registrar() {
  if (preview) return;

  try {
    let res = await fetch("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tv: tvId })
    });

    let data = await res.json();

    tvId = data.tv;
    localStorage.setItem("tvId", tvId);

    iniciarHeartbeat();
    await ping();

  } catch (e) {
    console.error("Erro register:", e);
  }
}

async function ping() {
  if (preview) return;

  try {
    await fetch("/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tv: tvId }),
      keepalive: true
    });
  } catch (e) {
    console.error("Erro ping:", e);
  }
}

function iniciarHeartbeat() {
  if (preview) return;

  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(ping, 30000);
}


// =========================
// UNREGISTER
// =========================
function desligar() {
  if (preview) return;

  if (tvId) {
    const params = new URLSearchParams();
    params.append("tv", tvId);
    navigator.sendBeacon("/unregister", params);
  }
}

window.addEventListener("beforeunload", desligar);


async function tocarPlaylist() {

  if (playlistAtual.length === 0) {

    content.innerHTML = `
      <div class="sem-conteudo">
        Nenhum conteúdo na playlist
      </div>
    `;

    return;
  }

  const item = playlistAtual[playlistIndex];

  await render(item);

  const duracao =
    (item.duracao || item.intervalo || 10) * 1000;

  playlistTimer = setTimeout(() => {

    playlistIndex++;

    if (playlistIndex >= playlistAtual.length) {
      playlistIndex = 0;
    }

    tocarPlaylist();

  }, duracao);
}

// =========================
// LOOP PRINCIPAL
// =========================
async function carregar() {

  try {

    const res = await fetch(`/playlist-tv/${tvId}`);
    const playlist = await res.json();

    if (!Array.isArray(playlist)) {
      return;
    }

    // playlist mudou?
    const hashAtual = JSON.stringify(playlist);

    if (hashAtual === ultimaPlaylistHash) {
      return;
    }

    ultimaPlaylistHash = hashAtual;

    playlistAtual = playlist;
    playlistIndex = 0;

    if (playlistTimer) {
      clearTimeout(playlistTimer);
      playlistTimer = null;
    }

    tocarPlaylist();

  } catch(err) {

    console.error(
      "Erro ao carregar playlist:",
      err
    );

  }
}


// =========================
// INIT
// =========================
async function iniciar() {

  if (!preview) {
    await registrar();
  }

  await carregar();

  if (!polling) {
    polling = setInterval(carregar, 5000);
  }
}

iniciar();