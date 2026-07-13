import { sendPasswordResetEmail, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { auth } from "./firebase.js";
import { redirectIfAuthenticated } from "./auth.js";

const form = document.querySelector("[data-login-form]");
const emailInput = document.querySelector("[data-email]");
const passwordInput = document.querySelector("[data-password]");
const passwordToggle = document.querySelector("[data-password-toggle]");
const passwordReset = document.querySelector("[data-password-reset]");
const message = document.querySelector("[data-login-message]");
const submitButton = document.querySelector("[data-login-submit]");

redirectIfAuthenticated();

passwordToggle?.addEventListener("click", () => {
  const showing = passwordInput?.type === "text";
  if (!passwordInput) return;
  passwordInput.type = showing ? "password" : "text";
  passwordToggle.textContent = showing ? "Mostrar" : "Ocultar";
  passwordToggle.setAttribute("aria-label", showing ? "Mostrar senha" : "Ocultar senha");
  passwordToggle.setAttribute("aria-pressed", String(!showing));
});

passwordReset?.addEventListener("click", async () => {
  const email = emailInput?.value.trim().toLowerCase();
  if (!email) {
    setMessage("Informe seu e-mail acima para recuperar a senha.", "error");
    emailInput?.focus();
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    setMessage("Se esse e-mail estiver cadastrado, você receberá as instruções de recuperação.", "success");
  } catch {
    setMessage("Não foi possível solicitar a recuperação agora. Tente novamente em instantes.", "error");
  }
});

function setMessage(text) {
  if (message) message.textContent = text;
}

function setLoading(isLoading) {
  if (submitButton) {
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? "Entrando..." : "Entrar";
  }
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");

  const email = emailInput?.value.trim();
  const password = passwordInput?.value;
  if (!email || !password) {
    setMessage("Informe e-mail e senha.");
    return;
  }

  try {
    setLoading(true);
    await signInWithEmailAndPassword(auth, email, password);
    window.location.replace("dashboard.html");
  } catch (error) {
    setMessage("E-mail ou senha inválidos.");
  } finally {
    setLoading(false);
  }
});
