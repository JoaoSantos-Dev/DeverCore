import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { logout, requireAuth } from "./auth.js";

const stateEl = document.querySelector("[data-certificate-state]");
const documentEl = document.querySelector("[data-certificate-document]");
const logoutButton = document.querySelector("[data-logout]");

logoutButton?.addEventListener("click", logout);

function setState(message) {
  if (stateEl) {
    stateEl.hidden = false;
    stateEl.textContent = message;
  }
  if (documentEl) documentEl.hidden = true;
}

function formatDate(value) {
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime())
    ? "data não disponível"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(date);
}

async function loadCertificate() {
  const user = await requireAuth();
  if (!user) return;

  const code = new URLSearchParams(window.location.search).get("code");
  if (!code) return setState("Certificado não informado.");

  const snapshot = await getDoc(doc(db, "certificates", code));
  if (!snapshot.exists() || snapshot.data().status === "revoked") {
    return setState("Certificado não encontrado ou não está disponível.");
  }

  const certificate = snapshot.data();
  const fields = {
    "[data-certificate-name]": certificate.userName || user.email || "Aluno",
    "[data-certificate-course]": certificate.courseTitle || certificate.courseId || "Curso DEVER",
    "[data-certificate-date]": formatDate(certificate.issuedAt),
    "[data-certificate-code]": certificate.certificateCode || snapshot.id,
  };
  Object.entries(fields).forEach(([selector, value]) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  });
  if (stateEl) stateEl.hidden = true;
  if (documentEl) documentEl.hidden = false;
}

document.querySelector("[data-certificate-print]")?.addEventListener("click", () => window.print());

loadCertificate().catch((error) => {
  console.error("[CERTIFICATE] Erro ao carregar certificado:", error);
  setState("Não foi possível carregar o certificado agora.");
});
