const form = document.getElementById("registerForm");
const mensagem = document.getElementById("mensagem");
const botao = form.querySelector("button");

form.addEventListener("submit", async event => {
  event.preventDefault();
  mensagem.textContent = "";

  if (form.password.value !== form.passwordConfirmation.value) {
    mensagem.textContent = "As senhas não coincidem.";
    return;
  }

  botao.disabled = true;

  try {
    const resposta = await fetch("/account/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.username.value.trim(),
        password: form.password.value
      })
    });
    const resultado = await resposta.json();

    if (!resposta.ok) {
      throw new Error(resultado.erro || "Não foi possível enviar o cadastro");
    }

    mensagem.textContent = resultado.mensagem;
    form.reset();
  } catch (error) {
    mensagem.textContent = error.message;
  } finally {
    botao.disabled = false;
  }
});


document.querySelectorAll(".toggle-senha").forEach(botao => {

  botao.addEventListener("click", function () {
    const idCampo = this.dataset.target;
    const campo = document.getElementById(idCampo);
    const icone = this.querySelector("i");
    const senhaEstaVisivel = campo.type === "text";
    campo.type = senhaEstaVisivel ? "password" : "text";

    if (senhaEstaVisivel) {
      icone.classList.remove("bi-eye-slash");
      icone.classList.add("bi-eye");
      this.setAttribute("aria-label", "Mostrar senha");
    } else {
      icone.classList.remove("bi-eye");
      icone.classList.add("bi-eye-slash");
      this.setAttribute("aria-label", "Ocultar senha");
    }
  });
});