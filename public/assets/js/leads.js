import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from "./firebase.js";

const form = document.querySelector("[data-form]");
const message = document.querySelector("[data-form-message]");
const submit = form?.querySelector("[type=submit]");
const whatsappInput = form?.querySelector("[name=whatsapp]");
const formContent = form?.querySelector("[data-form-content]");
const successState = form?.querySelector("[data-form-success]");
const whatsappGroupLink = form?.querySelector("[data-whatsapp-group]");
const groupLinkNote = form?.querySelector("[data-group-link-note]");
const loadedAt = Date.now();
let isSubmitting = false;

function getWhatsAppGroupUrl() {
  const value = String(window.DEVER_COURSE?.whatsappGroupUrl || "").trim();
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "chat.whatsapp.com" && url.pathname.length > 1
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function showSuccessState() {
  const groupUrl = getWhatsAppGroupUrl();
  if (formContent) formContent.hidden = true;
  if (successState) {
    successState.hidden = false;
    successState.focus({ preventScroll: true });
  }
  if (whatsappGroupLink) {
    if (groupUrl) {
      whatsappGroupLink.href = groupUrl;
      whatsappGroupLink.removeAttribute("aria-disabled");
      whatsappGroupLink.classList.remove("is-disabled");
    } else {
      whatsappGroupLink.removeAttribute("href");
      whatsappGroupLink.setAttribute("aria-disabled", "true");
      whatsappGroupLink.classList.add("is-disabled");
    }
  }
  if (groupLinkNote) groupLinkNote.hidden = Boolean(groupUrl);
  successState?.scrollIntoView({ behavior: "smooth", block: "center" });
}

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
      source: "ia-gamedev-turma-pioneira",
      status: "new",
      createdAt: serverTimestamp(),
    });
    form.reset();
    setMessage("Cadastro realizado.", "success");
    showSuccessState();
  } catch (error) {
    console.error("[LEADS] Falha ao gravar no Firestore:", error?.code || error, error?.message || "");
    setMessage("Não foi possível registrar seu interesse agora. Tente novamente em instantes.", "error");
  } finally {
    isSubmitting = false;
    submit.disabled = false;
    submit.textContent = "Receber instruções de inscrição";
  }
});
