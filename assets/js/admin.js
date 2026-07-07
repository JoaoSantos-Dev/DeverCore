import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { auth } from "./firebase.js";
import { db } from "./firebase.js";
import { displayRole, getDisplayName, logout, normalizeRole, requireAdmin } from "./auth.js";

const state = {
  adminUser: null,
  adminProfile: null,
  courses: [],
  users: [],
  enrollments: [],
  certificates: [],
  modules: [],
  lessons: [],
  selectedCourseId: "",
  selectedModuleId: "",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const els = {
  adminProfile: $("[data-admin-profile]"),
  adminState: $("[data-admin-state]"),
  adminDenied: $("[data-admin-denied]"),
  adminDeniedMessage: $("[data-admin-denied-message]"),
  adminContent: $("[data-admin-content]"),
  courseForm: $("[data-course-form]"),
  courseMessage: $("[data-course-message]"),
  courseList: $("[data-admin-course-list]"),
  courseState: $("[data-admin-courses-state]"),
  userForm: $("[data-user-form]"),
  userMessage: $("[data-user-message]"),
  userList: $("[data-admin-user-list]"),
  userState: $("[data-admin-users-state]"),
  contentCourse: $("[data-content-course]"),
  contentModule: $("[data-content-module]"),
  moduleForm: $("[data-module-form]"),
  moduleMessage: $("[data-module-message]"),
  moduleList: $("[data-admin-module-list]"),
  lessonForm: $("[data-lesson-form]"),
  lessonMessage: $("[data-lesson-message]"),
  lessonList: $("[data-admin-lesson-list]"),
  lessonPreview: $("[data-lesson-preview]"),
  enrollmentForm: $("[data-enrollment-form]"),
  enrollmentUser: $("[data-enrollment-user]"),
  enrollmentCourse: $("[data-enrollment-course]"),
  enrollmentMessage: $("[data-enrollment-message]"),
  enrollmentList: $("[data-admin-enrollment-list]"),
  enrollmentState: $("[data-admin-enrollments-state]"),
  priceList: $("[data-admin-price-list]"),
  priceMessage: $("[data-price-message]"),
  certificateForm: $("[data-certificate-form]"),
  certificateUser: $("[data-certificate-user]"),
  certificateCourse: $("[data-certificate-course]"),
  certificateMessage: $("[data-certificate-message]"),
  certificateList: $("[data-admin-certificate-list]"),
  certificateState: $("[data-admin-certificates-state]"),
};

$$("[data-logout]").forEach((button) => {
  button.addEventListener("click", logout);
});

$$("[data-admin-panel-target]").forEach((button) => {
  button.addEventListener("click", () => showPanel(button.dataset.adminPanelTarget));
});

function showPanel(target) {
  $$("[data-admin-panel]").forEach((panel) => {
    const isActive = panel.dataset.adminPanel === target;
    panel.hidden = !isActive;
    panel.classList.toggle("is-active", isActive);
  });
}

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
  const code = error?.code || "";
  const message = error?.message || fallback;
  return `Erro: ${code} ${message}`.trim();
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

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency || "BRL",
  }).format(number);
}

function sortByOrder(items) {
  return [...items].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function optionTextUser(user) {
  return `${user.name || user.email || user.id} · ${user.email || user.id}`;
}

function optionTextCourse(course) {
  return course.title || course.id;
}

function fillSelect(select, items, placeholder, getLabel = (item) => item.title || item.id) {
  if (!select) return;
  const currentValue = select.value;
  select.replaceChildren();

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = placeholder;
  select.appendChild(empty);

  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = getLabel(item);
    select.appendChild(option);
  });

  if (items.some((item) => item.id === currentValue)) {
    select.value = currentValue;
  }
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

function getModuleById(moduleId) {
  return state.modules.find((module) => module.id === moduleId) || null;
}

