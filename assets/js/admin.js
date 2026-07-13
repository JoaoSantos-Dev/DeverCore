import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { displayRole, getDisplayName, logout, normalizeRole, requireAdmin } from "./auth.js";
import { safeHttpUrl } from "./url.js";

const state = {
  adminUser: null,
  adminProfile: null,
  courses: [],
  users: [],
  enrollments: [],
  leads: [],
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const els = {
  adminProfile: $("[data-admin-profile]"),
  adminState: $("[data-admin-state]"),
  adminDenied: $("[data-admin-denied]"),
  adminDeniedMessage: $("[data-admin-denied-message]"),
  adminContent: $("[data-admin-content]"),
  summaryCourses: $("[data-summary-courses]"),
  summaryActiveCourses: $("[data-summary-active-courses]"),
  summaryUsers: $("[data-summary-users]"),
  summaryEnrollments: $("[data-summary-enrollments]"),
  summaryLeads: $("[data-summary-leads]"),
  courseForm: $("[data-course-form]"),
  courseMessage: $("[data-course-message]"),
  courseList: $("[data-admin-course-list]"),
  courseState: $("[data-admin-courses-state]"),
  userForm: $("[data-user-form]"),
  userMessage: $("[data-user-message]"),
  userList: $("[data-admin-user-list]"),
  userState: $("[data-admin-users-state]"),
  leadFilter: $("[data-lead-filter]"),
  leadMessage: $("[data-lead-message]"),
  leadList: $("[data-lead-list]"),
  leadState: $("[data-lead-state]"),
};

$$("[data-logout]").forEach((button) => {
  button.addEventListener("click", logout);
});

function setAdminState(message, isVisible = true) {
  if (!els.adminState) return;
  els.adminState.hidden = !isVisible;
  els.adminState.textContent = message;
}

function setMessage(element, message, type = "success") {
  if (!element) return;
  element.textContent = message;
  element.classList.remove("success", "error", "warning", "muted");
  element.classList.add(type);
}

function formatFirebaseError(error, fallback = "Falha desconhecida") {
  if (error?.code === "permission-denied") return "Você não tem permissão para realizar esta operação.";
  if (error?.code === "unavailable") return "O serviço está temporariamente indisponível. Tente novamente.";
  return fallback;
}

function logAdminError(context, error) {
  console.error(`[ADMIN] ${context}`);
  console.error("[ADMIN] Erro completo:", error);
  console.error("[ADMIN] Código:", error?.code);
  console.error("[ADMIN] Mensagem:", error?.message);
}

function setError(element, context, error) {
  logAdminError(context, error);
  setMessage(element, formatFirebaseError(error), "error");
}

function setStateError(element, context, error) {
  logAdminError(context, error);
  if (!element) return;
  element.hidden = false;
  element.textContent = formatFirebaseError(error);
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toNumber(value, fallback = 0) {
  if (value === "" || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionalNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatCurrency(value, currency = "BRL") {
  if (value === null || value === undefined || value === "") return "Preço não definido";
  const number = Number(value);
  if (!Number.isFinite(number)) return "Preço não definido";

  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency || "BRL",
    }).format(number);
  } catch {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(number);
  }
}

function sortByOrder(items) {
  return [...items].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function createBadge(text) {
  const badge = document.createElement("span");
  badge.textContent = text;
  return badge;
}

function getCourseById(courseId) {
  return state.courses.find((course) => course.id === courseId) || null;
}

function getUserById(userId) {
  return state.users.find((user) => user.id === userId) || null;
}

function updateSummary() {
  if (els.summaryCourses) els.summaryCourses.textContent = String(state.courses.length);
  if (els.summaryActiveCourses) {
    els.summaryActiveCourses.textContent = String(state.courses.filter((course) => course.active !== false).length);
  }
  if (els.summaryUsers) els.summaryUsers.textContent = String(state.users.length);
  if (els.summaryEnrollments) {
    els.summaryEnrollments.textContent = String(
      state.enrollments.filter((enrollment) => enrollment.status !== "inactive").length
    );
  }
  if (els.summaryLeads) {
    els.summaryLeads.textContent = String(state.leads.filter((lead) => (lead.status || "new") === "new").length);
  }
}

function formatDateTime(value) {
  if (!value) return "Data não disponível";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não disponível";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

const leadStatusLabels = {
  new: "Novo",
  contacted: "Contatado",
  converted: "Convertido",
  archived: "Arquivado",
};

async function loadLeads() {
  if (els.leadState) {
    els.leadState.hidden = false;
    els.leadState.textContent = "Carregando leads...";
  }
  try {
    const snapshot = await getDocs(collection(db, "leads"));
    state.leads = snapshot.docs
      .map((leadDoc) => ({ id: leadDoc.id, ...leadDoc.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    renderLeads();
    updateSummary();
  } catch (error) {
    setStateError(els.leadState, "Erro ao carregar leads.", error);
  }
}

function renderLeads() {
  if (!els.leadList || !els.leadState) return;
  els.leadList.replaceChildren();
  const filter = els.leadFilter?.value || "all";
  const leads = state.leads.filter((lead) => filter === "all" || (lead.status || "new") === filter);

  if (!leads.length) {
    els.leadState.hidden = false;
    els.leadState.textContent = filter === "all" ? "Nenhum lead cadastrado." : "Nenhum lead com este status.";
    return;
  }

  els.leadState.hidden = true;
  leads.forEach((lead) => {
    const item = document.createElement("article");
    item.className = "admin-course-item compact";

    const eyebrow = document.createElement("span");
    eyebrow.textContent = `${leadStatusLabels[lead.status || "new"] || "Novo"} · ${formatDateTime(lead.createdAt)}`;

    const title = document.createElement("strong");
    title.textContent = lead.name || "Contato sem nome";

    const description = document.createElement("p");
    description.textContent = `${lead.email || "Sem e-mail"} · ${lead.whatsapp || "Sem WhatsApp"}`;

    const contactLinks = document.createElement("div");
    contactLinks.className = "lead-contact-links";
    if (lead.email) {
      const emailLink = document.createElement("a");
      emailLink.className = "app-button";
      emailLink.href = `mailto:${lead.email}`;
      emailLink.textContent = "Enviar e-mail";
      contactLinks.appendChild(emailLink);
    }
    const phone = String(lead.whatsapp || "").replace(/\D/g, "");
    if (phone) {
      const whatsappLink = document.createElement("a");
      whatsappLink.className = "app-button";
      whatsappLink.href = `https://wa.me/${phone}`;
      whatsappLink.target = "_blank";
      whatsappLink.rel = "noopener noreferrer";
      whatsappLink.textContent = "Abrir WhatsApp";
      contactLinks.appendChild(whatsappLink);
    }

    const actions = document.createElement("div");
    actions.className = "admin-actions";
    Object.entries(leadStatusLabels).forEach(([status, label]) => {
      if ((lead.status || "new") === status) return;
      actions.appendChild(createActionButton(label, "leadStatus", `${lead.id}:${status}`));
    });

    item.append(eyebrow, title, description, contactLinks, actions);
    els.leadList.appendChild(item);
  });
}

async function updateLeadStatus(leadId, status) {
  if (!leadStatusLabels[status]) return;
  try {
    await updateDoc(doc(db, "leads", leadId), { status, updatedAt: serverTimestamp() });
    const lead = state.leads.find((item) => item.id === leadId);
    if (lead) lead.status = status;
    setMessage(els.leadMessage, `Lead marcado como ${leadStatusLabels[status].toLowerCase()}.`);
    renderLeads();
    updateSummary();
  } catch (error) {
    setError(els.leadMessage, "Erro ao atualizar lead.", error);
  }
}

async function loadCourses() {
  if (els.courseState) {
    els.courseState.hidden = false;
    els.courseState.textContent = "Carregando dados...";
  }

  try {
    const snapshot = await getDocs(collection(db, "courses"));
    state.courses = sortByOrder(snapshot.docs.map((courseDoc) => ({ id: courseDoc.id, ...courseDoc.data() })));
    renderCourses();
    updateSummary();
  } catch (error) {
    setStateError(els.courseState, "Erro ao carregar cursos.", error);
  }
}

function createActionButton(label, datasetKey, value, variant = "") {
  const button = document.createElement("button");
  button.className = variant ? `app-button ${variant}` : "app-button";
  button.type = "button";
  button.dataset[datasetKey] = value;
  button.textContent = label;
  return button;
}

function renderCourses() {
  if (!els.courseList || !els.courseState) return;
  els.courseList.replaceChildren();

  if (!state.courses.length) {
    els.courseState.hidden = false;
    els.courseState.textContent = "Nenhum curso cadastrado.";
    return;
  }

  els.courseState.hidden = true;
  state.courses.forEach((course) => {
    const item = document.createElement("article");
    item.className = "admin-course-item";

    const eyebrow = document.createElement("span");
    eyebrow.textContent = course.id;

    const title = document.createElement("strong");
    title.textContent = course.title || course.id;

    const description = document.createElement("p");
    description.textContent = course.description || "Sem descrição cadastrada.";

    const meta = document.createElement("div");
    meta.className = "admin-course-meta";
    meta.append(
      createBadge(formatCurrency(course.salePrice ?? course.price, course.currency)),
      createBadge(course.active === false ? "Inativo" : "Ativo"),
      createBadge(course.visible === false ? "Oculto" : "Visível")
    );

    const actions = document.createElement("div");
    actions.className = "admin-actions";

    const openLink = document.createElement("a");
    openLink.className = "app-button app-button-primary";
    openLink.href = `admin-course.html?id=${encodeURIComponent(course.id)}`;
    openLink.textContent = "Abrir curso";

    actions.append(
      openLink,
      createActionButton("Editar dados", "courseEdit", course.id),
      createActionButton(course.active === false ? "Ativar" : "Desativar", "courseToggleActive", course.id),
      createActionButton(course.visible === false ? "Mostrar" : "Ocultar", "courseToggleVisible", course.id)
    );

    item.append(eyebrow, title, description, meta, actions);
    els.courseList.appendChild(item);
  });
}

function resetCourseForm() {
  els.courseForm?.reset();
  if ($("[data-course-edit-id]")) $("[data-course-edit-id]").value = "";
  if ($("[data-course-currency]")) $("[data-course-currency]").value = "BRL";
  if ($("[data-course-order]")) $("[data-course-order]").value = "1";
  if ($("[data-course-active]")) $("[data-course-active]").checked = true;
  if ($("[data-course-visible]")) $("[data-course-visible]").checked = true;
  setMessage(els.courseMessage, "", "muted");
}

function editCourse(courseId) {
  const course = getCourseById(courseId);
  if (!course) return;

  $("[data-course-edit-id]").value = course.id;
  $("[data-course-title]").value = course.title || "";
  $("[data-course-slug]").value = course.slug || course.id;
  $("[data-course-description]").value = course.description || "";
  $("[data-course-price]").value = course.price ?? "";
  $("[data-course-sale-price]").value = course.salePrice ?? "";
  $("[data-course-currency]").value = course.currency || "BRL";
  $("[data-course-payment-link]").value = course.paymentLink || "";
  $("[data-course-order]").value = course.order ?? 1;
  $("[data-course-active]").checked = course.active !== false;
  $("[data-course-visible]").checked = course.visible !== false;
  setMessage(els.courseMessage, `Editando curso: ${course.title || course.id}`, "muted");
  els.courseForm?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveCourse(event) {
  event.preventDefault();
  const title = $("[data-course-title]").value.trim();
  if (!title) {
    setMessage(els.courseMessage, "Título obrigatório.", "error");
    return;
  }

  const editId = $("[data-course-edit-id]").value.trim();
  const slug = slugify($("[data-course-slug]").value || title);
  if (!slug) {
    setMessage(els.courseMessage, "Slug obrigatório.", "error");
    return;
  }

  const courseId = editId || slug;
  const paymentInput = $("[data-course-payment-link]").value.trim();
  const paymentLink = safeHttpUrl(paymentInput);
  if (paymentInput && !paymentLink) {
    setMessage(els.courseMessage, "O link de pagamento deve ser uma URL HTTPS válida.", "error");
    return;
  }
  const payload = {
    title,
    slug,
    description: $("[data-course-description]").value.trim(),
    price: toNumber($("[data-course-price]").value, 0),
    currency: ($("[data-course-currency]").value.trim() || "BRL").toUpperCase(),
    salePrice: optionalNumber($("[data-course-sale-price]").value),
    paymentLink,
    active: $("[data-course-active]").checked,
    visible: $("[data-course-visible]").checked,
    order: toNumber($("[data-course-order]").value, 1),
    updatedAt: serverTimestamp(),
  };

  try {
    const courseRef = doc(db, "courses", courseId);
    const existing = await getDoc(courseRef);
    if (!existing.exists()) payload.createdAt = serverTimestamp();

    await setDoc(courseRef, payload, { merge: true });
    setMessage(els.courseMessage, "Curso salvo com sucesso.");
    resetCourseForm();
    await loadCourses();
  } catch (error) {
    setError(els.courseMessage, "Erro ao salvar curso.", error);
  }
}

async function toggleCourseField(courseId, field) {
  const course = getCourseById(courseId);
  if (!course) return;

  try {
    await updateDoc(doc(db, "courses", courseId), {
      [field]: course[field] === false,
      updatedAt: serverTimestamp(),
    });
    setMessage(els.courseMessage, "Curso atualizado com sucesso.");
    await loadCourses();
  } catch (error) {
    setError(els.courseMessage, "Erro ao atualizar curso.", error);
  }
}

async function loadUsers() {
  if (els.userState) {
    els.userState.hidden = false;
    els.userState.textContent = "Carregando dados...";
  }

  try {
    const snapshot = await getDocs(collection(db, "users"));
    state.users = snapshot.docs
      .map((userDoc) => ({ id: userDoc.id, ...userDoc.data() }))
      .sort((a, b) => String(a.name || a.email || a.id).localeCompare(String(b.name || b.email || b.id)));
    renderUsers();
    updateSummary();
  } catch (error) {
    setStateError(els.userState, "Erro ao carregar usuários.", error);
  }
}

function renderUsers() {
  if (!els.userList || !els.userState) return;
  els.userList.replaceChildren();

  if (!state.users.length) {
    els.userState.hidden = false;
    els.userState.textContent = "Nenhum usuário encontrado.";
    return;
  }

  els.userState.hidden = true;
  state.users.forEach((user) => {
    const item = document.createElement("article");
    item.className = "admin-course-item compact";

    const eyebrow = document.createElement("span");
    eyebrow.textContent = user.id;

    const title = document.createElement("strong");
    title.textContent = user.name || user.email || user.id;

    const description = document.createElement("p");
    description.textContent = user.email || "Sem e-mail cadastrado.";

    const meta = document.createElement("div");
    meta.className = "admin-course-meta";
    meta.append(
      createBadge(displayRole(user.role)),
      createBadge(user.active === false ? "Inativo" : "Ativo"),
      createBadge("Matrículas gerenciadas por curso")
    );

    const actions = document.createElement("div");
    actions.className = "admin-actions";
    actions.append(
      createActionButton("Editar", "userEdit", user.id),
      createActionButton(user.active === false ? "Ativar" : "Desativar", "userToggleActive", user.id)
    );

    item.append(eyebrow, title, description, meta, actions);
    els.userList.appendChild(item);
  });
}

function resetUserForm() {
  els.userForm?.reset();
  if ($("[data-user-edit-id]")) $("[data-user-edit-id]").value = "";
  if ($("[data-user-role]")) $("[data-user-role]").value = "estudante";
  if ($("[data-user-active]")) $("[data-user-active]").checked = true;
  if ($("[data-user-uid]")) {
    $("[data-user-uid]").value = "";
    $("[data-user-uid]").disabled = false;
  }
  setMessage(els.userMessage, "", "muted");
}

function editUser(userId) {
  const user = getUserById(userId);
  if (!user) return;

  $("[data-user-edit-id]").value = user.id;
  $("[data-user-uid]").value = user.id;
  $("[data-user-uid]").disabled = true;
  $("[data-user-name]").value = user.name || "";
  $("[data-user-email]").value = user.email || "";
  $("[data-user-role]").value = normalizeRole(user.role);
  $("[data-user-active]").checked = user.active !== false;
  setMessage(els.userMessage, `Editando perfil: ${user.name || user.email || user.id}`, "muted");
  els.userForm?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveUserProfile(event) {
  event.preventDefault();
  const editId = $("[data-user-edit-id]").value.trim();
  const uid = (editId || $("[data-user-uid]").value).trim();
  const name = $("[data-user-name]").value.trim();
  const email = $("[data-user-email]").value.trim();

  if (!uid || !name || !email) {
    setMessage(els.userMessage, "UID, nome e e-mail são obrigatórios.", "error");
    return;
  }

  try {
    const userRef = doc(db, "users", uid);
    const existing = await getDoc(userRef);
    const existingData = existing.exists() ? existing.data() : null;
    const payload = {
      name,
      email,
      role: normalizeRole($("[data-user-role]").value),
      active: $("[data-user-active]").checked,
      updatedAt: serverTimestamp(),
    };

    if (!existing.exists()) payload.createdAt = serverTimestamp();

    await setDoc(userRef, payload, { merge: true });
    setMessage(els.userMessage, "Perfil de usuário salvo.");
    resetUserForm();
    await loadUsers();
  } catch (error) {
    setError(els.userMessage, "Erro ao salvar perfil.", error);
  }
}

async function toggleUserActive(userId) {
  const user = getUserById(userId);
  if (!user) return;

  try {
    await updateDoc(doc(db, "users", userId), {
      active: user.active === false,
      updatedAt: serverTimestamp(),
    });
    setMessage(els.userMessage, "Perfil de usuário salvo.");
    await loadUsers();
  } catch (error) {
    setError(els.userMessage, "Erro ao salvar perfil.", error);
  }
}

async function loadEnrollmentsSummary() {
  try {
    const snapshot = await getDocs(query(collection(db, "enrollments"), where("status", "==", "active")));
    state.enrollments = snapshot.docs.map((enrollmentDoc) => ({ id: enrollmentDoc.id, ...enrollmentDoc.data() }));
    updateSummary();
  } catch (error) {
    logAdminError("Erro ao carregar resumo de matrículas.", error);
  }
}

function bindEvents() {
  els.courseForm?.addEventListener("submit", saveCourse);
  els.userForm?.addEventListener("submit", saveUserProfile);

  $("[data-course-new]")?.addEventListener("click", resetCourseForm);
  $("[data-course-cancel]")?.addEventListener("click", resetCourseForm);
  $("[data-user-new]")?.addEventListener("click", resetUserForm);
  $("[data-user-cancel]")?.addEventListener("click", resetUserForm);

  els.courseList?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.courseEdit) editCourse(button.dataset.courseEdit);
    if (button.dataset.courseToggleActive) toggleCourseField(button.dataset.courseToggleActive, "active");
    if (button.dataset.courseToggleVisible) toggleCourseField(button.dataset.courseToggleVisible, "visible");
  });

  els.userList?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.userEdit) editUser(button.dataset.userEdit);
    if (button.dataset.userToggleActive) toggleUserActive(button.dataset.userToggleActive);
  });

  els.leadFilter?.addEventListener("change", renderLeads);
  els.leadList?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-lead-status]");
    if (!button) return;
    const separator = button.dataset.leadStatus.lastIndexOf(":");
    updateLeadStatus(button.dataset.leadStatus.slice(0, separator), button.dataset.leadStatus.slice(separator + 1));
  });
}

