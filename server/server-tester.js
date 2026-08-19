const multer = require("multer");
const path = require("path");
const express = require("express")
const fs = require("fs")
const app = express()
// BANCO DE DADOS
const bcrypt = require("bcrypt");
const { pool } = require("./db");

const UPLOADS_DIR = path.join(__dirname, "uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
const ROOT_DIR = path.resolve(__dirname, "..");
const PLAYLIST_FILE = path.join(ROOT_DIR, "json", "playlists-tester.json"); //salvar conteúdos em playlists-tester.json
const STATE_FILE = path.join(ROOT_DIR, "json", "state.json"); // salvar tvs em state.json
const LOGIN_DIR = path.join(__dirname, "login");
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
app.use("/uploads", express.static(UPLOADS_DIR));

if (!fs.existsSync(STATE_FILE)) { fs.writeFileSync(STATE_FILE, "{}") }

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

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

async function registrarAuditoria(req, action, entityType, entityId, details = {}, tvId = null) {
  try {
    await pool.query(
      `INSERT INTO audit_logs
        (user_id, action, entity_type, entity_id, tv_id, details)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        req.session?.userId || null,
        action,
        entityType,
        entityId ? String(entityId) : null,
        tvId,
        JSON.stringify(details)
      ]
    );
  } catch (error) {
    console.error("Erro ao registrar auditoria:", error.message);
  }
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

app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        erro: "Usuário e senha são obrigatórios"
      });
    }

    try {
      const resultado = await pool.query(
        `SELECT id, username, password_hash, role
         FROM users
         WHERE username = $1 AND active = TRUE`,
        [username.trim()]
      );

      const usuario = resultado.rows[0];
      const senhaValida = usuario
        ? await bcrypt.compare(password, usuario.password_hash)
        : false;

      if (!senhaValida) {
        await registrarAuditoria(req, "LOGIN_FAILED", "user", username.trim());
        return res.json({ success: false });
      }

      req.session.authenticated = true;
      req.session.userId = usuario.id;
      req.session.username = usuario.username;
      req.session.role = usuario.role;

      await pool.query(
        "UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1",
        [usuario.id]
      );
      await registrarAuditoria(req, "LOGIN_SUCCESS", "user", usuario.id);

      req.session.save(error => {
        if (error) {
          console.error("Erro ao salvar sessão:", error.message);
          return res.status(500).json({ success: false });
        }

        res.json({
          success: true,
          user: {
            id: usuario.id,
            username: usuario.username,
            role: usuario.role
          }
        });
      });
    } catch (error) {
      console.error("Erro no login:", error.message);
      res.status(500).json({
        success: false,
        erro: "Não foi possível realizar o login"
      });
    }
});

// CADASTRO PÚBLICO: a conta aguarda aprovação do administrador
app.post("/account/register", async (req, res) => {
  const { username, password } = req.body;
  const nome = typeof username === "string" ? username.trim() : "";
  const senha = typeof password === "string" ? password : "";

  if (!nome || nome.length > 80 || senha.length < 8) {
    return res.status(400).json({
      erro: "Usuário é obrigatório e a senha deve ter pelo menos 8 caracteres"
    });
  }

  try {
    const passwordHash = await bcrypt.hash(senha, 12);
    const resultado = await pool.query(
      `INSERT INTO users
        (username, password_hash, role, active)
       VALUES ($1, $2, 'visualizador', FALSE)
       RETURNING id, username`,
      [nome, passwordHash]
    );

    res.status(201).json({
      ok: true,
      mensagem: "Cadastro enviado. Aguarde a aprovação do administrador.",
      user: resultado.rows[0]
    });
    await registrarAuditoria(req, "USER_REGISTERED", "user", resultado.rows[0].id, {
      username: resultado.rows[0].username,
      status: "pending"
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ erro: "Usuário já existe" });
    }

    console.error("Erro no cadastro:", error.message);
    res.status(500).json({ erro: "Não foi possível concluir o cadastro" });
  }
});

// servir páginas e assets do painel
app.get("/controller-tester.html", verificarAuth, (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "controller-tester.html"));
});

app.get("/profile-tester.html", verificarAuth, (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "profile-tester.html"));
});

app.get("/users-tester.html", verificarAdmin, (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "users-tester.html"));
});

app.get("/register-tester.html", (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "register-tester.html"));
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

app.post("/logout", (req, res) => {
  if (!req.session) {
    return res.json({ ok: true });
  }

  req.session.destroy(error => {
    if (error) {
      console.error("Erro ao encerrar sessão:", error.message);
      return res.status(500).json({ erro: "Não foi possível encerrar a sessão" });
    }

    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

// middleware de proteção
function verificarAuth(req, res, next) {

  if (req.session && req.session.authenticated) {
    next();
  } else {
    res.redirect("/login/login.html");
  }
}

function verificarAdmin(req, res, next) {
  if (!req.session || !req.session.authenticated) {
    return res.status(401).json({ erro: "Autenticação necessária" });
  }

  if (req.session.role !== "admin") {
    return res.status(403).json({ erro: "Acesso restrito ao administrador" });
  }

  next();
}

app.get("/me", verificarAuth, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, username, role, active, created_at, last_login_at
       FROM users
       WHERE id = $1`,
      [req.session.userId]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ erro: "Usuário não encontrado" });
    }

    res.json({ user: resultado.rows[0] });
  } catch (error) {
    console.error("Erro ao carregar perfil:", error.message);
    res.status(500).json({ erro: "Não foi possível carregar o perfil" });
  }
});