async function debugFirestoreConnection() {
  console.log("[DEBUG] Testando conexão Firestore");

  const user = auth.currentUser;
  console.log("[DEBUG] Auth user:", user);

  if (!user) {
    console.error("[DEBUG] Nenhum usuário autenticado");
    return;
  }

  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  console.log("[DEBUG] users/{uid} exists:", userSnap.exists());
  console.log("[DEBUG] users/{uid} data:", userSnap.exists() ? userSnap.data() : null);

  const coursesSnap = await getDocs(collection(db, "courses"));
  console.log("[DEBUG] cursos encontrados:", coursesSnap.size);
  coursesSnap.forEach((courseDoc) => console.log("[DEBUG] Curso:", courseDoc.id, courseDoc.data()));
}

async function loadCourses() {
  console.log("[ADMIN] Carregando cursos...");
  console.log("[ADMIN] Usuário:", state.adminUser?.uid || auth.currentUser?.uid, state.adminUser?.email || auth.currentUser?.email);
  console.log("[ADMIN] Perfil:", state.adminProfile);
  if (els.courseState) {
    els.courseState.hidden = false;
    els.courseState.textContent = "Carregando dados...";
  }

  try {
    const snapshot = await getDocs(collection(db, "courses"));
    state.courses = sortByOrder(snapshot.docs.map((courseDoc) => ({ id: courseDoc.id, ...courseDoc.data() })));
    renderCourses();
    renderPriceList();
    refreshCourseSelects();
  } catch (error) {
    setStateError(els.courseState, "Erro ao carregar cursos.", error);
  }
}

function refreshCourseSelects() {
  fillSelect(els.contentCourse, state.courses, "Selecione um curso", optionTextCourse);
  fillSelect(els.enrollmentCourse, state.courses, "Selecione um curso", optionTextCourse);
  fillSelect(els.certificateCourse, state.courses, "Selecione um curso", optionTextCourse);
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
    actions.innerHTML = `
      <button class="app-button" type="button" data-course-edit="${course.id}">Editar</button>
      <button class="app-button" type="button" data-course-toggle-active="${course.id}">
        ${course.active === false ? "Ativar" : "Desativar"}
      </button>
      <button class="app-button" type="button" data-course-toggle-visible="${course.id}">
        ${course.visible === false ? "Mostrar" : "Ocultar"}
      </button>
    `;

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
  const payload = {
    title,
    slug,
    description: $("[data-course-description]").value.trim(),
    price: toNumber($("[data-course-price]").value, 0),
    currency: ($("[data-course-currency]").value.trim() || "BRL").toUpperCase(),
    salePrice: optionalNumber($("[data-course-sale-price]").value),
    paymentLink: $("[data-course-payment-link]").value.trim(),
    active: $("[data-course-active]").checked,
    visible: $("[data-course-visible]").checked,
    order: toNumber($("[data-course-order]").value, 1),
    updatedAt: serverTimestamp(),
  };

  try {
    console.log("[ADMIN] Tentando salvar curso:", payload);
    console.log("[ADMIN] Course ID:", courseId);

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
    refreshUserSelects();
  } catch (error) {
    setStateError(els.userState, "Erro ao carregar usuários.", error);
  }
}

function refreshUserSelects() {
  fillSelect(els.enrollmentUser, state.users, "Selecione um aluno", optionTextUser);
  fillSelect(els.certificateUser, state.users, "Selecione um aluno", optionTextUser);
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
    item.className = "admin-course-item";

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
      createBadge(`${Array.isArray(user.enrolledCourses) ? user.enrolledCourses.length : 0} cursos`)
    );

    const actions = document.createElement("div");
    actions.className = "admin-actions";
    actions.innerHTML = `
      <button class="app-button" type="button" data-user-edit="${user.id}">Editar</button>
      <button class="app-button" type="button" data-user-toggle-active="${user.id}">
        ${user.active === false ? "Ativar" : "Desativar"}
      </button>
    `;

    item.append(eyebrow, title, description, meta, actions);
    els.userList.appendChild(item);
  });
}

function resetUserForm() {
  els.userForm?.reset();
  $("[data-user-edit-id]").value = "";
  $("[data-user-role]").value = "estudante";
  $("[data-user-active]").checked = true;
  $("[data-user-uid]").disabled = false;
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
      enrolledCourses: Array.isArray(existingData?.enrolledCourses) ? existingData.enrolledCourses : [],
      updatedAt: serverTimestamp(),
    };

    if (!existing.exists()) {
      payload.createdAt = serverTimestamp();
    }

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

