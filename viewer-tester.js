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
function getTempo(tipo, item) {

  if (tipo === "videos") {
    return (item.duracao || 60) * 1000;
  }

  if (tipo === "ensalamento") return 999999999;
  if (tipo === "mapa") return 10000;
  if (tipo === "avisos") {
    // if duration is set on the item, use it
    if (item && item.duracao) {
      return (item.duracao || 60) * 1000;
    }

    if (
      item.embed ||
      item.tipo === "canva"
    ) {
      return 999999999;
    }

    return 5000;
}

  return 5000;
}


// =========================
// RENDER
// =========================
async function render(tipo, item) {

  // ================= VIDEO =================
if (tipo === "videos") {

    frame.style.display = "block";
    content.style.display = "none";

    let src = item.iframe;

    src = normalizarYoutube(src);

    if (frame.src !== src) {
        frame.src = src;
    }

    return;
}

  // ================= OUTROS =================
  frame.style.display = "none";
  content.style.display = "block";

  if (tipo === "avisos") {

  // =========================
  // AVISO CANVA / LINK
  // =========================

  if (item.embed || item.tipo === "canva") {

    let src =
      item.embed ||
      item.url ||
      item.texto;

    content.innerHTML = `
      <div
        style="
          width:100vw;
          height:100vh;
          display:flex;
          justify-content:center;
          align-items:center;
          background:#000;
        "
      >
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
          "
        ></iframe>
      </div>
    `;

    return;
  }

  // =========================
  // AVISO TEXTO
  // =========================

  content.innerHTML = `
    <div class="aviso">
      <fieldset class="field-texto">
        <legend>
          <img src="/layouts/logo-ifsc.png" class="warning-image">
        </legend>
        ${item.texto}
      </fieldset>
    </div>
  `;

  return;
}
  if (tipo === "mapa") {
    content.innerHTML = `
      <img src="${item.src}" class="imagemViewer">
    `;
    return;
  }

  if (tipo === "ensalamento") {

    let res = await fetch("/ensalamento");
    let dados = await res.json();

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

    html += `</div>`;

    content.innerHTML = html;

    return;
}
  if (tipo === "calendario") {
    content.innerHTML = `
      <iframe src="${item.src}"
        style="width:80vw;height:100vh;margin-left:10vw;">
      </iframe>
    `;
    return;
  }
}


// =========================
// PLAYLIST
// =========================
async function rodarPlaylist(tipo, items) {

  if (!items || items.length === 0) return;

  let item = items[playlistIndex];

  await render(tipo, item);

  let tempo = getTempo(tipo, item);

  playlistIndex = (playlistIndex + 1) % items.length;

  if (playlistTimer) clearTimeout(playlistTimer);

  if ( !(true) && !(tipo === "avisos" && (item.embed || item.tipo === "canva"))) {
  playlistTimer = setTimeout(() => {
    rodarPlaylist(tipo);
  }, tempo);
}
}


// =========================
// MODO PADRÃO
// =========================
async function rodarModoPadrao() {

  let res = await fetch(`/playlist?tv=${tvId}&type=padrao`);
  let items = await res.json();

  if (!items || items.length === 0) return;

  let item = items[playlistIndex];

  await render(item.tipo, item);

  let tempo = getTempo(item.tipo, item);

  playlistIndex = (playlistIndex + 1) % items.length;

  if (playlistTimer) clearTimeout(playlistTimer);

  if (!(item.tipo === "videos" && item.live)) {
    playlistTimer = setTimeout(() => {
      rodarModoPadrao();
    }, tempo);
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


// =========================
// CONTEÚDO
// =========================
async function mostrarConteudo(type, refreshAtual) {

  if (carregandoConteudo) return;
  carregandoConteudo = true;

  try {

    let res = await fetch(`/playlist?tv=${tvId}&type=${type}`);
    let items = await res.json();

    if (!items || items.length === 0) return;

    // Normalizar itens para comparar apenas campos relevantes e evitar flicker
    let simplified;
    if (type === "avisos") {
      simplified = items.map(i => ({
        embedRaw: i.embedRaw || null,
        embed: i.embed || null,
        url: i.url || null,
        texto: typeof i.texto === 'string' ? i.texto : JSON.stringify(i.texto)
      }));
    } else if (type === "videos") {
      simplified = items.map(i => ({
        id: i.id || null,
        iframe: i.iframe || null,
        live: !!i.live,
        duracao: i.duracao || null
      }));
    } else {
      simplified = items;
    }

    let conteudoAtual = JSON.stringify(simplified);

    // Só re-renderiza quando o conteúdo relevante mudar
    if (ultimoConteudo === conteudoAtual) {
      return;
    }

    ultimoConteudo = conteudoAtual;
    ultimoRefresh = refreshAtual;

    playlistIndex = 0;

    if (playlistTimer) {
      clearTimeout(playlistTimer);
      playlistTimer = null;
    }

      await rodarPlaylist(type, items);

  } catch (e) {
    console.error("Erro mostrarConteudo:", e);
  } finally {
    carregandoConteudo = false;
  }
}


// =========================
// LOOP PRINCIPAL
// =========================
async function carregar() {

  try {
    let res = await fetch("/state");
    let state = await res.json();

    if (!tvId || !state[tvId]) {
      if (!preview) {
        localStorage.removeItem("tvId");
        await registrar();
      }
      return;
    }

    let config = state[tvId];

    let pagina =
      typeof config === "string"
        ? config
        : config.pagina;

    // ================= MODOS =================

    if (pagina?.includes("padrao")) {

      if (modoAtual !== "padrao") {
        playlistIndex = 0;

        if (playlistTimer) {
          clearTimeout(playlistTimer);
          playlistTimer = null;
        }

        rodarModoPadrao();
      }

      modoAtual = "padrao";
      return;
    }

    if (pagina?.includes("videos")) {
      modoAtual = "videos";
      mostrarConteudo("videos", config.refresh);
      return;
    }

    if (pagina?.includes("avisos")) {
      modoAtual = "avisos";
      mostrarConteudo("avisos", config.refresh);
      return;
    }

    if (pagina?.includes("mapa")) {
      modoAtual = "mapa";
      mostrarConteudo("mapa", config.refresh);
      return;
    }

    if (pagina?.includes("ensalamento")) {

      modoAtual = "ensalamento";

      mostrarConteudo(
        "ensalamento",
        config.refresh
      );
      return;
    }
    
    if (pagina?.includes("calendario")) {
      modoAtual = "calendario";
      mostrarConteudo("calendario", config.refresh);
      return;
    }

    // ================= FALLBACK =================
    modoAtual = "iframe";

    if (playlistTimer) {
      clearTimeout(playlistTimer);
      playlistTimer = null;
    }

    frame.style.display = "block";
    content.style.display = "none";

    if (ultimaPagina !== pagina) {
      frame.src = pagina;
      ultimaPagina = pagina;
    }

  } catch (e) {
    console.error("Erro ao carregar:", e);
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