// CRIAR USUÁRIO
app.post("/users", verificarAdmin, async (req, res) => {
  const { username, password, role = "editor" } = req.body;
  const nome = typeof username === "string" ? username.trim() : "";
  const senha = typeof password === "string" ? password : "";
  const perfisPermitidos = ["admin", "editor", "visualizador"];

  if (!nome || nome.length > 80 || senha.length < 8) {
    return res.status(400).json({
      erro: "Usuário é obrigatório e a senha deve ter pelo menos 8 caracteres"
    });
  }

  if (!perfisPermitidos.includes(role)) {
    return res.status(400).json({ erro: "Perfil inválido" });
  }

  try {
    const passwordHash = await bcrypt.hash(senha, 12);
    const resultado = await pool.query(
      `INSERT INTO users
        (username, password_hash, role, active, created_by)
       VALUES ($1, $2, $3, TRUE, $4)
       RETURNING id, username, role, active, created_at`,
      [nome, passwordHash, role, req.session.userId]
    );

    res.status(201).json({
      ok: true,
      user: resultado.rows[0]
    });
    await registrarAuditoria(req, "USER_CREATED", "user", resultado.rows[0].id, {
      username: resultado.rows[0].username,
      role: resultado.rows[0].role
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ erro: "Usuário já existe" });
    }

    console.error("Erro ao criar usuário:", error.message);
    res.status(500).json({ erro: "Não foi possível criar o usuário" });
  }
});

// LISTAR E ALTERAR ACESSO DOS USUÁRIOS
app.get("/users", verificarAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, username, role, active, created_at, last_login_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json({ users: resultado.rows });
  } catch (error) {
    console.error("Erro ao listar usuários:", error.message);
    res.status(500).json({ erro: "Não foi possível listar os usuários" });
  }
});

app.patch("/users/:id/access", verificarAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  const { active, role } = req.body;
  const perfisPermitidos = ["admin", "editor", "visualizador"];

  if (!Number.isInteger(userId) || typeof active !== "boolean" || !perfisPermitidos.includes(role)) {
    return res.status(400).json({ erro: "Dados de acesso inválidos" });
  }

  if (userId === req.session.userId && !active) {
    return res.status(400).json({ erro: "O administrador não pode bloquear a própria conta" });
  }

  try {
    const resultado = await pool.query(
      `UPDATE users
       SET active = $1, role = $2, updated_at = now()
       WHERE id = $3
       RETURNING id, username, role, active, updated_at`,
      [active, role, userId]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ erro: "Usuário não encontrado" });
    }

    res.json({ ok: true, user: resultado.rows[0] });
    await registrarAuditoria(req, active ? "USER_APPROVED" : "USER_BLOCKED", "user", userId, {
      role: role
    });
  } catch (error) {
    console.error("Erro ao alterar acesso:", error.message);
    res.status(500).json({ erro: "Não foi possível alterar o acesso" });
  }
});

app.use(express.static(ROOT_DIR))

//==================
// ROTAS
//==================