async function loadEnrollments() {
  if (els.enrollmentState) {
    els.enrollmentState.hidden = false;
    els.enrollmentState.textContent = "Carregando dados...";
  }

  try {
    const snapshot = await getDocs(collection(db, "enrollments"));
    state.enrollments = snapshot.docs.map((enrollmentDoc) => ({ id: enrollmentDoc.id, ...enrollmentDoc.data() }));
    renderEnrollments();
  } catch (error) {
    setStateError(els.enrollmentState, "Erro ao carregar matrículas.", error);
  }
}

function renderEnrollments() {
  if (!els.enrollmentList || !els.enrollmentState) return;
  els.enrollmentList.replaceChildren();

  if (!state.enrollments.length) {
    els.enrollmentState.hidden = false;
    els.enrollmentState.textContent = "Nenhuma matrícula encontrada.";
    return;
  }

  els.enrollmentState.hidden = true;
  state.enrollments.forEach((enrollment) => {
    const item = document.createElement("article");
    item.className = "admin-course-item";

    const eyebrow = document.createElement("span");
    eyebrow.textContent = enrollment.id;

    const title = document.createElement("strong");
    title.textContent = enrollment.userEmail || enrollment.userId || "Aluno";

    const description = document.createElement("p");
    description.textContent = enrollment.courseTitle || enrollment.courseId || "Curso";

    const meta = document.createElement("div");
    meta.className = "admin-course-meta";
    meta.append(createBadge(enrollment.status || "active"));

    const actions = document.createElement("div");
    actions.className = "admin-actions";
    const disabled = enrollment.status === "inactive" ? "disabled" : "";
    actions.innerHTML = `
      <button class="app-button" type="button" data-enrollment-remove="${enrollment.id}" ${disabled}>
        Remover acesso
      </button>
    `;

    item.append(eyebrow, title, description, meta, actions);
    els.enrollmentList.appendChild(item);
  });
}

async function enrollUserInCourse(event) {
  event.preventDefault();
  const userId = els.enrollmentUser?.value;
  const courseId = els.enrollmentCourse?.value;
  const user = getUserById(userId);
  const course = getCourseById(courseId);

  if (!user || !course) {
    setMessage(els.enrollmentMessage, "Aluno e curso são obrigatórios.", "error");
    return;
  }

  const enrollmentId = `${userId}_${courseId}`;
  const activeEnrollment = state.enrollments.find(
    (enrollment) => enrollment.id === enrollmentId && enrollment.status !== "inactive"
  );

  if (activeEnrollment) {
    setMessage(els.enrollmentMessage, "Este aluno já possui matrícula ativa neste curso.", "warning");
    return;
  }

  try {
    await setDoc(
      doc(db, "enrollments", enrollmentId),
      {
        userId,
        userEmail: user.email || "",
        courseId,
        courseTitle: course.title || courseId,
        status: "active",
        enrolledAt: serverTimestamp(),
        completedAt: null,
        certificateIssued: false,
      },
      { merge: true }
    );

    await updateDoc(doc(db, "users", userId), {
      enrolledCourses: arrayUnion(courseId),
      updatedAt: serverTimestamp(),
    });

    setMessage(els.enrollmentMessage, "Aluno matriculado com sucesso.");
    els.enrollmentForm?.reset();
    await Promise.all([loadUsers(), loadEnrollments()]);
  } catch (error) {
    setError(els.enrollmentMessage, "Erro ao matricular aluno.", error);
  }
}

async function removeUserFromCourse(enrollmentId) {
  const enrollment = state.enrollments.find((item) => item.id === enrollmentId);
  if (!enrollment) return;

  try {
    await updateDoc(doc(db, "enrollments", enrollmentId), {
      status: "inactive",
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "users", enrollment.userId), {
      enrolledCourses: arrayRemove(enrollment.courseId),
      updatedAt: serverTimestamp(),
    });
    setMessage(els.enrollmentMessage, "Matrícula removida.");
    await Promise.all([loadUsers(), loadEnrollments()]);
  } catch (error) {
    setError(els.enrollmentMessage, "Erro ao remover matrícula.", error);
  }
}