async function initAdminPage() {
  bindEvents();
  const result = await requireAdmin();
  if (!result) return;

  const { user, profile, authorized, message } = result;
  const role = normalizeRole(profile?.role);
  state.adminUser = user;
  state.adminProfile = profile;

  if (els.adminProfile) {
    const name = getDisplayName(user, profile);
    els.adminProfile.textContent = `${name} · ${displayRole(profile?.role)}`;
  }

  if (!authorized) {
    setAdminState("", false);
    if (els.adminDenied) els.adminDenied.hidden = false;
    if (els.adminContent) els.adminContent.hidden = true;
    if (els.adminDeniedMessage) {
      els.adminDeniedMessage.textContent =
        message ||
        (role === "mod"
          ? "Seu perfil ainda não possui funções administrativas liberadas."
          : "Você não tem permissão para acessar esta área.");
    }
    return;
  }

  setAdminState("", false);
  if (els.adminDenied) els.adminDenied.hidden = true;
  if (els.adminContent) els.adminContent.hidden = false;

  await Promise.all([loadCourses(), loadUsers(), loadEnrollmentsSummary(), loadLeads()]);
}

initAdminPage().catch((error) => {
  logAdminError("Erro ao iniciar painel admin.", error);
  setAdminState(formatFirebaseError(error));
  if (els.adminContent) els.adminContent.hidden = true;
});
