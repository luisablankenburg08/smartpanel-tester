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