// ADICIONAR ÀS PLAYLISTS
app.post("/playlist/add", verificarAuth, async (req,res)=>{

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
    await registrarAuditoria(req, "PLAYLIST_ITEMS_ADDED", "tv_playlist", tv, {
      itemCount: items.length
    }, tv);
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
app.post("/playlist/reorder", verificarAuth, async (req,res)=>{

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
    await registrarAuditoria(req, "PLAYLIST_REORDERED", "tv_playlist", tv, {
      itemCount: items.length
    }, tv);

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
app.post("/update", verificarAuth, async (req, res) => {

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
  await registrarAuditoria(req, "TV_PAGE_UPDATED", "tv", tv, {
    pagina: state[tv].pagina,
    intervalo: state[tv].intervalo
  }, tv);

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
  await registrarAuditoria(req, "VIDEO_CREATED", "video", novoVideo.id, {
    titulo: novoVideo.titulo,
    duracao: novoVideo.duracao
  });

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
app.delete("/videos/:id", verificarAuth, async (req, res) => {

    const id = req.params.id;

    let playlists = readPlaylists();

    const video = playlists.videosCustomizados.find(v => v.id === id);
    playlists.videosCustomizados = playlists.videosCustomizados.filter(v => v.id !== id);

    savePlaylists(playlists);
    await registrarAuditoria(req, "VIDEO_DELETED", "video", id, {
      titulo: video?.titulo || null
    });

    res.json({ ok: true });

});

// EDITAR VÍDEO
app.put("/videos/:id", verificarAuth, async (req, res) => {

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
  await registrarAuditoria(req, "VIDEO_UPDATED", "video", id, {
    titulo: video.titulo,
    duracao: video.duracao
  });

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
app.post("/avisos", verificarAuth, upload.single("arquivo"), async (req, res) => {

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
  await registrarAuditoria(req, "NOTICE_CREATED", "notice", aviso.id, {
    titulo: aviso.titulo,
    tipo: aviso.tipo
  });

  res.json({
    ok: true,
    aviso
  });
});

// EDITAR AVISOS
app.put("/avisos/:id", verificarAuth, upload.single("arquivo"), async (req,res)=>{
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
  await registrarAuditoria(req, "NOTICE_UPDATED", "notice", req.params.id, {
    titulo: aviso.titulo,
    tipo: aviso.tipo
  });
  res.json({ok:true});
});

//EXCLUIR AVISOS
app.delete("/avisos/:id", verificarAuth, async (req,res)=>{

    const playlists = readPlaylists();

    const aviso = playlists.avisosCustomizados.find(a => a.id === req.params.id);
    playlists.avisosCustomizados = playlists.avisosCustomizados.filter(
      a => a.id !== req.params.id
    );

    savePlaylists(playlists);
    await registrarAuditoria(req, "NOTICE_DELETED", "notice", req.params.id, {
      titulo: aviso?.titulo || null
    });
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
app.post("/mapa", verificarAuth, upload.single("mapa"), async (req, res) => {
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
  await registrarAuditoria(req, mapaExistente ? "MAP_UPDATED" : "MAP_CREATED", "map", "mapa", {
    src
  });
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
app.post("/playlists-salvas", verificarAuth, async (req, res) => {

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
  await registrarAuditoria(req, "PLAYLIST_CREATED", "playlist", novaPlaylist.id, {
    titulo: novaPlaylist.titulo,
    itemCount: novaPlaylist.items.length
  });
  res.json({ok: true,playlist: novaPlaylist});
});

//EDITAR PLAYLISTS PRONTAS
app.put("/playlists-salvas/:id", verificarAuth, async (req, res) => {

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
  await registrarAuditoria(req, "PLAYLIST_UPDATED", "playlist", req.params.id, {
    titulo: playlist.titulo,
    itemCount: playlist.items.length
  });
  res.json({ok: true});
});

//EXCLUIR PLAYLISTS PRONTAS
app.delete("/playlists-salvas/:id", verificarAuth, async (req, res) => {
  const playlists = readPlaylists();
  const playlist = playlists.playlistsSalvas.find(p => p.id === req.params.id);
  playlists.playlistsSalvas =
    playlists.playlistsSalvas.filter(
      p => p.id !== req.params.id
    );

  savePlaylists(playlists);
  await registrarAuditoria(req, "PLAYLIST_DELETED", "playlist", req.params.id, {
    titulo: playlist?.titulo || null
  });
  res.json({ok: true});
});

//APLICAR PLAYLISTS PRONTAS
app.post("/playlist/aplicar", verificarAuth, async (req, res) => {
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

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(state, null, 2)
  );
  await registrarAuditoria(req, "PLAYLIST_APPLIED", "playlist", playlistId, {
    titulo: playlist.titulo,
    itemCount: playlist.items.length
  }, tv);

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

// SAVE PLAYLIST 
app.post("/save-playlist", verificarAuth, async (req, res) => {

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
    await registrarAuditoria(req, "TV_PLAYLIST_SAVED", "tv_playlist", tv, {
      type: req.body.type || "playlist",
      itemCount: Array.isArray(items) ? items.length : 0
    }, tv);
    res.json({ok: true});
});

// UPDATE ALL 
app.post("/update-all", verificarAuth, async (req, res) => {

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
  await registrarAuditoria(req, "CONTENT_APPLIED_TO_ALL_TVS", "tv_playlist", "all", {
    type: req.body.type || "playlist",
    itemCount: Array.isArray(req.body.items) ? req.body.items.length : 0,
    tvCount: Object.keys(state).length
  });
  res.json({ ok:true });
});

migrarPlaylists();

app.listen(3005, "0.0.0.0", () => {
  console.log("Servidor rodando")
})