async function loadModules(courseId = state.selectedCourseId) {
  state.selectedCourseId = courseId || "";
  state.modules = [];
  state.lessons = [];
  state.selectedModuleId = "";
  if (!state.selectedCourseId) {
    renderModules();
    renderLessons();
    fillSelect(els.contentModule, [], "Selecione um módulo");
    return;
  }

  try {
    const snapshot = await getDocs(collection(db, "courses", state.selectedCourseId, "modules"));
    state.modules = sortByOrder(snapshot.docs.map((moduleDoc) => ({ id: moduleDoc.id, ...moduleDoc.data() })));
    renderModules();
    fillSelect(els.contentModule, state.modules, "Selecione um módulo", (module) => module.title || module.id);
  } catch (error) {
    setError(els.moduleMessage, "Erro ao carregar módulos.", error);
  }
}

function renderModules() {
  if (!els.moduleList) return;
  els.moduleList.replaceChildren();

  if (!state.modules.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = state.selectedCourseId ? "Nenhum módulo encontrado." : "Selecione um curso.";
    els.moduleList.appendChild(empty);
    return;
  }

  state.modules.forEach((module) => {
    const item = document.createElement("article");
    item.className = "admin-course-item";

    const eyebrow = document.createElement("span");
    eyebrow.textContent = module.id;

    const title = document.createElement("strong");
    title.textContent = module.title || module.id;

    const description = document.createElement("p");
    description.textContent = module.description || "Sem descrição.";

    const meta = document.createElement("div");
    meta.className = "admin-course-meta";
    meta.append(createBadge(`Ordem ${module.order || 0}`), createBadge(module.active === false ? "Inativo" : "Ativo"));

    const actions = document.createElement("div");
    actions.className = "admin-actions";
    actions.innerHTML = `
      <button class="app-button" type="button" data-module-select="${module.id}">Aulas</button>
      <button class="app-button" type="button" data-module-edit="${module.id}">Editar</button>
    `;

    item.append(eyebrow, title, description, meta, actions);
    els.moduleList.appendChild(item);
  });
}

function resetModuleForm() {
  els.moduleForm?.reset();
  $("[data-module-edit-id]").value = "";
  $("[data-module-order]").value = "1";
  $("[data-module-active]").checked = true;
}

function editModule(moduleId) {
  const module = getModuleById(moduleId);
  if (!module) return;
  $("[data-module-edit-id]").value = module.id;
  $("[data-module-title]").value = module.title || "";
  $("[data-module-description]").value = module.description || "";
  $("[data-module-order]").value = module.order ?? 1;
  $("[data-module-active]").checked = module.active !== false;
  setMessage(els.moduleMessage, `Editando módulo: ${module.title || module.id}`, "muted");
}

async function saveModule(event) {
  event.preventDefault();
  if (!state.selectedCourseId) {
    setMessage(els.moduleMessage, "Selecione um curso.", "error");
    return;
  }

  const title = $("[data-module-title]").value.trim();
  if (!title) {
    setMessage(els.moduleMessage, "Título obrigatório.", "error");
    return;
  }

  const editId = $("[data-module-edit-id]").value.trim();
  const moduleId = editId || slugify(title) || `modulo-${Date.now()}`;
  const payload = {
    title,
    description: $("[data-module-description]").value.trim(),
    order: toNumber($("[data-module-order]").value, 1),
    active: $("[data-module-active]").checked,
    updatedAt: serverTimestamp(),
  };

  try {
    const moduleRef = doc(db, "courses", state.selectedCourseId, "modules", moduleId);
    const existing = await getDoc(moduleRef);
    if (!existing.exists()) payload.createdAt = serverTimestamp();

    await setDoc(moduleRef, payload, { merge: true });
    setMessage(els.moduleMessage, "Módulo salvo com sucesso.");
    resetModuleForm();
    await loadModules();
  } catch (error) {
    setError(els.moduleMessage, "Erro ao salvar módulo.", error);
  }
}

