// =========================
// CONFIG INICIAL
// =========================

const params =
  new URLSearchParams(window.location.search);

const preview =
  params.get("preview") === "true";

let tvId =
  preview
    ? params.get("tv")
    : localStorage.getItem("tvId");


// =========================
// ESTADO
// =========================

let heartbeatInterval = null;
let polling = null;

let playlistIndex = 0;
let playlistTimer = null;

let playlistAtual = [];
let playlistVersaoAtual = 0;

let playlistHash = "";

let itemInicio = null;

let playbackSyncInterval = null;

let previewInicializado = false;


// =========================
// DOM
// =========================

const frame =
  document.getElementById("frame");

const content =
  document.getElementById("content");


// =========================
// YOUTUBE
// =========================

function normalizarYoutube(src) {

  try {

    let url = new URL(src);

    if (!url.hostname.includes("youtube")) {
      return src;
    }

    if (
      url.pathname === "/watch" ||
      url.pathname === "/watch/"
    ) {

      url.searchParams.set(
        "autoplay",
        "1"
      );

      url.searchParams.set(
        "mute",
        "1"
      );

      return url.toString();

    }

    if (!url.pathname.includes("/embed/")) {

      const id =
        url.searchParams.get("v");

      if (id) {

        url =
          new URL(
            `https://www.youtube.com/embed/${id}`
          );

      }

    }

    url.searchParams.set(
      "autoplay",
      "1"
    );

    url.searchParams.set(
      "mute",
      "1"
    );

    url.searchParams.set(
      "playsinline",
      "1"
    );

    url.searchParams.set(
      "rel",
      "0"
    );

    return url.toString();

  } catch {

    return src;

  }

}


// =========================
// DURAÇÃO
// =========================

function getTempoItem(item) {

  return (
    Number(
      item?.duracao ||
      item?.intervalo ||
      10
    ) || 10
  ) * 1000;

}


// =========================
// ID DO ITEM
// =========================

function obterIdItem(item) {

  return (

    item?.id ||

    item?.iframe ||

    item?.conteudo ||

    item?.src ||

    item?.titulo ||

    JSON.stringify(item)

  );

}


// =========================
// RENDER
// =========================

async function render(item) {

  if (!item) {
    return;
  }


  // =========================
  // VÍDEO
  // =========================

  if (item.iframe) {

    frame.style.display =
      "block";

    content.style.display =
      "none";

    const src =
      normalizarYoutube(
        item.iframe
      );

    if (frame.src !== src) {

      frame.src = src;

    }

    return;

  }


  // =========================
  // CONTEÚDO NORMAL
  // =========================

  frame.style.display =
    "none";

  content.style.display =
    "block";


  switch (item.tipo) {

    case "texto":

      content.innerHTML = `

        <div class="aviso">

          <fieldset
            class="field-texto"
          >

            <legend>

              <img
                src="/layouts/logo-ifsc.png"
                class="warning-image"
              >

            </legend>

            ${item.conteudo}

          </fieldset>

        </div>

      `;

      break;


    case "canva":

      content.innerHTML = `

        <iframe

          src="${item.conteudo}"

          style="
            width:100vw;
            height:100vh;
            border:none;
          "

          allowfullscreen

          allow="
            autoplay;
            fullscreen
          "

        ></iframe>

      `;

      break;


    case "link":

      content.innerHTML = `

        <iframe

          src="${item.conteudo}"

          style="
            width:100vw;
            height:100vh;
            border:none;
          "

        ></iframe>

      `;

      break;


    case "pdf":

      content.innerHTML = `

        <iframe

          src="${item.conteudo}"

          style="
            width:100vw;
            height:100vh;
            border:none;
          "

        ></iframe>

      `;

      break;


    case "imagem":

      content.innerHTML = `

        <img

          src="${item.conteudo}"

          style="
            width:100vw;
            height:100vh;
            object-fit:contain;
          "

        >

      `;

      break;


    case "mapa":

      content.innerHTML = `

        <img

          src="${item.src}"

          class="imagemViewer"

        >

      `;

      break;


    case "calendario":

      content.innerHTML = `

        <iframe

          src="${item.src}"

          style="
            width:100vw;
            height:100vh;
            border:none;
          "

        ></iframe>

      `;

      break;


    case "ensalamento": {

      const dia =
        Number(item.dia);

      const src =
        `/playlists/verEnsalamento.html?dia=${dia}`;

      content.innerHTML = `

        <iframe

          src="${src}"

          style="
            width:100vw;
            height:100vh;
            border:none;
          "

        ></iframe>

      `;

      break;

    }


    default:

      content.innerHTML = `

        <div

          style="
            width:100vw;
            height:100vh;
            display:flex;
            justify-content:center;
            align-items:center;
            font-size:40px;
          "

        >

          Conteúdo não suportado

        </div>

      `;

  }

}


