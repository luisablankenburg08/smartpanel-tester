const multer = require("multer");
const path = require("path");
const express = require("express");
const fs = require("fs");
const session = require("express-session");

const app = express();

// DIRETÓRIOS PRINCIPAIS
const SERVER_DIR = __dirname;
const ROOT_DIR = path.resolve(__dirname, "..");
const UPLOADS_DIR = path.join(ROOT_DIR, "uploads");
const JSON_DIR = path.join(ROOT_DIR, "json");
const PLAYLISTS_DIR = path.join(ROOT_DIR, "playlists");
const LOGIN_DIR = path.join(SERVER_DIR, "login");

// ARQUIVOS JSON
const PLAYLIST_FILE = path.join(
  JSON_DIR,
  "playlists-tester.json"
);

const STATE_FILE = path.join(
  JSON_DIR,
  "state.json"
);

// GARANTIR DIRETÓRIO DE UPLOADS
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, {
    recursive: true
  });
}

// ESTADO DAS TVs
const tvHeartbeats = new Map();
const viewerPlayback = new Map();
const playlistVersao = new Map();

app.use("/login", express.static(LOGIN_DIR))

//AUTENTICAÇÃO
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: "segredo_super_forte",
    resave: false,
    saveUninitialized: false
}));

//USAR UPLOADS
app.use("/uploads", express.static(UPLOADS_DIR));

if (!fs.existsSync(STATE_FILE)) { fs.writeFileSync(STATE_FILE, "{}") }

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },

  filename: (req, file, cb) => {
    cb(
      null,
      Date.now() + path.extname(file.originalname)
    );
  }
});

const upload = multer({storage});

//==================
// FUNÇÕES
//==================

// LER PLAYLISTS
function readPlaylists(){
  try{
    return JSON.parse(fs.readFileSync(PLAYLIST_FILE));
  }catch{
    return {};
  }
}

// LER ESTADO
function readState(){
    return JSON.parse(fs.readFileSync(STATE_FILE));
}

// SALVAR ESTADO
function saveState(state){
    fs.writeFileSync(
        STATE_FILE,
        JSON.stringify(state,null,2)
    );
}

// REMOVER TV DO JSON
function removerTV(tvId) {
  try {
    let state = readState();
    if (state[tvId]) {
      delete state[tvId];
      saveState(state);
      tvHeartbeats.delete(tvId);
      viewerPlayback.delete(tvId);
      console.log(`❌ TV ${tvId} removida`);
    }
  } catch (e) {
    console.error(`Erro ao remover TV ${tvId}:`, e);
  }
}

// MIGRAÇÃO PARA NOVO JSON (UMA VEZ)
function migrarPlaylists() {

  const playlists = readPlaylists();

  if (!playlists.tvPlaylists) {
    return;
  }

  let alterado = false;

  Object.keys(playlists.tvPlaylists).forEach(tv => {

    const atual = playlists.tvPlaylists[tv];

    if (Array.isArray(atual)) {
      playlists.tvPlaylists[tv] = {
        items: atual,
        versao: Date.now()
      };
      alterado = true;
      return;
    }

    if (!Array.isArray(atual.items)) {
      atual.items = [];
      alterado = true;
    }

    if (!atual.versao) {
      atual.versao = Date.now();
      alterado = true;
    }
  });

  if (alterado) {
    savePlaylists(playlists);
    console.log("Playlists migradas para novo formato");
  }
}

// SALVAR PLAYLISTS
function savePlaylists(data){
  fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(data, null, 2));
}

// NOVOS VÍDEOS
function extrairIdDoIframe(iframe) {
  try {
    let url = new URL(iframe);
    return url.pathname.split("/embed/")[1]?.split("?")[0];
  } catch {
    return null;
  }
}

function isVideoItem(item) {
  return !!(
    item?.iframe ||
    item?.id ||
    item?.thumb ||
    item?.live ||
    item?.tipo === "videos" ||
    item?.type === "videos"
  );
}

