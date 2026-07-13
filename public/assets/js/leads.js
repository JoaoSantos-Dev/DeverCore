import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from "./firebase.js";

const form = document.querySelector("[data-form]");
const message = document.querySelector("[data-form-message]");
const submit = form?.querySelector("[type=submit]");
const loadedAt = Date.now();

function setMessage(text, type = "") {
  if (!message) return;
  message.textContent = text;
  message.classList.toggle("success", type === "success");
  message.classList.toggle("error", type === "error");
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.checkValidity()) return form.reportValidity();

  const data = new FormData(form);
  if (String(data.get("website") || "").trim() || Date.now() - loadedAt < 1500) {
    setMessage("Não foi possível registrar agora. Tente novamente.", "error");
    return;
  }

  const name = String(data.get("name") || "").trim().slice(0, 100);
  const email = String(data.get("email") || "").trim().toLowerCase().slice(0, 254);
  const whatsapp = String(data.get("whatsapp") || "").replace(/[^0-9+() -]/g, "").trim().slice(0, 30);

  try {
    submit.disabled = true;
    submit.textContent = "Registrando...";
    await addDoc(collection(db, "leads"), {
      name,
      email,
      whatsapp,
      consent: true,
      source: "landing-page",
      status: "new",
      createdAt: serverTimestamp(),
    });
    form.reset();
    setMessage("Interesse registrado com sucesso. Entraremos em contato quando houver novidades.", "success");
  } catch (error) {
    console.error("[LEADS] Falha ao gravar no Firestore:", error?.code || error, error?.message || "");
    setMessage("Não foi possível registrar seu interesse agora. Tente novamente em instantes.", "error");
  } finally {
    submit.disabled = false;
    submit.textContent = "Registrar interesse";
  }
});