// =========================
// REGISTRO
// =========================

async function registrar() {

  if (preview) {
    return;
  }

  try {

    const res =
      await fetch(
        "/register",
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              tv: tvId
            })

        }
      );


    const data =
      await res.json();


    tvId =
      data.tv;


    localStorage.setItem(
      "tvId",
      tvId
    );


    iniciarHeartbeat();

    await ping();

  } catch (erro) {

    console.error(
      "Erro register:",
      erro
    );

  }

}


// =========================
// PING
// =========================

async function ping() {

  if (preview) {
    return;
  }

  try {

    await fetch(
      "/ping",
      {

        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            tv: tvId
          }),

        keepalive: true

      }
    );

  } catch (erro) {

    console.error(
      "Erro ping:",
      erro
    );

  }

}


// =========================
// HEARTBEAT
// =========================

function iniciarHeartbeat() {

  if (preview) {
    return;
  }

  if (heartbeatInterval) {

    clearInterval(
      heartbeatInterval
    );

  }

  heartbeatInterval =
    setInterval(
      ping,
      30000
    );

}


// =========================
// UNREGISTER
// =========================

function desligar() {

  if (preview) {
    return;
  }

  if (!tvId) {
    return;
  }

  const params =
    new URLSearchParams();

  params.append(
    "tv",
    tvId
  );

  navigator.sendBeacon(
    "/unregister",
    params
  );

}


window.addEventListener(
  "beforeunload",
  desligar
);


// =========================
// ENVIAR PLAYBACK
// =========================

async function sincronizarPlayback() {

  if (preview) {
    return;
  }

  if (!tvId) {
    return;
  }

  if (!playlistAtual.length) {
    return;
  }

  const item =
    playlistAtual[
      playlistIndex
    ];

  if (!item) {
    return;
  }

  try {

    await fetch(
      "/playback",
      {

        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({

            tv:
              tvId,

            playlistVersao:
              playlistVersaoAtual,

            playlistIndex:
              playlistIndex,

            itemId:
              obterIdItem(item),

            itemInicio:
              itemInicio,

            itemDuracao:
              getTempoItem(item) / 1000

          })

      }
    );

  } catch (erro) {

    console.error(
      "Erro ao sincronizar playback:",
      erro
    );

  }

}


function iniciarSincronizacaoPlayback() {

  if (preview) {
    return;
  }

  if (playbackSyncInterval) {

    clearInterval(
      playbackSyncInterval
    );

  }

  playbackSyncInterval =
    setInterval(
      sincronizarPlayback,
      1000
    );

}


// =========================
// OBTER PLAYBACK
// =========================

async function obterPlaybackAtual() {

  if (!preview) {
    return null;
  }

  try {

    const res =
      await fetch(
        `/playback/${encodeURIComponent(tvId)}`,
        {
          cache:
            "no-store"
        }
      );


    if (!res.ok) {
      return null;
    }


    const playback =
      await res.json();


    if (
      !playback.sincronizado
    ) {

      return null;

    }


    return playback;

  } catch (erro) {

    console.error(
      "Erro ao obter playback:",
      erro
    );

    return null;

  }

}


// =========================
// TOCAR PLAYLIST
// =========================