function normalizeItemKey(item) {
  return item?.id || item?.iframe || item?.url || item?.texto || item?.titulo || JSON.stringify(item);
}

function getAllVideoItems(playlists) {
  const items = [];

  if (playlists.conteudos && Array.isArray(playlists.conteudos.videos)) {
    items.push(...playlists.conteudos.videos);
  }

  if (playlists.conteudos && Array.isArray(playlists.conteudos.padrao)) {
    items.push(...playlists.conteudos.padrao.filter(isVideoItem));
  }

  if (Array.isArray(playlists.videosCustomizados)) {
    items.push(...playlists.videosCustomizados);
  }

  const seen = new Set();
  return items.filter(item => {
    const key = normalizeItemKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getAllAvisoItems(playlists){

  const items = [];

  if(Array.isArray(playlists.avisosCustomizados)){
    items.push(...playlists.avisosCustomizados);
  }

  if(playlists.conteudos &&
    Array.isArray(playlists.conteudos.avisos)){
    items.push(...playlists.conteudos.avisos);
  }

  return items;
}

setInterval(() => {
  const agora = Date.now()
  const timeout = 3000000

  for (const [tvId, ultimoHeartbeat] of tvHeartbeats.entries()) {
    if (agora - ultimoHeartbeat > timeout) {
      console.log(`⏱️ Timeout ${tvId}`)
      removerTV(tvId)
    }
  }
}, 10000)

//==================
// AUTENTICAÇÃO
//==================

app.post("/login", (req, res) => {

    const { username, password } = req.body;
    console.log("LOGIN", username, password);

    if (username === "smartPanel" && password === "sdppLuisa26") {
        req.session.authenticated = true;
        console.log(req.session);
        req.session.save(() => {res.json({ success: true }); });
    } else {
        res.json({ success: false });
      }

});

// servir páginas e assets do painel
app.get("/controller-tester.html", verificarAuth, (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "controller-tester.html"));
});

app.get("/viewer-tester.html", (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "viewer-tester.html"));
});

