const perfil = document.getElementById("perfil");
const mensagem = document.getElementById("mensagem");
const painelAdmin = document.getElementById("admin-panel");
const botaoLogout = document.getElementById("logout-button");

const nomesPerfil = {
  admin: "Administrador",
  editor: "Editor",
  visualizador: "Visualizador"
};

function formatarData(valor) {
  if (!valor) {
    return "Ainda não realizado";
  }

  return new Date(valor).toLocaleString("pt-BR");
}

async function carregarPerfil() {
  try {
    const resposta = await fetch("/me", { cache: "no-store" });
    const resultado = await resposta.json();

    if (!resposta.ok) {
      throw new Error(resultado.erro || "Não foi possível carregar o perfil");
    }

    const usuario = resultado.user;
    document.getElementById("profile-username").textContent = usuario.username;
    document.getElementById("profile-role").textContent = nomesPerfil[usuario.role] || usuario.role;
    document.getElementById("profile-status").textContent = usuario.active ? "Ativo" : "Bloqueado";
    document.getElementById("profile-created").textContent = formatarData(usuario.created_at);
    document.getElementById("profile-last-login").textContent = formatarData(usuario.last_login_at);

    if (usuario.role === "admin") {
      painelAdmin.hidden = false;
    }
  } catch (error) {
    mensagem.textContent = error.message;
  }
}

carregarPerfil();

botaoLogout.addEventListener("click", async () => {
  botaoLogout.disabled = true;

  try {
    const resposta = await fetch("/logout", { method: "POST" });

    if (!resposta.ok) {
      throw new Error("Não foi possível encerrar a sessão");
    }

    window.location.href = "/login";
  } catch (error) {
    mensagem.textContent = error.message;
    botaoLogout.disabled = false;
  }
});
