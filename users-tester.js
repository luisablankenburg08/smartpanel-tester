const form = document.getElementById("userForm");
const mensagem = document.getElementById("mensagem");
const botao = form.querySelector("button");
const listaUsuarios = document.getElementById("lista-usuarios");

form.addEventListener("submit", async event => {
  event.preventDefault();
  botao.disabled = true;
  mensagem.textContent = "";

  const dados = {
    username: form.username.value.trim(),
    password: form.password.value,
    role: form.role.value
  };

  try {
    const resposta = await fetch("/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados)
    });
    const resultado = await resposta.json();

    if (!resposta.ok) {
      throw new Error(resultado.erro || "Não foi possível criar o usuário");
    }

    mensagem.textContent = `Usuário ${resultado.user.username} criado com sucesso.`;
    form.reset();
  } catch (error) {
    mensagem.textContent = error.message;
  } finally {
    botao.disabled = false;
  }
});

async function carregarUsuarios() {
  const resposta = await fetch("/users");
  const resultado = await resposta.json();

  if (!resposta.ok) {
    throw new Error(resultado.erro || "Não foi possível listar os usuários");
  }

  listaUsuarios.innerHTML = "";

  resultado.users.forEach(usuario => {
    const linha = document.createElement("div");
    linha.className = "usuario-linha";
    linha.innerHTML = `
      <strong>${usuario.username}</strong>
      <span>${usuario.active ? "Ativo" : "Pendente/Bloqueado"}</span>
      <select aria-label="Perfil de ${usuario.username}">
        <option value="visualizador" ${usuario.role === "visualizador" ? "selected" : ""}>Visualizador</option>
        <option value="editor" ${usuario.role === "editor" ? "selected" : ""}>Editor</option>
        <option value="admin" ${usuario.role === "admin" ? "selected" : ""}>Administrador</option>
      </select>
      <button type="button">${usuario.active ? "Bloquear" : "Aprovar"}</button>
    `;

    const perfil = linha.querySelector("select");
    const acao = linha.querySelector("button");

    acao.addEventListener("click", async () => {
      acao.disabled = true;

      try {
        const resposta = await fetch(`/users/${usuario.id}/access`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            active: !usuario.active,
            role: perfil.value
          })
        });
        const resultado = await resposta.json();

        if (!resposta.ok) {
          throw new Error(resultado.erro || "Não foi possível alterar o acesso");
        }

        await carregarUsuarios();
      } catch (error) {
        mensagem.textContent = error.message;
        acao.disabled = false;
      }
    });

    listaUsuarios.appendChild(linha);
  });
}

carregarUsuarios().catch(error => {
  mensagem.textContent = error.message;
});
