import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { auth } from "./firebase.js";
import { redirectIfAuthenticated } from "./auth.js";

const form = document.querySelector("[data-login-form]");
const emailInput = document.querySelector("[data-email]");
const passwordInput = document.querySelector("[data-password]");
const message = document.querySelector("[data-login-message]");
const submitButton = document.querySelector("[data-login-submit]");

redirectIfAuthenticated();

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
