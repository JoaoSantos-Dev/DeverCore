import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from "./firebase.js";

const form = document.querySelector("[data-form]");
const message = document.querySelector("[data-form-message]");
const submit = form?.querySelector("[type=submit]");
const whatsappInput = form?.querySelector("[name=whatsapp]");
const loadedAt = Date.now();
let isSubmitting = false;

function formatWhatsApp(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11) {
    const splitAt = digits.length > 10 ? 7 : 6;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, splitAt)}-${digits.slice(splitAt)}`;
  }
  return digits;
}

whatsappInput?.addEventListener("input", () => {
  whatsappInput.value = formatWhatsApp(whatsappInput.value);
});

function setMessage(text, type = "") {
  if (!message) return;
  message.textContent = text;
  message.classList.toggle("success", type === "success");
  message.classList.toggle("error", type === "error");
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isSubmitting) return;
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
    isSubmitting = true;
    submit.disabled = true;
    submit.textContent = "Registrando...";
    await addDoc(collection(db, "leads"), {
      name,
      email,
      whatsapp,
      consent: true,
      source: "turma-pioneira-op-01",
      status: "new",
      createdAt: serverTimestamp(),
    });
    form.reset();
    setMessage("Cadastro recebido. Você receberá as orientações de inscrição pelos dados informados.", "success");
  } catch (error) {
    console.error("[LEADS] Falha ao gravar no Firestore:", error?.code || error, error?.message || "");
    setMessage("Não foi possível registrar seu interesse agora. Tente novamente em instantes.", "error");
  } finally {
    isSubmitting = false;
    submit.disabled = false;
    submit.textContent = "Receber instruções de inscrição";
  }
});