async function tocarPlaylist(
  indiceInicial = 0,
  inicioSincronizado = null
) {

  if (
    !playlistAtual.length
  ) {

    content.innerHTML = `

      <div class="sem-conteudo">

        Nenhum conteúdo na playlist

      </div>

    `;

    return;

  }


  playlistIndex =
    indiceInicial;


  if (
    playlistIndex < 0 ||
    playlistIndex >=
      playlistAtual.length
  ) {

    playlistIndex = 0;

  }


  const item =
    playlistAtual[
      playlistIndex
    ];


  if (!item) {
    return;
  }


  if (inicioSincronizado) {

    itemInicio =
      inicioSincronizado;

  } else {

    itemInicio =
      Date.now();

  }


  await render(item);


  const duracao =
    getTempoItem(item);


  let tempoRestante =
    duracao;


  if (inicioSincronizado) {

    const decorrido =
      Date.now() -
      inicioSincronizado;


    tempoRestante =
      duracao -
      decorrido;

  }


  if (
    tempoRestante <= 0
  ) {

    playlistIndex++;

    if (
      playlistIndex >=
      playlistAtual.length
    ) {

      playlistIndex = 0;

    }


    tocarPlaylist();

    return;

  }


  clearTimeout(
    playlistTimer
  );


  playlistTimer =
    setTimeout(
      () => {

        playlistIndex++;

        if (
          playlistIndex >=
          playlistAtual.length
        ) {

          playlistIndex = 0;

        }

        tocarPlaylist();

      },

      tempoRestante

    );

}


// =========================
// CARREGAR PLAYLIST
// =========================

async function carregar() {

  try {

    const res =
      await fetch(
        `/playlist-tv/${encodeURIComponent(tvId)}`,
        {
          cache:
            "no-store"
        }
      );


    if (!res.ok) {
      return;
    }


    const dados =
      await res.json();


    const novaPlaylist =
      Array.isArray(dados)
        ? dados
        : dados.items || [];


    const novaVersao =
      Array.isArray(dados)
        ? 0
        : Number(
            dados.versao
          ) || 0;


    const novoHash =
      JSON.stringify(
        novaPlaylist
      );


    const playlistMudou =
      novoHash !==
      playlistHash;


    const versaoMudou =
      novaVersao !==
      playlistVersaoAtual;


    if (
      !playlistMudou &&
      !versaoMudou
    ) {

      return;

    }


    console.log(
      "Playlist alterada:",
      tvId
    );


    playlistHash =
      novoHash;


    playlistAtual =
      novaPlaylist;


    playlistVersaoAtual =
      novaVersao;


    clearTimeout(
      playlistTimer
    );


    playlistTimer =
      null;


    // =========================
    // PREVIEW
    // =========================

    if (preview) {

      const playback =
        await obterPlaybackAtual();


      if (
        playback &&
        Number(
          playback.playlistVersao
        ) ===
        playlistVersaoAtual
      ) {

        const indice =
          Number(
            playback.playlistIndex
          );


        if (
          indice >= 0 &&
          indice <
            playlistAtual.length
        ) {

          const item =
            playlistAtual[
              indice
            ];


          if (
            obterIdItem(item) ===
            playback.itemId
          ) {

            console.log(
              "Preview sincronizado com TV"
            );


            previewInicializado =
              true;


            await tocarPlaylist(
              indice,
              playback.itemInicio
            );


            return;

          }

        }

      }


      // Não foi possível sincronizar
      // começa do início

      previewInicializado =
        true;


      await tocarPlaylist(
        0,
        null
      );


      return;

    }


    // =========================
    // TV REAL
    // =========================

    await tocarPlaylist(
      0,
      null
    );


  } catch (erro) {

    console.error(
      "Erro ao carregar playlist:",
      erro
    );

  }

}


// =========================
// INIT
// =========================

async function iniciar() {

  if (!preview) {

    await registrar();

    iniciarSincronizacaoPlayback();

  }


  await carregar();


  if (!polling) {

    polling =
      setInterval(
        carregar,
        1000
      );

  }

}


iniciar();
