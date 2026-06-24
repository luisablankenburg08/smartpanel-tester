const path = require("path")
const express = require("express")
const fs = require("fs")
const { randomUUID } = require("crypto")
const axios = require("axios");

const app = express()

const PLAYLIST_FILE = path.join("/home/pi/tester/json/playlists-tester.json");
const LOGIN_DIR = path.join(__dirname, "login")


app.use(express.json())
app.use(express.urlencoded({ extended: true }))

//==================
// AUTENTICATION
//==================
const session = require("express-session");

app.use(session({
    secret: "segredo_super_forte",
    resave: false,
    saveUninitialized: false 
}));

app.post("/login", (req, res) => {
    const { username, password } = req.body;

    if (username === "smartPanel" && password === "sdppLuisa26") {
        req.session.authenticated = true;
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// middleware de proteção
function verificarAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    next();
  } else {
    res.redirect("/login/login.html");
  }
}

// proteger controller (ANTES do static)
app.get("/controller-tester.html", verificarAuth, (req, res) => {
  res.sendFile("/home/pi/tester/controller-tester.html");
});

app.use("/login", express.static(LOGIN_DIR))
app.get("/login", (req, res) => {
  res.redirect("/login/login.html")
});

app.use(express.static("/home/pi/tester"))

const STATE_FILE = "/home/pi/tester/json/state.json"

if (!fs.existsSync(STATE_FILE)) {
  fs.writeFileSync(STATE_FILE, "{}")
}

const tvHeartbeats = new Map()

function removerTV(tvId) {
  try {
    let state = JSON.parse(fs.readFileSync(STATE_FILE))

    if (state[tvId]) {
      delete state[tvId]
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
      tvHeartbeats.delete(tvId)
      console.log(`❌ TV ${tvId} removida`)
    }
  } catch (e) {
    console.error(`Erro ao remover TV ${tvId}:`, e)
  }
}

setInterval(() => {
  const agora = Date.now()
  const timeout = 30000

  for (const [tvId, ultimoHeartbeat] of tvHeartbeats.entries()) {
    if (agora - ultimoHeartbeat > timeout) {
      console.log(`⏱️ Timeout ${tvId}`)
      removerTV(tvId)
    }
  }
}, 10000)

// LER PLAYLISTS
function readPlaylists(){
  try{
    return JSON.parse(fs.readFileSync(PLAYLIST_FILE));
  }catch{
    return {};
  }
}

function migrarPlaylists() {

  const playlists = readPlaylists();

  if (!playlists.tvPlaylists) {
    return;
  }

  let alterado = false;

  Object.keys(playlists.tvPlaylists).forEach(tv => {

    const atual =
      playlists.tvPlaylists[tv];

    // formato antigo:
    // tv1:[...]

    if (Array.isArray(atual)) {

      playlists.tvPlaylists[tv] = {
        items: atual
      };

      alterado = true;
    }

  });

  if (alterado) {

    fs.writeFileSync(
      PLAYLIST_FILE,
      JSON.stringify(playlists, null, 2)
    );

    console.log(
      "✅ Playlists migradas para novo formato"
    );
  }
}

// SALVAR PLAYLISTS
function savePlaylists(data){
  fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(data, null, 2));
}

// ADICIONAR ÀS PLAYLISTS
app.post("/playlist/add",(req,res)=>{

  const { tv, items } = req.body;
  const playlists = readPlaylists();

  if(!playlists.tvPlaylists){
    playlists.tvPlaylists = {};
  }

  if(!playlists.tvPlaylists[tv]){
    playlists.tvPlaylists[tv] = {
      items:[]
    };
  }

  playlists.tvPlaylists[tv].items.push(...items);

  savePlaylists(playlists);
  res.json({success:true});
});

// IDENTIFICAR PLAYLIST ATUAL DE CADA TV 
app.get("/playlist-tv/:tv", (req,res)=>{

  const playlists = readPlaylists();

  res.json(
    playlists.tvPlaylists?.[
      req.params.tv
    ]?.items || []
  );

});
// REORDENAR PLAYLIST ATUAL
app.post("/playlist/reorder", (req,res)=>{

  const { tv, items } = req.body;

  if(!tv || !Array.isArray(items)){
    return res.status(400).json({
      erro:"Dados inválidos"
    });
  }

  try{

    const playlists = readPlaylists();

    if(!playlists.tvPlaylists){
      playlists.tvPlaylists = {};
    }

    if(!playlists.tvPlaylists[tv]){
      playlists.tvPlaylists[tv] = {
        items:[]
      };
    }

    playlists.tvPlaylists[tv].items = items;

    fs.writeFileSync(
      PLAYLIST_FILE,
      JSON.stringify(
        playlists,
        null,
        2
      )
    );

    res.json({
      sucesso:true
    });

  }catch(err){

    console.error(
      "Erro ao salvar playlist:",
      err
    );

    res.status(500).json({
      erro:"Falha ao salvar playlist"
    });

  }

});