async function loadLessons(moduleId = state.selectedModuleId) {
  state.selectedModuleId = moduleId || "";
  state.lessons = [];
  if (!state.selectedCourseId || !state.selectedModuleId) {
    renderLessons();
    return;
  }

  try {
    const snapshot = await getDocs(
      collection(db, "courses", state.selectedCourseId, "modules", state.selectedModuleId, "lessons")
    );
    state.lessons = sortByOrder(snapshot.docs.map((lessonDoc) => ({ id: lessonDoc.id, ...lessonDoc.data() })));
    renderLessons();
  } catch (error) {
    setError(els.lessonMessage, "Erro ao carregar aulas.", error);
  }
}

function renderLessons() {
  if (!els.lessonList) return;
  els.lessonList.replaceChildren();

  if (!state.lessons.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = state.selectedModuleId ? "Nenhuma aula encontrada." : "Selecione um módulo.";
    els.lessonList.appendChild(empty);
    return;
  }

  state.lessons.forEach((lesson) => {
    const item = document.createElement("article");
    item.className = "admin-course-item";

    const eyebrow = document.createElement("span");
    eyebrow.textContent = `${lesson.id} · ${lesson.type || "text"}`;

    const title = document.createElement("strong");
    title.textContent = lesson.title || lesson.id;

    const description = document.createElement("p");
    description.textContent = lesson.content || lesson.mediaUrl || "Sem conteúdo.";

    const meta = document.createElement("div");
    meta.className = "admin-course-meta";
    meta.append(
      createBadge(`Ordem ${lesson.order || 0}`),
      createBadge(lesson.published === false ? "Não publicada" : "Publicada")
    );

    const actions = document.createElement("div");
    actions.className = "admin-actions";
    actions.innerHTML = `
      <button class="app-button" type="button" data-lesson-edit="${lesson.id}">Editar</button>
      <button class="app-button" type="button" data-lesson-toggle="${lesson.id}">
        ${lesson.published === false ? "Publicar" : "Despublicar"}
      </button>
    `;

    item.append(eyebrow, title, description, meta, actions);
    els.lessonList.appendChild(item);
  });
}

function resetLessonForm() {
  els.lessonForm?.reset();
  $("[data-lesson-edit-id]").value = "";
  $("[data-lesson-type]").value = "text";
  $("[data-lesson-order]").value = "1";
  $("[data-lesson-published]").checked = true;
}

function editLesson(lessonId) {
  const lesson = state.lessons.find((item) => item.id === lessonId);
  if (!lesson) return;
  $("[data-lesson-edit-id]").value = lesson.id;
  $("[data-lesson-title]").value = lesson.title || "";
  $("[data-lesson-type]").value = lesson.type || "text";
  $("[data-lesson-content]").value = lesson.content || "";
  $("[data-lesson-media-url]").value = lesson.mediaUrl || "";
  $("[data-lesson-order]").value = lesson.order ?? 1;
  $("[data-lesson-published]").checked = lesson.published !== false;
  renderLessonPreview(lesson);
  setMessage(els.lessonMessage, `Editando aula: ${lesson.title || lesson.id}`, "muted");
}

function getLessonFormData() {
  return {
    title: $("[data-lesson-title]").value.trim(),
    type: $("[data-lesson-type]").value,
    content: $("[data-lesson-content]").value.trim(),
    mediaUrl: $("[data-lesson-media-url]").value.trim(),
    order: toNumber($("[data-lesson-order]").value, 1),
    published: $("[data-lesson-published]").checked,
  };
}

function validateLesson(lesson) {
  if (!lesson.title) return "Título obrigatório.";
  if (lesson.type === "text" && !lesson.content) return "Conteúdo obrigatório para aula de texto.";
  if (lesson.type !== "text" && !lesson.mediaUrl) return "URL externa obrigatória para este tipo de aula.";
  return "";
}