app.get(["/controller-tester.css", "/viewer-tester.css"], (req, res) => {
  res.sendFile(path.join(ROOT_DIR, req.path.replace(/^\//, "")));
});

app.get(["/controller-tester.js", "/viewer-tester.js"], (req, res) => {
  res.sendFile(path.join(ROOT_DIR, req.path.replace(/^\//, "")));
});

app.get("/login", (req, res) => {
  res.redirect("/login/login.html")
});

// middleware de proteção
function verificarAuth(req, res, next) {

  if (req.session && req.session.authenticated) {
    next();
  } else {
    res.redirect("/login/login.html");
  }
}

app.use(express.static(ROOT_DIR))

//==================
// ROTAS
//==================

// ADICIONAR ÀS PLAYLISTS
app.post("/playlist/add", verificarAuth, (req, res) => {
  const { tv, items } = req.body;

  if (!tv || !Array.isArray(items)) {
    return res.status(400).json({
      erro: "TV ou itens inválidos"
    });
  }

  let playlists = readPlaylists();

  if (!playlists.tvPlaylists) {
    playlists.tvPlaylists = {};
  }

  if (!playlists.tvPlaylists[tv]) {
    playlists.tvPlaylists[tv] = {
      items: []
    };
  }

  if (!Array.isArray(playlists.tvPlaylists[tv].items)) {
    playlists.tvPlaylists[tv].items = [];
  }

  playlists.tvPlaylists[tv].items.push(...items);
  const novaVersao = Date.now();
  playlists.tvPlaylists[tv].versao = novaVersao;
  savePlaylists(playlists);
  playlistVersao.set(tv, novaVersao);
  viewerPlayback.delete(tv);

  let state = readState();

  if (state[tv]) {
    state[tv].refresh = Date.now();
    saveState(state);
  }

  res.json({
    ok: true,
    versao: novaVersao
  });

});

// IDENTIFICAR PLAYLIST ATUAL DE CADA TV 
app.get("/playlist-tv/:tv", (req, res) => {

  const tv = req.params.tv;
  const playlists = readPlaylists();
  const dadosTV = playlists.tvPlaylists?.[tv];

  if (!dadosTV) {
    return res.json({
      versao: 0,
      items: []
    });
  }

  if (Array.isArray(dadosTV)) {
    return res.json({
      versao: playlistVersao.get(tv) || 0,
      items: dadosTV
    });
  }

  res.json({
    versao: playlistVersao.get(tv) || dadosTV.versao || 0,
    items: Array.isArray(dadosTV.items)
      ? dadosTV.items
      : []
  });
});

// REORDENAR PLAYLIST ATUAL
app.post("/playlist/reorder", verificarAuth, (req, res) => {
  const { tv, items } = req.body;

  if (!tv || !Array.isArray(items)) {
    return res.status(400).json({
      erro: "Dados inválidos"
    });
  }
  try {
    const playlists = readPlaylists();
    if (!playlists.tvPlaylists) {
      playlists.tvPlaylists = {};
    }

    if (!playlists.tvPlaylists[tv]) {
      playlists.tvPlaylists[tv] = {
        items: []
      };
    }

    const novaVersao = Date.now();
    playlists.tvPlaylists[tv].items = items;
    playlists.tvPlaylists[tv].versao = novaVersao;
    savePlaylists(playlists);
    playlistVersao.set(tv, novaVersao);
    viewerPlayback.delete(tv);

    const state = readState();

    if (state[tv]) {
      state[tv].refresh = Date.now();
      saveState(state);
    }

    res.json({
      ok: true,
      versao: novaVersao
    });

  } catch (erro) {
    console.error(
      "Erro ao salvar playlist:",
      erro
    );

    res.status(500).json({
      erro: "Falha ao salvar playlist"
    });
  }
});

// REGISTRO DE TVS
app.post("/register", (req, res) => {

  let { tv } = req.body
  let state = readState();

  const HEARTBEAT_TIMEOUT = 30000; // ms

  if (tv) {
    // If TV id exists and has a recent heartbeat, treat it as in-use and assign a new id
    const last = tvHeartbeats.get(tv);
    if (state[tv] && last && (Date.now() - last) < HEARTBEAT_TIMEOUT) {
      console.log(`TV id ${tv} is active; issuing a new id for this connection`);
      tv = null; // force creation of a new id below
    }
  }

  if (tv) {
    if (!state[tv]) {
      state[tv] = {
        status: "ativa"
      }
      saveState(state)
    }

    tvHeartbeats.set(tv, Date.now())
    return res.json({ tv })
  }

  let numero = 1
  while (state[`tv${numero}`]) numero++

  let newTv = `tv${numero}`

  state[newTv] = {
    status: "ativa"
  }

  saveState(state)
  tvHeartbeats.set(newTv, Date.now())

  res.json({ tv: newTv })
})

// UPDATE 
app.post("/update", verificarAuth, (req, res) => {

  let { tv, pagina, intervalo } = req.body
  let state = readState();

  if (!state[tv]) {
    return res.status(404).send("TV não encontrada")
  }

  if (typeof state[tv] === "string") {
    state[tv] = {
      pagina: state[tv],
      intervalo: 2000,
      refresh: Date.now()
     }
  }

  state[tv] = {
  pagina: pagina ?? state[tv].pagina,
  intervalo: intervalo ?? state[tv].intervalo,
  refresh: Date.now()
}

  saveState(state)

  res.json({ status: "ok" })
})

// STATE
app.get("/state", (req, res) => {
  let state = readState();
  res.json(state)
})

// HEARTBEAT
app.post("/ping", (req, res) => {
  const { tv } = req.body

  if (tv) {
    tvHeartbeats.set(tv, Date.now())
    res.json({ status: "ok" })
  } else {
    res.status(400).json({ status: "error" })
  }
})

// UNREGISTER
app.post("/unregister", (req, res) => {
  const { tv } = req.body

  if (tv) {
    removerTV(tv)
    res.json({ status: "ok" })
  } else {
    res.status(400).json({ status: "error" })
  }
})

//API DO YOUTUBE PARA DURAÇÃO DO VÍDEO
const { Innertube } = require("youtubei.js");
let yt = null;
async function getYoutube() {
  if (!yt) {
    yt = await Innertube.create();
  }
  return yt;
}

async function obterInformacoesVideo(videoId) {
  const youtube = await getYoutube();
  const info = await youtube.getInfo(videoId);

  return {
    titulo: info.basic_info.title,
    duracao: Number(info.basic_info.duration),
    thumb: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    live: info.basic_info.is_live
  };
}

// ADICIONAR VÍDEO
app.post("/videos", verificarAuth, async (req, res) => {
  console.log("adição chegando")
  const { titulo, iframe } = req.body;
  const videoId = extrairIdDoIframe(iframe);
  const dados = await obterInformacoesVideo(videoId);
  let playlists = readPlaylists();

  if (!iframe) {
    return res.status(400).json({ erro: "Iframe obrigatório" });
  }

  if (!playlists.videosCustomizados) {
    playlists.videosCustomizados = [];
  }

  let existe = playlists.videosCustomizados.find(v => v.id === videoId);

  if (existe) {
    return res.status(400).json({ erro: "Vídeo já existe" });
  }

  const novoVideo = {
    id: videoId,
    titulo: titulo || dados.titulo,
    iframe,
    thumb: dados.thumb,
    duracao: dados.live ? 9999999 : dados.duracao,
    live: dados.live
  };

  playlists.videosCustomizados.push(novoVideo);

  savePlaylists(playlists);

  res.json({ ok: true });
  console.log("adição concluída")
});

// LISTAR VÍDEOS
app.get("/videos", verificarAuth, (req, res) => {

  let playlists = readPlaylists();
  let videos = getAllVideoItems(playlists);
  res.json(videos);
});

// DELETAR VÍDEO
app.delete("/videos/:id", (req, res) => {

    const id = req.params.id;

    let playlists = readPlaylists();

    playlists.videosCustomizados = playlists.videosCustomizados.filter(v => v.id !== id);

    savePlaylists(playlists);

    res.json({ ok: true });

});

// EDITAR VÍDEO
app.put("/videos/:id", verificarAuth, (req, res) => {

  const { id } = req.params;
  const { titulo, duracao } = req.body;

  let playlists = readPlaylists();

  if (!playlists.videosCustomizados) {
    return res.status(404).json({
      erro: "Nenhum vídeo cadastrado"
    });
  }

  const video = playlists.videosCustomizados.find(v => v.id === id);

  if (!video) {
    return res.status(404).json({
      erro: "Vídeo não encontrado"
    });
  }

  if (titulo !== undefined) {
    video.titulo = titulo;
  }

  if (duracao !== undefined) {
    video.duracao = duracao;
  }

  savePlaylists(playlists);

  res.json({
    ok: true,
    video
  });

});

// LISTAR AVISOS
app.get("/avisos", verificarAuth, (req,res)=>{
  const playlists = readPlaylists();
  res.json(getAllAvisoItems(playlists));
});

// ADICIONAR AVISO 
app.post("/avisos", verificarAuth, upload.single("arquivo"), (req, res) => {

  let playlists = readPlaylists();

  if (!playlists.avisosCustomizados) {
    playlists.avisosCustomizados = [];
  }

  const aviso = {
    id: Date.now().toString(),
    titulo: req.body.titulo,
    tipo: req.body.tipo,
    conteudo: req.body.conteudo,
    duracao: Number(req.body.duracao) || 15
  };

  if (req.file) {
    aviso.conteudo = "/uploads/" + req.file.filename;

    const ext = path.extname(req.file.originalname).toLowerCase();

    aviso.tipo = ext === ".pdf"
      ? "pdf"
      : "imagem";
  }

  playlists.avisosCustomizados.push(aviso);

  savePlaylists(playlists);

  res.json({
    ok: true,
    aviso
  });
});

// EDITAR AVISOS
app.put("/avisos/:id", verificarAuth, upload.single("arquivo"), (req,res)=>{
  const playlists = readPlaylists();
  const aviso = playlists.avisosCustomizados.find(
    a => a.id === req.params.id
  );

  if(!aviso){
    return res.status(404).json({
      erro:"Aviso não encontrado"
    });
  }

  aviso.titulo=req.body.titulo;
  aviso.tipo=req.body.tipo;
  aviso.conteudo=req.body.conteudo;
  aviso.duracao=Number(req.body.duracao)||15;

  if(req.file){
      aviso.conteudo="/uploads/"+req.file.filename;
      const ext=path.extname(req.file.originalname).toLowerCase();

      aviso.tipo=(ext==".pdf")
        ?"pdf"
        :"imagem";
  }
  savePlaylists(playlists);
  res.json({ok:true});
});

//EXCLUIR AVISOS
app.delete("/avisos/:id", verificarAuth, (req,res)=>{

    const playlists = readPlaylists();

    playlists.avisosCustomizados = playlists.avisosCustomizados.filter(
      a => a.id !== req.params.id
    );

    savePlaylists(playlists);
    res.json({ok:true});

});

// PLAYLIST
app.get("/playlist", (req,res)=>{

  let { type, tv } = req.query;
  let playlists = readPlaylists();
  let items = [];

  // Se TV foi especificada, retorna a playlist salva para essa TV
  if (tv && playlists.tvPlaylists && playlists.tvPlaylists[tv] && Array.isArray(playlists.tvPlaylists[tv][type])) {
    items = [...playlists.tvPlaylists[tv][type]];
  }
  // Caso contrário, retorna todos os conteúdos disponíveis desse tipo
  else {
    if (type === "videos") {
      items = getAllVideoItems(playlists);
    } else if (type === "avisos") {
      items = getAllAvisoItems(playlists);
    } else if (playlists.conteudos && Array.isArray(playlists.conteudos[type])) {
      items = [...playlists.conteudos[type]];
    }
  }
  res.json(items);
});

// ADICIONAR / ALTERAR MAPA
app.post("/mapa", verificarAuth, upload.single("mapa"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      erro: "Arquivo não enviado"
    });
  }

  const src = "/uploads/" + req.file.filename;
  const playlists = readPlaylists();

  if (!Array.isArray(playlists.mapa)) {
    playlists.mapa = [];
  }

  const mapaExistente = playlists.mapa.find(item => item.id === "mapa");

  if (mapaExistente && mapaExistente.src && mapaExistente.src.startsWith("/uploads/")) {
    const arquivoAntigo = path.join(UPLOADS_DIR, path.basename(mapaExistente.src));

    if (fs.existsSync(arquivoAntigo)) {
      try {
        fs.unlinkSync(arquivoAntigo);
      } catch (erro) {
        console.warn(
          "Não foi possível remover o mapa antigo:",
          erro.message
        );
      }
    }
  }

  if (mapaExistente) {
    mapaExistente.src = src;
  } else {
    playlists.mapa.push({
      id: "mapa",
      tipo: "mapa",
      titulo: "Mapa do Campus",
      src,
      duracao: 30
    });
  }
  savePlaylists(playlists);
  res.json({ok: true, src});
});

// CARREGAR MAPA
app.get("/mapa", (req, res) => {
  const playlists = readPlaylists();
  const mapa = Array.isArray(playlists.mapa)
    ? playlists.mapa.find(item => item.id === "mapa")
    : null;

  res.json({src: mapa?.src || "/playlists/mapa-floripa.jpg"});
});

//LISTAR PLAYLISTS SALVAS
app.get("/playlists-salvas", (req, res) => {
  const playlists = readPlaylists();
  res.json(playlists.playlistsSalvas || []);
});

//CRIAR NOVAS PLAYLISTS
app.post("/playlists-salvas", verificarAuth, (req, res) => {

  const { titulo, items } = req.body;

  if (!titulo) {
    return res.status(400).json({
      erro: "Título obrigatório"
    });
  }

  const playlists = readPlaylists();

  if (!playlists.playlistsSalvas) {
    playlists.playlistsSalvas = [];
  }

  const novaPlaylist = {
    id: Date.now().toString(),
    titulo,
    items: Array.isArray(items) ? items : []
  };

  playlists.playlistsSalvas.push(
    novaPlaylist
  );

  savePlaylists(playlists);
  res.json({ok: true,playlist: novaPlaylist});
});

//EDITAR PLAYLISTS PRONTAS
app.put("/playlists-salvas/:id", verificarAuth, (req, res) => {

  const playlists = readPlaylists();

  const playlist =
    playlists.playlistsSalvas.find(
      p => p.id === req.params.id
    );

  if (!playlist) {
    return res.status(404).json({
      erro: "Playlist não encontrada"
    });
  }

  playlist.titulo = req.body.titulo;
  playlist.items = Array.isArray(req.body.items) ? req.body.items : [];
  savePlaylists(playlists);
  res.json({ok: true});
});

//EXCLUIR PLAYLISTS PRONTAS
app.delete("/playlists-salvas/:id", verificarAuth, (req, res) => {
  const playlists = readPlaylists();
  playlists.playlistsSalvas =
    playlists.playlistsSalvas.filter(
      p => p.id !== req.params.id
    );

  savePlaylists(playlists);
  res.json({ok: true});
});

//APLICAR PLAYLISTS PRONTAS
app.post("/playlist/aplicar", verificarAuth, (req, res) => {
  const { tv, playlistId } = req.body;
  const playlists = readPlaylists();
  const state = readState();
  const playlist =
    playlists.playlistsSalvas.find(
      p => p.id === playlistId
    );

  if (!playlist) {
    return res.status(404).json({
      erro: "Playlist não encontrada"
    });
  }

  if (!playlists.tvPlaylists) {
    playlists.tvPlaylists = {};
  }

  playlists.tvPlaylists[tv] = {
    playlistId,
    titulo: playlist.titulo,
    items: structuredClone(playlist.items)
  };

  state[tv].refresh = Date.now();
  savePlaylists(playlists);
  playlistVersao.set(tv, Date.now());

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(state, null, 2)
  );

  res.json({ok: true});
});

// LISTAR CONTEÚDOS DISPONÍVEIS
app.get("/conteudos", (req, res) => {
  const playlists = readPlaylists();
  const conteudos = [];

  conteudos.push(
    ...getAllVideoItems(playlists)
  );

  conteudos.push(
    ...getAllAvisoItems(playlists)
  );


  if (Array.isArray(playlists.mapa)) {
    const mapa = playlists.mapa.find(item => item.id === "mapa");
    if (mapa) {
      conteudos.push({
        id: mapa.id,
        tipo: "mapa",
        titulo: mapa.titulo,
        src: mapa.src,
        duracao: mapa.duracao || 30
      });
    }
  }


    if (playlists.calendario) {
      conteudos.push({
        id: "calendario",
        tipo: "calendario",
        titulo: "Calendário",
        conteudo: playlists.calendario,
        duracao: 30
      });
    }

     const ensalamentos = [
    {
      id: "ensalamento-segunda",
      tipo: "ensalamento",
      titulo: "Ensalamento: Segunda-feira",
      dia: 0,
      duracao: 30,
      src: "/playlists/verEnsalamento.html?dia=0"
    },
    {
      id: "ensalamento-terca",
      tipo: "ensalamento",
      titulo: "Ensalamento: Terça-feira",
      dia: 1,
      duracao: 30,
      src: "/playlists/verEnsalamento.html?dia=1"
    },
    {
      id: "ensalamento-quarta",
      tipo: "ensalamento",
      titulo: "Ensalamento: Quarta-feira",
      dia: 2,
      duracao: 30,
      src: "/playlists/verEnsalamento.html?dia=2"
    },
    {
      id: "ensalamento-quinta",
      tipo: "ensalamento",
      titulo: "Ensalamento: Quinta-feira",
      dia: 3,
      duracao: 30,
      src: "/playlists/verEnsalamento.html?dia=3"
    },
    {
      id: "ensalamento-sexta",
      tipo: "ensalamento",
      titulo: "Ensalamento: Sexta-feira",
      dia: 4,
      duracao: 30,
      src: "/playlists/verEnsalamento.html?dia=4"
    }
  ];
    conteudos.push(...ensalamentos);
    res.json(conteudos);
});

// ATUALIZAR POSIÇÃO DE REPRODUÇÃO
app.post("/playback", (req, res) => {

  const {
    tv,
    playlistVersao,
    playlistIndex,
    itemId,
    itemInicio,
    itemDuracao
  } = req.body;

  if (!tv) {
    return res.status(400).json({
      erro: "TV não informada"
    });
  }

  viewerPlayback.set(tv, {
    playlistVersao: Number(playlistVersao) || 0,
    playlistIndex: Number(playlistIndex) || 0,
    itemId: itemId || null,
    itemInicio: Number(itemInicio) || Date.now(),
    itemDuracao: Number(itemDuracao) || 10,
    atualizadoEm: Date.now()
  });
  res.json({ok: true});
});

// CONSULTAR POSIÇÃO DE REPRODUÇÃO
app.get("/playback/:tv", (req, res) => {
  const tv = req.params.tv;
  const playback = viewerPlayback.get(tv);

  if (!playback) {
    return res.json({
      sincronizado: false
    });
  }

  res.json({
    sincronizado: true,
    ...playback
  });
});

// SAVE PLAYLIST 
app.post("/save-playlist", verificarAuth, (req, res) => {

  const { tv, items } = req.body;

  if (!tv) {
    return res.status(400).json({
      erro: "TV não informada"
    });
  }

  let playlists = readPlaylists();

  if (!playlists.tvPlaylists) {
    playlists.tvPlaylists = {};
  }

  if (!playlists.tvPlaylists[tv]) {
    playlists.tvPlaylists[tv] = {
      items: []
    };
  }

  const novaVersao = Date.now();

  playlists.tvPlaylists[tv].items =
    Array.isArray(items)
      ? items
      : [];

  playlists.tvPlaylists[tv].versao = novaVersao;
  savePlaylists(playlists);
  playlistVersao.set(tv, novaVersao);
  viewerPlayback.delete(tv);
  const state = readState();

  if (state[tv]) {
    state[tv].refresh = Date.now();
    saveState(state);
  }

  res.json({
    ok: true,
    versao: novaVersao
  });
});

// UPDATE ALL 
app.post("/update-all", verificarAuth, (req, res) => {

  const { items } = req.body;

  let state = readState();
  let playlists = readPlaylists();

  if (!playlists.tvPlaylists) {
    playlists.tvPlaylists = {};
  }

  Object.keys(state).forEach(tv => {

    if (!playlists.tvPlaylists[tv]) {
      playlists.tvPlaylists[tv] = {
        items:[]
      };
    }

    const { type, items } = req.body;

    if (!playlists.tvPlaylists[tv][type]) {
        playlists.tvPlaylists[tv][type] = [];
    }

    playlists.tvPlaylists[tv][type].push(...items);

    state[tv].refresh = Date.now();
  });

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(state, null, 2)
  );

  savePlaylists(playlists);
  res.json({ ok:true });
});

migrarPlaylists();

app.listen(3005, "0.0.0.0", () => {
  console.log("Servidor rodando")
})