// REGISTRO
app.post("/register", (req, res) => {

  let { tv } = req.body
  let state = JSON.parse(fs.readFileSync(STATE_FILE))

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
        pagina: "layouts/tela2.html",
        intervalo: 2000
      }
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
    }

    tvHeartbeats.set(tv, Date.now())
    return res.json({ tv })
  }

  let numero = 1
  while (state[`tv${numero}`]) numero++

  let newTv = `tv${numero}`

  state[newTv] = {
    pagina: "layouts/tela2.html",
    intervalo: 2000
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
  tvHeartbeats.set(newTv, Date.now())

  res.json({ tv: newTv })
})

// UPDATE 🔒
app.post("/update", verificarAuth, (req, res) => {

  let { tv, pagina, intervalo } = req.body
  let state = JSON.parse(fs.readFileSync(STATE_FILE))

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

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))

  res.json({ status: "ok" })
})

// STATE
app.get("/state", (req, res) => {
  let state = JSON.parse(fs.readFileSync(STATE_FILE))
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

// ==================
// NOVOS VÍDEOS
// ==================
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

function getAllAvisoItems(playlists) {
  const items = [];

  if (playlists.conteudos && Array.isArray(playlists.conteudos.avisos)) {
    items.push(...playlists.conteudos.avisos);
  }

  if (playlists.conteudos && Array.isArray(playlists.conteudos.padrao)) {
    items.push(...playlists.conteudos.padrao.filter(item => !isVideoItem(item)));
  }

  const seen = new Set();
  return items.filter(item => {
    const key = normalizeItemKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ==================
// LISTAR VÍDEOS
// ==================
app.get("/videos", verificarAuth, (req, res) => {

  let playlists = readPlaylists();
  let videos = getAllVideoItems(playlists);
  res.json(videos);
});

// ==================
// ADICIONAR VÍDEO
// ==================
app.post("/videos", verificarAuth, (req, res) => {

  const { titulo, iframe, thumb, duracao, live } = req.body;

  if (!iframe) {
    return res.status(400).json({ erro: "Iframe obrigatório" });
  }

  const videoId = iframe.split("/embed/")[1]?.split("?")[0];

  let playlists = readPlaylists();

  if (!playlists.videosCustomizados) {
    playlists.videosCustomizados = [];
  }

  let existe = playlists.videosCustomizados.find(v => v.id === videoId);

  if (existe) {
    return res.status(400).json({ erro: "Vídeo já existe" });
  }

  const novoVideo = {
  id: videoId,
  titulo,
  iframe,
  thumb,
  duracao: live ? 9999999 : (duracao || 60),
  live: !!live
};

  playlists.videosCustomizados.push(novoVideo);

  savePlaylists(playlists);

  res.json({ ok: true });
});

migrarPlaylists();

app.listen(3005, "0.0.0.0", () => {
  console.log("Servidor rodando")
})

// PLAYLIST
app.get("/playlist", (req,res)=>{

  let { type, tv } = req.query;

  if(!fs.existsSync(PLAYLIST_FILE)){
    return res.json([]);
  }

  let playlists = JSON.parse(fs.readFileSync(PLAYLIST_FILE));
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

// SAVE PLAYLIST 🔒
app.post("/save-playlist", verificarAuth, (req,res)=>{

  const { tv, items } = req.body;

  let playlists = readPlaylists();

  if (!playlists.tvPlaylists) {
    playlists.tvPlaylists = {};
  }

  if (!playlists.tvPlaylists[tv]) {
    playlists.tvPlaylists[tv] = {
      items:[]
    };
  }

  playlists.tvPlaylists[tv].items =
    Array.isArray(items)
      ? items
      : [];

  savePlaylists(playlists);

  res.json({ ok:true });

});

app.use("/uploads", express.static("uploads"));

// UPDATE ALL 
app.post("/update-all", verificarAuth, (req, res) => {

  const { items } = req.body;

  let state = JSON.parse(fs.readFileSync(STATE_FILE));
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
    playlists.tvPlaylists[tv].items.push(
      ...(Array.isArray(items) ? items : [])
    );
    state[tv].refresh = Date.now();
  });

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(state, null, 2)
  );

  savePlaylists(playlists);
  res.json({ ok:true });
});