async function saveLesson(event) {
  event.preventDefault();
  if (!state.selectedCourseId || !state.selectedModuleId) {
    setMessage(els.lessonMessage, "Selecione curso e módulo.", "error");
    return;
  }

  const lesson = getLessonFormData();
  const validationError = validateLesson(lesson);
  if (validationError) {
    setMessage(els.lessonMessage, validationError, "error");
    return;
  }

  const editId = $("[data-lesson-edit-id]").value.trim();
  const lessonId = editId || slugify(lesson.title) || `aula-${Date.now()}`;
  const payload = { ...lesson, updatedAt: serverTimestamp() };

  try {
    const lessonRef = doc(db, "courses", state.selectedCourseId, "modules", state.selectedModuleId, "lessons", lessonId);
    const existing = await getDoc(lessonRef);
    if (!existing.exists()) payload.createdAt = serverTimestamp();

    await setDoc(lessonRef, payload, { merge: true });
    setMessage(els.lessonMessage, "Aula salva com sucesso.");
    resetLessonForm();
    renderLessonPreview(null);
    await loadLessons();
  } catch (error) {
    setError(els.lessonMessage, "Erro ao salvar aula.", error);
  }
}

async function toggleLessonPublished(lessonId) {
  const lesson = state.lessons.find((item) => item.id === lessonId);
  if (!lesson || !state.selectedCourseId || !state.selectedModuleId) return;

  try {
    await updateDoc(doc(db, "courses", state.selectedCourseId, "modules", state.selectedModuleId, "lessons", lessonId), {
      published: lesson.published === false,
      updatedAt: serverTimestamp(),
    });
    setMessage(els.lessonMessage, "Aula salva com sucesso.");
    await loadLessons();
  } catch (error) {
    setError(els.lessonMessage, "Erro ao salvar aula.", error);
  }
}

function getYouTubeEmbedUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace("www.", "");
    let videoId = "";

    if (host === "youtu.be") videoId = parsed.pathname.slice(1);
    if (host.endsWith("youtube.com") && parsed.pathname === "/watch") videoId = parsed.searchParams.get("v") || "";
    if (host.endsWith("youtube.com") && parsed.pathname.startsWith("/embed/")) {
      videoId = parsed.pathname.split("/")[2] || "";
    }
    if (host.endsWith("youtube.com") && parsed.pathname.startsWith("/shorts/")) {
      videoId = parsed.pathname.split("/")[2] || "";
    }

    return videoId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}` : "";
  } catch (error) {
    return "";
  }
}

function renderLessonPreview(lesson = getLessonFormData()) {
  if (!els.lessonPreview) return;
  els.lessonPreview.replaceChildren();

  if (!lesson || (!lesson.content && !lesson.mediaUrl && !lesson.title)) {
    const placeholder = document.createElement("p");
    placeholder.className = "lesson-placeholder";
    placeholder.textContent = "Preview da aula.";
    els.lessonPreview.appendChild(placeholder);
    return;
  }

  const header = document.createElement("div");
  header.className = "lesson-header";
  const type = document.createElement("span");
  type.textContent = lesson.type || "text";
  const title = document.createElement("h2");
  title.textContent = lesson.title || "Aula";
  header.append(type, title);
  els.lessonPreview.appendChild(header);

  const content = document.createElement("p");
  content.className = "lesson-text";
  content.textContent = lesson.content || "";
  els.lessonPreview.appendChild(content);

  if (lesson.type === "image" && lesson.mediaUrl) {
    const image = document.createElement("img");
    image.className = "lesson-image";
    image.src = lesson.mediaUrl;
    image.alt = lesson.title || "Imagem da aula";
    els.lessonPreview.appendChild(image);
  }

  if (lesson.type === "video" && lesson.mediaUrl) {
    const embed = getYouTubeEmbedUrl(lesson.mediaUrl);
    if (embed) {
      const frame = document.createElement("iframe");
      frame.className = "lesson-video";
      frame.src = embed;
      frame.title = lesson.title || "Vídeo da aula";
      frame.allowFullscreen = true;
      els.lessonPreview.appendChild(frame);
    } else {
      els.lessonPreview.appendChild(createPreviewLink(lesson.mediaUrl, "Abrir vídeo"));
    }
  }

  if ((lesson.type === "live" || lesson.type === "link") && lesson.mediaUrl) {
    els.lessonPreview.appendChild(createPreviewLink(lesson.mediaUrl, lesson.type === "live" ? "Acessar live" : "Abrir material"));
  }
}

function createPreviewLink(url, label) {
  const link = document.createElement("a");
  link.className = "app-button app-button-secondary";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  return link;
}

function renderPriceList() {
  if (!els.priceList) return;
  els.priceList.replaceChildren();

  if (!state.courses.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Nenhum curso encontrado.";
    els.priceList.appendChild(empty);
    return;
  }

  state.courses.forEach((course) => {
    const item = document.createElement("article");
    item.className = "admin-course-item";

    const id = document.createElement("span");
    id.textContent = course.id;

    const title = document.createElement("strong");
    title.textContent = course.title || course.id;

    const formGrid = document.createElement("div");
    formGrid.className = "admin-form-grid compact";

    const priceInput = createAdminInput("Preço", "number", course.price ?? "");
    priceInput.input.min = "0";
    priceInput.input.step = "0.01";
    priceInput.input.dataset.priceValue = course.id;

    const saleInput = createAdminInput("Promocional", "number", course.salePrice ?? "");
    saleInput.input.min = "0";
    saleInput.input.step = "0.01";
    saleInput.input.dataset.priceSale = course.id;

    const linkInput = createAdminInput("Link de pagamento", "url", course.paymentLink || "");
    linkInput.label.classList.add("span-2");
    linkInput.input.dataset.priceLink = course.id;

    const visibleLabel = document.createElement("label");
    visibleLabel.className = "check-field";
    const visibleInput = document.createElement("input");
    visibleInput.type = "checkbox";
    visibleInput.checked = course.visible !== false;
    visibleInput.dataset.priceVisible = course.id;
    const visibleText = document.createElement("span");
    visibleText.textContent = "Visível";
    visibleLabel.append(visibleInput, visibleText);

    formGrid.append(priceInput.label, saleInput.label, linkInput.label, visibleLabel);

    const actions = document.createElement("div");
    actions.className = "admin-actions";
    const saveButton = document.createElement("button");
    saveButton.className = "app-button app-button-primary";
    saveButton.type = "button";
    saveButton.dataset.priceSave = course.id;
    saveButton.textContent = "Salvar preço";
    actions.appendChild(saveButton);

    item.append(id, title, formGrid, actions);
    els.priceList.appendChild(item);
  });
}

function createAdminInput(labelText, type, value) {
  const label = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = labelText;
  const input = document.createElement("input");
  input.type = type;
  input.value = value;
  label.append(span, input);
  return { label, input };
}

async function savePrice(courseId) {
  try {
    await updateDoc(doc(db, "courses", courseId), {
      price: toNumber($(`[data-price-value="${courseId}"]`).value, 0),
      salePrice: optionalNumber($(`[data-price-sale="${courseId}"]`).value),
      paymentLink: $(`[data-price-link="${courseId}"]`).value.trim(),
      visible: $(`[data-price-visible="${courseId}"]`).checked,
      updatedAt: serverTimestamp(),
    });
    setMessage(els.priceMessage, "Preço atualizado.");
    await loadCourses();
  } catch (error) {
    setError(els.priceMessage, "Erro ao atualizar preço.", error);
  }
}

async function loadCertificates() {
  if (els.certificateState) {
    els.certificateState.hidden = false;
    els.certificateState.textContent = "Carregando dados...";
  }

  try {
    const snapshot = await getDocs(collection(db, "certificates"));
    state.certificates = snapshot.docs.map((certificateDoc) => ({ id: certificateDoc.id, ...certificateDoc.data() }));
    renderCertificates();
  } catch (error) {
    setStateError(els.certificateState, "Erro ao carregar certificados.", error);
  }
}

function renderCertificates() {
  if (!els.certificateList || !els.certificateState) return;
  els.certificateList.replaceChildren();

  if (!state.certificates.length) {
    els.certificateState.hidden = false;
    els.certificateState.textContent = "Nenhum certificado encontrado.";
    return;
  }

  els.certificateState.hidden = true;
  state.certificates.forEach((certificate) => {
    const item = document.createElement("article");
    item.className = "admin-course-item";

    const code = document.createElement("span");
    code.textContent = certificate.certificateCode || certificate.id;

    const title = document.createElement("strong");
    title.textContent = certificate.userName || certificate.userId || "Aluno";

    const course = document.createElement("p");
    course.textContent = certificate.courseTitle || certificate.courseId || "Curso";

    const meta = document.createElement("div");
    meta.className = "admin-course-meta";
    meta.appendChild(createBadge(certificate.status || "issued"));

    item.append(code, title, course, meta);
    els.certificateList.appendChild(item);
  });
}

async function createCertificate(event) {
  event.preventDefault();
  const user = getUserById(els.certificateUser?.value);
  const course = getCourseById(els.certificateCourse?.value);

  if (!user || !course) {
    setMessage(els.certificateMessage, "Aluno e curso são obrigatórios.", "error");
    return;
  }

  const code = `DEVER-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  try {
    await setDoc(doc(db, "certificates", code), {
      userId: user.id,
      courseId: course.id,
      userName: user.name || user.email || user.id,
      courseTitle: course.title || course.id,
      issuedAt: serverTimestamp(),
      certificateCode: code,
      status: "issued",
    });
    setMessage(els.certificateMessage, "Certificado criado.");
    els.certificateForm?.reset();
    await loadCertificates();
  } catch (error) {
    setError(els.certificateMessage, "Erro ao criar certificado.", error);
  }
}

