const multer = require("multer");
const path = require("path");
const express = require("express")
const fs = require("fs")
const app = express()
const PLAYLIST_FILE = path.join("/home/pi/tester/json/playlists-tester.json"); //salvar conteúdos em playlists-tester.json
const STATE_FILE = "/home/pi/tester/json/state.json" // salvar tvs em state.json
const LOGIN_DIR = path.join(__dirname, "login") 
const tvHeartbeats = new Map()


const session = require("express-session");

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
app.use("/uploads",express.static("public/uploads"));

if (!fs.existsSync(STATE_FILE)) { fs.writeFileSync(STATE_FILE, "{}") }



const storage = multer.diskStorage({

destination(req,file,cb){
  cb(null,"public/uploads");
},

filename(req,file,cb){
  cb(
    null,
    Date.now()+
    path.extname(file.originalname)
  );
}
});

const upload = multer({
    storage
});
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
      delete state[tvId]
      saveState(state)
      tvHeartbeats.delete(tvId)
      console.log(`❌ TV ${tvId} removida`)
    }
  } catch (e) {
    console.error(`Erro ao remover TV ${tvId}:`, e)
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

    const atual =playlists.tvPlaylists[tv];
    if (Array.isArray(atual)) {
      playlists.tvPlaylists[tv] = {items: atual};
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

// proteger controller (ANTES do static)
app.get("/controller-tester.html", verificarAuth, (req, res) => {
  res.sendFile("/home/pi/tester/controller-tester.html");
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

app.use(express.static("/home/pi/tester"))

//==================
// ROTAS
//==================

// ADICIONAR ÀS PLAYLISTS
app.post("/playlist/add", (req,res)=>{

    const { tv, items } = req.body;
    let playlists = readPlaylists();

    if(!playlists.tvPlaylists){
      playlists.tvPlaylists = {};
    }

    if(!playlists.tvPlaylists[tv]){
      playlists.tvPlaylists[tv] = {
        items:[]
      };
    }

    if(!Array.isArray(playlists.tvPlaylists[tv].items)){
      playlists.tvPlaylists[tv].items = [];
    }

    playlists.tvPlaylists[tv].items.push(...items);
    savePlaylists(playlists);
    res.json({ok:true});

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
      playlists.tvPlaylists[tv] = {items:[]};
    }

    playlists.tvPlaylists[tv].items = items;

    savePlaylists(playlists);

    res.json({sucesso:true});

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
        pagina: "layouts/tela2.html",
        intervalo: 2000
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
    pagina: "layouts/tela2.html",
    intervalo: 2000
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

// LISTAR VÍDEOS
app.get("/videos", verificarAuth, (req, res) => {

  let playlists = readPlaylists();
  let videos = getAllVideoItems(playlists);
  res.json(videos);
});

// ADICIONAR VÍDEO
app.post("/videos", verificarAuth, (req, res) => {

  const { titulo, iframe, thumb, duracao, live } = req.body;

  if (!iframe) {
    return res.status(400).json({ erro: "Iframe obrigatório" });
  }

  const videoId = extrairIdDoIframe(iframe);

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

//SALVAR AVISOS
app.post(
  "/avisos",
  verificarAuth,
  upload.single("arquivo"),
  (req,res)=>{

    let playlists=readPlaylists();
    if(!playlists.avisosCustomizados){
      playlists.avisosCustomizados=[];
    }

    const aviso={
      id:Date.now().toString(),
      titulo:req.body.titulo,
      texto:req.body.texto,
      link:req.body.link,
      embed:req.body.embed,
      duracao:Number(req.body.duracao)||15
    };

      if(req.file){
        aviso.arquivo="/uploads/"+req.file.filename;
      }

      playlists.avisosCustomizados.push(aviso);
      savePlaylists(playlists);
      res.json({ok:true});
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

  aviso.titulo = req.body.titulo;
  aviso.texto = req.body.texto;
  aviso.link = req.body.link;
  aviso.embed = req.body.embed;
  aviso.duracao = Number(req.body.duracao) || 15;

  if(req.file){
    aviso.arquivo = "/uploads/" + req.file.filename;
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

    playlists.tvPlaylists[tv].items = Array.isArray(items) ? items : [];
    savePlaylists(playlists);
    res.json({ok: true});
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