function bindEvents() {
  els.courseForm?.addEventListener("submit", saveCourse);
  els.userForm?.addEventListener("submit", saveUserProfile);
  els.enrollmentForm?.addEventListener("submit", enrollUserInCourse);
  els.moduleForm?.addEventListener("submit", saveModule);
  els.lessonForm?.addEventListener("submit", saveLesson);
  els.certificateForm?.addEventListener("submit", createCertificate);

  $("[data-course-new]")?.addEventListener("click", resetCourseForm);
  $("[data-course-cancel]")?.addEventListener("click", resetCourseForm);
  $("[data-user-new]")?.addEventListener("click", resetUserForm);
  $("[data-user-cancel]")?.addEventListener("click", resetUserForm);
  $("[data-module-new]")?.addEventListener("click", resetModuleForm);
  $("[data-module-cancel]")?.addEventListener("click", resetModuleForm);
  $("[data-lesson-new]")?.addEventListener("click", resetLessonForm);
  $("[data-lesson-cancel]")?.addEventListener("click", resetLessonForm);
  $("[data-lesson-preview-button]")?.addEventListener("click", () => renderLessonPreview());

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

  els.enrollmentList?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (button?.dataset.enrollmentRemove) removeUserFromCourse(button.dataset.enrollmentRemove);
  });

  els.moduleList?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.moduleEdit) editModule(button.dataset.moduleEdit);
    if (button.dataset.moduleSelect) {
      state.selectedModuleId = button.dataset.moduleSelect;
      if (els.contentModule) els.contentModule.value = state.selectedModuleId;
      loadLessons(state.selectedModuleId);
    }
  });

  els.lessonList?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.lessonEdit) editLesson(button.dataset.lessonEdit);
    if (button.dataset.lessonToggle) toggleLessonPublished(button.dataset.lessonToggle);
  });

  els.priceList?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (button?.dataset.priceSave) savePrice(button.dataset.priceSave);
  });

  els.contentCourse?.addEventListener("change", () => {
    loadModules(els.contentCourse.value);
  });

  els.contentModule?.addEventListener("change", () => {
    loadLessons(els.contentModule.value);
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

  await debugFirestoreConnection();
  await Promise.all([loadCourses(), loadUsers(), loadEnrollments(), loadCertificates()]);
  renderLessonPreview(null);
}

initAdminPage().catch((error) => {
  logAdminError("Erro ao iniciar painel admin.", error);
  setAdminState(formatFirebaseError(error));
  if (els.adminContent) els.adminContent.hidden = true;
});
