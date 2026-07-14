import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { logout, normalizeRole, requireAdmin } from "./auth.js";
import { safeHttpUrl } from "./url.js";

const state = {
  adminUser: null,
  adminProfile: null,
  courseId: "",
  course: null,
  users: [],
  enrollments: [],
  certificates: [],
  activities: [],
  progress: [],
  modules: [],
  selectedModuleId: "",
  editMode: false,
  expandedModules: new Set(),
  modalMode: "",
  draggedModuleId: "",
  enrollmentSearch: "",
  enrollmentFilter: "all",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const els = {
  courseTitle: $("[data-course-title]"),
  courseDescription: $("[data-course-description]"),
  courseMeta: $("[data-course-meta]"),
  studentView: $("[data-student-view]"),
  adminState: $("[data-admin-state]"),
  adminDenied: $("[data-admin-denied]"),
  adminDeniedMessage: $("[data-admin-denied-message]"),
  adminContent: $("[data-admin-content]"),
  summaryModules: $("[data-summary-modules]"),
  summaryLessons: $("[data-summary-lessons]"),
  summaryStudents: $("[data-summary-students]"),
  summaryCertificates: $("[data-summary-certificates]"),
  summaryProgress: $("[data-summary-progress]"),
  summaryPrice: $("[data-summary-price]"),
  overviewForm: $("[data-overview-form]"),
  overviewMessage: $("[data-overview-message]"),
  moduleForm: $("[data-module-form]"),
  moduleMessage: $("[data-module-message]"),
  moduleList: $("[data-admin-module-list]"),
  lessonForm: $("[data-lesson-form]"),
  lessonMessage: $("[data-lesson-message]"),
  lessonPreview: $("[data-lesson-preview]"),
  editModeToggle: $("[data-edit-mode-toggle]"),
  contentNote: $("[data-content-note]"),
  contentModal: $("[data-content-modal]"),
  modalKicker: $("[data-content-modal-kicker]"),
  modalTitle: $("[data-content-modal-title]"),
  lessonTypePicker: $("[data-lesson-type-picker]"),
  lessonMediaField: $("[data-lesson-media-field]"),
  lessonCompletionThresholdField: $("[data-lesson-completion-threshold-field]"),
  lessonMediaLabel: $("[data-lesson-media-label]"),
  lessonContentLabel: $("[data-lesson-content-label]"),
  enrollmentForm: $("[data-enrollment-form]"),
  enrollmentUser: $("[data-enrollment-user]"),
  enrollmentMessage: $("[data-enrollment-message]"),
  enrollmentState: $("[data-enrollment-state]"),
  enrollmentList: $("[data-enrollment-list]"),
  enrollmentSearch: $("[data-enrollment-search]"),
  enrollmentFilter: $("[data-enrollment-filter]"),
  pricingForm: $("[data-pricing-form]"),
  pricingMessage: $("[data-pricing-message]"),
  certificateForm: $("[data-certificate-form]"),
  certificateUser: $("[data-certificate-user]"),
  certificateMessage: $("[data-certificate-message]"),
  certificateState: $("[data-certificate-state]"),
  certificateList: $("[data-certificate-list]"),
  historyState: $("[data-history-state]"),
  historyList: $("[data-history-list]"),
  settingsForm: $("[data-settings-form]"),
  settingsMessage: $("[data-settings-message]"),
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
  console.error(`[ADMIN-COURSE] ${context}`);
  console.error("[ADMIN-COURSE] Erro completo:", error);
  console.error("[ADMIN-COURSE] Código:", error?.code);
  console.error("[ADMIN-COURSE] Mensagem:", error?.message);
}

function setError(element, context, error) {
  logAdminError(context, error);
  setMessage(element, formatFirebaseError(error), "error");
}

async function recordActivity(action, details) {
  if (!state.adminUser || !state.courseId) return;

  try {
    const activityRef = doc(collection(db, "courseActivities"));
    const activity = {
      courseId: state.courseId,
      action,
      details,
      actorId: state.adminUser.uid,
      actorName: state.adminProfile?.name || state.adminUser.email || "Administrador",
      createdAt: serverTimestamp(),
    };
    await setDoc(activityRef, activity);
    state.activities.unshift({ ...activity, id: activityRef.id, createdAt: new Date() });
    renderActivities();
  } catch (error) {
    console.warn("[ADMIN-COURSE] Não foi possível registrar a atividade:", error);
  }
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

function formatDate(value) {
  if (!value) return "Sem data";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function sortByOrder(items) {
  return [...items].sort((a, b) => {
    const orderA = Number(a.order || 999);
    const orderB = Number(b.order || 999);
    if (orderA !== orderB) return orderA - orderB;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

function getNextOrder(items) {
  const maxOrder = items.reduce((max, item) => {
    const order = Number(item.order || 0);
    return Number.isFinite(order) && order > max ? order : max;
  }, 0);
  return maxOrder + 1;
}

function getVisualNumber(index) {
  return String(index + 1).padStart(2, "0");
}

function createBadge(text) {
  const badge = document.createElement("span");
  badge.textContent = text;
  return badge;
}

function createActionButton(label, datasetKey, value, variant = "") {
  const button = document.createElement("button");
  button.className = variant ? `app-button ${variant}` : "app-button";
  button.type = "button";
  button.dataset[datasetKey] = value;
  button.textContent = label;
  return button;
}

function getCourseId() {
  return new URLSearchParams(window.location.search).get("id") || "";
}

function getModuleById(moduleId) {
  return state.modules.find((module) => module.id === moduleId) || null;
}

function getLessonById(moduleId, lessonId) {
  const module = getModuleById(moduleId);
  return module?.lessons?.find((lesson) => lesson.id === lessonId) || null;
}

function getUserById(userId) {
  return state.users.find((user) => user.id === userId) || null;
}

function optionTextUser(user) {
  return `${user.name || user.email || user.id} · ${user.email || user.id}`;
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

function setupCourseTabs() {
  $$("[data-course-tab-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.courseTabTarget;
      $$("[data-course-tab-target]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      $$("[data-course-panel]").forEach((panel) => {
        const isActive = panel.dataset.coursePanel === target;
        panel.hidden = !isActive;
        panel.classList.toggle("is-active", isActive);
      });
    });
  });
}

function setModalTitle(kicker, title) {
  if (els.modalKicker) els.modalKicker.textContent = kicker;
  if (els.modalTitle) els.modalTitle.textContent = title;
}

function hideContentModal() {
  if (!els.contentModal) return;
  els.contentModal.hidden = true;
  state.modalMode = "";
  if (els.moduleForm) els.moduleForm.hidden = true;
  if (els.lessonForm) els.lessonForm.hidden = true;
  if (els.lessonTypePicker) els.lessonTypePicker.hidden = true;
  if (els.lessonPreview) els.lessonPreview.hidden = true;
}

function showContentModal(mode) {
  if (!els.contentModal) return;
  state.modalMode = mode;
  els.contentModal.hidden = false;
  if (els.moduleForm) els.moduleForm.hidden = mode !== "module";
  if (els.lessonForm) els.lessonForm.hidden = mode !== "lesson";
  if (els.lessonTypePicker) els.lessonTypePicker.hidden = mode !== "type";
  if (els.lessonPreview) els.lessonPreview.hidden = mode !== "preview";
}

function toggleEditMode() {
  state.editMode = !state.editMode;
  if (els.editModeToggle) {
    els.editModeToggle.textContent = `Modo edição: ${state.editMode ? "ON" : "OFF"}`;
    els.editModeToggle.setAttribute("aria-pressed", String(state.editMode));
  }
  $$("[data-module-new]").forEach((button) => {
    button.hidden = !state.editMode;
  });
  if (els.contentNote) {
    els.contentNote.textContent = state.editMode
      ? "Modo edição ativo. Use os botões dos módulos e aulas para alterar a estrutura do curso."
      : "Ative o modo edição para alterar conteúdos. Com ele desligado, use a lista para revisar a estrutura do curso.";
  }
  renderModules();
}

function getLessonTypeLabel(type) {
  const labels = {
    text: "Texto",
    image: "Imagem",
    video: "Vídeo",
    live: "Live",
    link: "Link",
  };
  return labels[type] || type || "Texto";
}

function getLessonIcon(type) {
  const icons = {
    text: "TXT",
    image: "IMG",
    video: "VID",
    live: "LIVE",
    link: "URL",
  };
  return icons[type] || "TXT";
}

function syncLessonTypeFields() {
  const type = $("[data-lesson-type]")?.value || "text";
  const mediaRequired = type !== "text";

  if (els.lessonMediaField) els.lessonMediaField.hidden = !mediaRequired;
  if (els.lessonCompletionThresholdField) els.lessonCompletionThresholdField.hidden = type !== "video";
  if ($("[data-lesson-media-url]")) $("[data-lesson-media-url]").required = mediaRequired;
  if ($("[data-lesson-content]")) $("[data-lesson-content]").required = type === "text";
  if (els.lessonMediaLabel) {
    els.lessonMediaLabel.textContent =
      type === "image"
        ? "URL da imagem"
        : type === "video"
          ? "URL do vídeo"
          : type === "live"
            ? "URL da live"
            : "URL externa";
  }
  if (els.lessonContentLabel) {
    els.lessonContentLabel.textContent = type === "text" ? "Conteúdo" : "Descrição";
  }
}

function syncCourseForms() {
  const course = state.course || {};
  if ($("[data-overview-title]")) $("[data-overview-title]").value = course.title || "";
  if ($("[data-overview-id]")) $("[data-overview-id]").value = state.courseId;
  if ($("[data-overview-description]")) $("[data-overview-description]").value = course.description || "";
  if ($("[data-overview-order]")) $("[data-overview-order]").value = course.order ?? 1;
  if ($("[data-overview-active]")) $("[data-overview-active]").checked = course.active !== false;
  if ($("[data-overview-visible]")) $("[data-overview-visible]").checked = course.visible !== false;

  if ($("[data-price]")) $("[data-price]").value = course.price ?? "";
  if ($("[data-sale-price]")) $("[data-sale-price]").value = course.salePrice ?? "";
  if ($("[data-currency]")) $("[data-currency]").value = course.currency || "BRL";
  if ($("[data-payment-link]")) $("[data-payment-link]").value = course.paymentLink || "";
  if ($("[data-price-active]")) $("[data-price-active]").checked = course.active !== false;
  if ($("[data-price-visible]")) $("[data-price-visible]").checked = course.visible !== false;

  if ($("[data-settings-id]")) $("[data-settings-id]").value = state.courseId;
  if ($("[data-settings-order]")) $("[data-settings-order]").value = course.order ?? 1;
  if ($("[data-settings-active]")) $("[data-settings-active]").checked = course.active !== false;
  if ($("[data-settings-visible]")) $("[data-settings-visible]").checked = course.visible !== false;
}

function getEnrollmentRows() {
  const rows = new Map();

  state.enrollments
    .filter((enrollment) => enrollment.courseId === state.courseId)
    .forEach((enrollment) => {
      const user = getUserById(enrollment.userId);
      rows.set(enrollment.userId, {
        id: enrollment.id,
        userId: enrollment.userId,
        userName: enrollment.userName || user?.name || enrollment.userEmail || enrollment.userId,
        userEmail: enrollment.userEmail || user?.email || "",
        status: enrollment.status || "active",
        enrolledAt: enrollment.enrolledAt,
        certificateIssued: Boolean(enrollment.certificateIssued),
        hasEnrollmentDoc: true,
      });
    });

  return [...rows.values()].sort((a, b) => String(a.userName).localeCompare(String(b.userName)));
}

function getActiveEnrollmentRows() {
  return getEnrollmentRows().filter((row) => row.status !== "inactive");
}

function getPublishedLessons() {
  return state.modules.flatMap((module) => {
    if (module.active === false) return [];
    return (module.lessons || [])
      .filter((lesson) => lesson.published !== false)
      .map((lesson) => ({ ...lesson, moduleId: module.id }));
  });
}

function getUserCourseProgress(userId) {
  const publishedLessons = getPublishedLessons();
  const completed = new Set(
    state.progress
      .filter((item) => item.userId === userId && item.courseId === state.courseId && item.status === "completed")
      .map((item) => item.lessonId)
  );
  const completedCount = publishedLessons.filter((lesson) => completed.has(lesson.id)).length;
  const total = publishedLessons.length;
  const percent = total ? Math.round((completedCount / total) * 100) : 0;
  return { completedCount, total, percent };
}

function updateSummary() {
  const moduleCount = state.modules.length;
  const activeModuleCount = state.modules.filter((module) => module.active !== false).length;
  const lessons = state.modules.flatMap((module) => module.lessons || []);
  const lessonCount = lessons.length;
  const publishedLessonCount = state.modules.reduce(
    (total, module) => total + (module.active === false ? 0 : (module.lessons || []).filter((lesson) => lesson.published !== false).length),
    0
  );
  const activeStudents = getActiveEnrollmentRows();
  const issuedCertificates = state.certificates.filter((certificate) => certificate.status !== "revoked").length;
  const averageProgress = activeStudents.length
    ? Math.round(activeStudents.reduce((total, row) => total + getUserCourseProgress(row.userId).percent, 0) / activeStudents.length)
    : 0;

  if (els.summaryModules) els.summaryModules.textContent = `${activeModuleCount}/${moduleCount}`;
  if (els.summaryLessons) els.summaryLessons.textContent = `${publishedLessonCount}/${lessonCount}`;
  if (els.summaryStudents) els.summaryStudents.textContent = String(activeStudents.length);
  if (els.summaryCertificates) els.summaryCertificates.textContent = String(issuedCertificates);
  if (els.summaryProgress) els.summaryProgress.textContent = `${averageProgress}%`;
  if (els.summaryPrice) els.summaryPrice.textContent = formatCurrency(state.course?.salePrice ?? state.course?.price, state.course?.currency);
}

function getActivityDate(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime() || 0;
}

function renderActivities() {
  if (!els.historyList || !els.historyState) return;
  els.historyList.replaceChildren();

  if (!state.activities.length) {
    els.historyState.hidden = false;
    els.historyState.textContent = "Nenhuma ação registrada ainda neste curso.";
    return;
  }

  els.historyState.hidden = true;
  state.activities.forEach((activity) => {
    const item = document.createElement("article");
    item.className = "admin-course-item compact";
    const action = document.createElement("strong");
    action.textContent = activity.action || "Ação administrativa";
    const details = document.createElement("p");
    details.textContent = activity.details || "Sem detalhes.";
    const meta = document.createElement("div");
    meta.className = "admin-course-meta";
    meta.append(
      createBadge(activity.actorName || "Administrador"),
      createBadge(formatDate(activity.createdAt))
    );
    item.append(action, details, meta);
    els.historyList.appendChild(item);
  });
}

async function loadActivities() {
  const snapshot = await getDocs(query(collection(db, "courseActivities"), where("courseId", "==", state.courseId)));
  state.activities = snapshot.docs
    .map((activityDoc) => ({ id: activityDoc.id, ...activityDoc.data() }))
    .sort((a, b) => getActivityDate(b.createdAt) - getActivityDate(a.createdAt));
  renderActivities();
}

function renderCourseHeader() {
  const course = state.course || {};
  document.title = `${course.title || state.courseId} | Admin DEVER`;

  if (els.courseTitle) els.courseTitle.textContent = course.title || state.courseId;
  if (els.courseDescription) els.courseDescription.textContent = course.description || "Sem descrição cadastrada.";
  if (els.studentView) {
    els.studentView.href = `course.html?id=${encodeURIComponent(state.courseId)}`;
  }

  if (els.courseMeta) {
    els.courseMeta.replaceChildren(
      createBadge(state.courseId),
      createBadge(course.active === false ? "Inativo" : "Ativo"),
      createBadge(course.visible === false ? "Oculto" : "Visível"),
      createBadge(formatCurrency(course.salePrice ?? course.price, course.currency))
    );
  }

  syncCourseForms();
  updateSummary();
}

async function loadCourse() {
  const snapshot = await getDoc(doc(db, "courses", state.courseId));
  if (!snapshot.exists()) {
    throw new Error(`Curso ${state.courseId} não encontrado.`);
  }
  state.course = { id: snapshot.id, ...snapshot.data() };
  renderCourseHeader();
}

async function saveCourseOverview(event) {
  event.preventDefault();
  const title = $("[data-overview-title]").value.trim();
  if (!title) {
    setMessage(els.overviewMessage, "Título obrigatório.", "error");
    return;
  }

  try {
    await updateDoc(doc(db, "courses", state.courseId), {
      title,
      description: $("[data-overview-description]").value.trim(),
      order: toNumber($("[data-overview-order]").value, 1),
      active: $("[data-overview-active]").checked,
      visible: $("[data-overview-visible]").checked,
      updatedAt: serverTimestamp(),
    });
    setMessage(els.overviewMessage, "Dados do curso salvos.");
    await recordActivity("Dados do curso atualizados", `Título: ${title}`);
    await loadCourse();
  } catch (error) {
    setError(els.overviewMessage, "Erro ao salvar dados do curso.", error);
  }
}

function resetModuleForm() {
  els.moduleForm?.reset();
  if ($("[data-module-edit-id]")) $("[data-module-edit-id]").value = "";
  if ($("[data-module-order]")) $("[data-module-order]").value = "1";
  if ($("[data-module-active]")) $("[data-module-active]").checked = true;
  setMessage(els.moduleMessage, "", "muted");
}

function openModuleModal(moduleId = null) {
  resetModuleForm();
  const module = moduleId ? getModuleById(moduleId) : null;
  setModalTitle("Módulo", module ? "Editar módulo" : "Adicionar novo módulo");

  if (module) {
    $("[data-module-edit-id]").value = module.id;
    $("[data-module-title]").value = module.title || "";
    $("[data-module-description]").value = module.description || "";
    $("[data-module-order]").value = module.order ?? 1;
    $("[data-module-active]").checked = module.active !== false;
    setMessage(els.moduleMessage, `Editando módulo: ${module.title || module.id}`, "muted");
  } else if ($("[data-module-order]")) {
    $("[data-module-order]").value = String(getNextOrder(state.modules));
  }

  showContentModal("module");
}

async function saveModule(event) {
  event.preventDefault();
  const title = $("[data-module-title]").value.trim();
  if (!title) {
    setMessage(els.moduleMessage, "Título obrigatório.", "error");
    return;
  }

  const editId = $("[data-module-edit-id]").value.trim();
  const moduleId = editId || slugify(title) || `modulo-${Date.now()}`;
  const fallbackOrder = editId ? getModuleById(editId)?.order || 1 : getNextOrder(state.modules);
  const payload = {
    title,
    description: $("[data-module-description]").value.trim(),
    order: toNumber($("[data-module-order]").value, fallbackOrder),
    active: $("[data-module-active]").checked,
    updatedAt: serverTimestamp(),
  };

  try {
    const moduleRef = doc(db, "courses", state.courseId, "modules", moduleId);
    const existing = await getDoc(moduleRef);
    if (!existing.exists()) payload.createdAt = serverTimestamp();

    await setDoc(moduleRef, payload, { merge: true });
    const successMessage = editId ? "Módulo salvo com sucesso." : "Módulo criado com sucesso.";
    setMessage(els.moduleMessage, successMessage);
    await recordActivity(editId ? "Módulo atualizado" : "Módulo criado", title);
    resetModuleForm();
    await loadModules();
    setContentNotice(successMessage);
    hideContentModal();
  } catch (error) {
    setError(els.moduleMessage, "Erro ao salvar módulo.", error);
  }
}

async function toggleModuleActive(moduleId) {
  const module = getModuleById(moduleId);
  if (!module) return;

  try {
    await updateDoc(doc(db, "courses", state.courseId, "modules", moduleId), {
      active: module.active === false,
      updatedAt: serverTimestamp(),
    });
    setMessage(els.moduleMessage, "Módulo atualizado.");
    await recordActivity(module.active === false ? "Módulo ativado" : "Módulo ocultado", module.title || moduleId);
    await loadModules();
  } catch (error) {
    setError(els.moduleMessage, "Erro ao atualizar módulo.", error);
  }
}

async function loadModules() {
  const moduleSnapshot = await getDocs(collection(db, "courses", state.courseId, "modules"));
  const modules = await Promise.all(
    moduleSnapshot.docs.map(async (moduleDoc) => {
      const lessonSnapshot = await getDocs(collection(db, "courses", state.courseId, "modules", moduleDoc.id, "lessons"));
      return {
        id: moduleDoc.id,
        ...moduleDoc.data(),
        lessons: sortByOrder(lessonSnapshot.docs.map((lessonDoc) => ({ id: lessonDoc.id, ...lessonDoc.data() }))),
      };
    })
  );

  state.modules = sortByOrder(modules);
  if (state.selectedModuleId && !getModuleById(state.selectedModuleId)) {
    state.selectedModuleId = "";
  }
  renderModules();
  updateSummary();
}

function selectModuleForLesson(moduleId) {
  state.selectedModuleId = moduleId;
}

function resetLessonForm() {
  els.lessonForm?.reset();
  if ($("[data-lesson-edit-id]")) $("[data-lesson-edit-id]").value = "";
  if ($("[data-lesson-type]")) $("[data-lesson-type]").value = "text";
  if ($("[data-lesson-order]")) $("[data-lesson-order]").value = "1";
  if ($("[data-lesson-duration]")) $("[data-lesson-duration]").value = "";
  if ($("[data-lesson-completion-threshold]")) $("[data-lesson-completion-threshold]").value = "";
  if ($("[data-lesson-published]")) $("[data-lesson-published]").checked = true;
  renderLessonPreview(null);
  syncLessonTypeFields();
  setMessage(els.lessonMessage, "", "muted");
}

function openLessonTypeModal(moduleId) {
  selectModuleForLesson(moduleId);
  const module = getModuleById(moduleId);
  setModalTitle("Adicionar aula ou recurso", module?.title || "Selecione o tipo");
  showContentModal("type");
}

function openLessonModal(moduleId, lessonId = null, type = null) {
  selectModuleForLesson(moduleId);
  resetLessonForm();
  const module = getModuleById(moduleId);
  const lesson = lessonId ? getLessonById(moduleId, lessonId) : null;

  setModalTitle(
    lesson ? "Editar aula" : "Nova aula ou recurso",
    lesson ? lesson.title || lesson.id : `${module?.title || "Módulo"} · ${getLessonTypeLabel(type)}`
  );

  if (type && $("[data-lesson-type]")) {
    $("[data-lesson-type]").value = type;
  }

  if (lesson) {
    $("[data-lesson-edit-id]").value = lesson.id;
    $("[data-lesson-title]").value = lesson.title || "";
    $("[data-lesson-type]").value = lesson.type || "text";
    $("[data-lesson-content]").value = lesson.content || "";
    $("[data-lesson-media-url]").value = lesson.mediaUrl || "";
    $("[data-lesson-order]").value = lesson.order ?? 1;
    $("[data-lesson-duration]").value = lesson.durationMinutes ?? "";
    $("[data-lesson-completion-threshold]").value = lesson.completionThresholdMinutes ?? "";
    $("[data-lesson-published]").checked = lesson.published !== false;
    renderLessonPreview(lesson);
    setMessage(els.lessonMessage, `Editando aula: ${lesson.title || lesson.id}`, "muted");
  } else if ($("[data-lesson-order]")) {
    $("[data-lesson-order]").value = String(getNextOrder(module?.lessons || []));
  }

  syncLessonTypeFields();
  showContentModal("lesson");
}

function getLessonFormData() {
  return {
    title: $("[data-lesson-title]").value.trim(),
    type: $("[data-lesson-type]").value,
    content: $("[data-lesson-content]").value.trim(),
    mediaUrl: $("[data-lesson-media-url]").value.trim(),
    order: $("[data-lesson-order]").value,
    durationMinutes: optionalNumber($("[data-lesson-duration]").value),
    completionThresholdMinutes: optionalNumber($("[data-lesson-completion-threshold]").value),
    published: $("[data-lesson-published]").checked,
  };
}

function validateLesson(lesson) {
  if (!lesson.title) return "Título obrigatório.";
  if (lesson.type === "text" && !lesson.content) return "Conteúdo obrigatório para aula de texto.";
  if (lesson.type !== "text" && !lesson.mediaUrl) return "URL externa obrigatória para este tipo de aula.";
  if (lesson.mediaUrl && !safeHttpUrl(lesson.mediaUrl)) return "Use uma URL HTTPS válida, sem usuário ou senha embutidos.";
  if (lesson.type === "video" && lesson.completionThresholdMinutes && lesson.durationMinutes && lesson.completionThresholdMinutes > lesson.durationMinutes) {
    return "O minuto para concluir não pode ser maior que a duração estimada.";
  }
  return "";
}

async function saveLesson(event) {
  event.preventDefault();
  if (!state.selectedModuleId) {
    setMessage(els.lessonMessage, "Selecione um módulo antes de salvar a aula.", "error");
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
  const selectedModule = getModuleById(state.selectedModuleId);
  const fallbackOrder = editId ? getLessonById(state.selectedModuleId, editId)?.order || 1 : getNextOrder(selectedModule?.lessons || []);
  const payload = { ...lesson, order: toNumber(lesson.order, fallbackOrder), updatedAt: serverTimestamp() };

  try {
    const lessonRef = doc(db, "courses", state.courseId, "modules", state.selectedModuleId, "lessons", lessonId);
    const existing = await getDoc(lessonRef);
    if (!existing.exists()) payload.createdAt = serverTimestamp();

    await setDoc(lessonRef, payload, { merge: true });
    const successMessage = editId ? "Aula salva com sucesso." : "Aula criada com sucesso.";
    setMessage(els.lessonMessage, successMessage);
    await recordActivity(editId ? "Aula atualizada" : "Aula criada", lesson.title);
    resetLessonForm();
    await loadModules();
    setContentNotice(successMessage);
    hideContentModal();
  } catch (error) {
    setError(els.lessonMessage, "Erro ao salvar aula.", error);
  }
}

async function toggleLessonPublished(moduleId, lessonId) {
  const lesson = getLessonById(moduleId, lessonId);
  if (!lesson) return;

  try {
    await updateDoc(doc(db, "courses", state.courseId, "modules", moduleId, "lessons", lessonId), {
      published: lesson.published === false,
      updatedAt: serverTimestamp(),
    });
    setMessage(els.lessonMessage, "Aula atualizada.");
    await recordActivity(lesson.published === false ? "Aula publicada" : "Aula despublicada", lesson.title || lessonId);
    await loadModules();
  } catch (error) {
    setError(els.lessonMessage, "Erro ao atualizar aula.", error);
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
  } catch {
    return "";
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

function renderLessonPreview(lesson = getLessonFormData()) {
  if (!els.lessonPreview) return;
  els.lessonPreview.replaceChildren();
  els.lessonPreview.hidden = false;

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

function getLessonPublicationStatus(module, lesson) {
  if (module.active === false) return "Indisponível: módulo oculto";
  if (lesson.published === false) return "Rascunho";
  return "Publicada";
}

function renderModules() {
  if (!els.moduleList) return;
  els.moduleList.replaceChildren();

  if (!state.modules.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = state.editMode
      ? "Nenhum módulo encontrado. Use + Adicionar novo módulo para começar."
      : "Nenhum módulo encontrado.";
    els.moduleList.appendChild(empty);
    return;
  }

  state.modules.forEach((module, moduleIndex) => {
    const isExpanded = state.expandedModules.has(module.id);
    const block = document.createElement("article");
    block.className = `admin-module-block ${isExpanded ? "is-expanded" : ""}`;
    block.dataset.moduleDragId = module.id;
    block.draggable = state.editMode;

    const header = document.createElement("button");
    header.className = "admin-module-header";
    header.type = "button";
    header.dataset.moduleExpand = module.id;

    const copy = document.createElement("div");
    const eyebrow = document.createElement("span");
    eyebrow.textContent = `${isExpanded ? "▾" : "▸"} Módulo ${getVisualNumber(moduleIndex)} · ${module.id}`;
    const title = document.createElement("h3");
    title.textContent = module.title || module.id;
    const description = document.createElement("p");
    description.textContent = module.description || "Sem descrição.";
    copy.append(eyebrow, title, description);

    const meta = document.createElement("div");
    meta.className = "admin-course-meta";
    meta.append(createBadge(module.active === false ? "Inativo" : "Ativo"), createBadge(`${module.lessons?.length || 0} aulas`));

    header.append(copy, meta);
    block.appendChild(header);

    const actions = document.createElement("div");
    actions.className = "admin-actions";
    if (state.editMode) {
      const handle = document.createElement("span");
      handle.className = "admin-drag-handle";
      handle.textContent = "⋮⋮ Arrastar";
      actions.append(
        handle,
        createActionButton("Editar módulo", "moduleEdit", module.id),
        createActionButton("+ Adicionar aula ou recurso", "moduleNewLesson", module.id, "app-button-primary"),
        createActionButton(module.active === false ? "Ativar" : "Ocultar", "moduleToggle", module.id)
      );
      block.appendChild(actions);
    }

    const lessonList = document.createElement("div");
    lessonList.className = "admin-lesson-list";
    lessonList.hidden = !isExpanded;

    if (!module.lessons?.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Nenhuma aula cadastrada neste módulo.";
      lessonList.appendChild(empty);
    } else {
      module.lessons.forEach((lesson, lessonIndex) => {
        const row = document.createElement("article");
        row.className = "admin-lesson-row";

        const lessonCopy = document.createElement("div");
        const lessonEyebrow = document.createElement("span");
        lessonEyebrow.textContent = `Aula ${getVisualNumber(lessonIndex)} · ${getLessonIcon(lesson.type)} · ${getLessonTypeLabel(lesson.type)}`;
        const lessonTitle = document.createElement("strong");
        lessonTitle.textContent = lesson.title || lesson.id;
        const lessonDescription = document.createElement("p");
        const publicationStatus = getLessonPublicationStatus(module, lesson);
        lessonDescription.textContent = lesson.mediaUrl
          ? `${publicationStatus} · URL externa cadastrada`
          : publicationStatus;
        lessonCopy.append(lessonEyebrow, lessonTitle, lessonDescription);

        const lessonMeta = document.createElement("div");
        lessonMeta.className = "admin-course-meta";
        lessonMeta.append(createBadge(publicationStatus));

        const lessonActions = document.createElement("div");
        lessonActions.className = "admin-actions";

        if (state.editMode) {
          const editButton = createActionButton("Editar", "lessonEdit", lesson.id);
          editButton.dataset.lessonModule = module.id;
          const toggleButton = createActionButton(lesson.published === false ? "Publicar" : "Despublicar", "lessonToggle", lesson.id);
          toggleButton.dataset.lessonModule = module.id;
          const previewButton = createActionButton("Preview", "lessonPreview", lesson.id);
          previewButton.dataset.lessonModule = module.id;
          lessonActions.append(editButton, toggleButton, previewButton);
        }

        row.append(lessonCopy, lessonMeta);
        if (state.editMode) row.appendChild(lessonActions);
        lessonList.appendChild(row);
      });
    }

    block.appendChild(lessonList);
    els.moduleList.appendChild(block);
  });
}

function setContentNotice(message) {
  if (els.contentNote) els.contentNote.textContent = message;
}

function expandAllModules() {
  state.modules.forEach((module) => state.expandedModules.add(module.id));
  renderModules();
}

function collapseAllModules() {
  state.expandedModules.clear();
  renderModules();
}

async function saveModuleOrder(nextModules) {
  const batch = writeBatch(db);
  let hasChanges = false;

  nextModules.forEach((module, index) => {
    const nextOrder = index + 1;
    if (Number(module.order || 0) === nextOrder) return;
    hasChanges = true;
    batch.update(doc(db, "courses", state.courseId, "modules", module.id), {
      order: nextOrder,
      updatedAt: serverTimestamp(),
    });
  });

  if (!hasChanges) return;

  await batch.commit();
  state.modules = nextModules.map((module, index) => ({ ...module, order: index + 1 }));
  renderModules();
  setContentNotice("Ordem dos módulos atualizada.");
  await recordActivity("Ordem dos módulos atualizada", "A sequência dos módulos foi reorganizada.");
}

async function reorderModules(draggedModuleId, targetModuleId) {
  if (!state.editMode || !draggedModuleId || !targetModuleId || draggedModuleId === targetModuleId) return;

  const current = [...state.modules];
  const fromIndex = current.findIndex((module) => module.id === draggedModuleId);
  const toIndex = current.findIndex((module) => module.id === targetModuleId);
  if (fromIndex < 0 || toIndex < 0) return;

  const [moved] = current.splice(fromIndex, 1);
  current.splice(toIndex, 0, moved);

  try {
    await saveModuleOrder(current);
  } catch (error) {
    console.error("[ADMIN-COURSE] Erro ao atualizar ordem dos módulos:", error);
    setContentNotice("Erro ao atualizar ordem dos módulos.");
  }
}

async function loadUsers() {
  const snapshot = await getDocs(collection(db, "users"));
  state.users = snapshot.docs
    .map((userDoc) => ({ id: userDoc.id, ...userDoc.data() }))
    .sort((a, b) => String(a.name || a.email || a.id).localeCompare(String(b.name || b.email || b.id)));
}

async function loadEnrollments() {
  const snapshot = await getDocs(query(collection(db, "enrollments"), where("courseId", "==", state.courseId)));
  state.enrollments = snapshot.docs.map((enrollmentDoc) => ({ id: enrollmentDoc.id, ...enrollmentDoc.data() }));
  renderEnrollments();
}

async function loadProgress() {
  const snapshot = await getDocs(query(collection(db, "progress"), where("courseId", "==", state.courseId)));
  state.progress = snapshot.docs
    .map((progressDoc) => ({ id: progressDoc.id, ...progressDoc.data() }))
    .filter((item) => item.courseId === state.courseId);
}

function refreshEnrollmentSelects() {
  fillSelect(
    els.enrollmentUser,
    state.users.filter((user) => normalizeRole(user.role) !== "admin"),
    "Selecione um aluno",
    optionTextUser
  );
  fillSelect(
    els.certificateUser,
    getActiveEnrollmentRows().map((row) => ({ id: row.userId, name: row.userName, email: row.userEmail })),
    "Selecione um aluno matriculado",
    optionTextUser
  );
}

function renderEnrollments() {
  if (!els.enrollmentList || !els.enrollmentState) return;
  els.enrollmentList.replaceChildren();
  const allRows = getEnrollmentRows();
  const search = state.enrollmentSearch.trim().toLocaleLowerCase("pt-BR");
  const rows = allRows.filter((row) => {
    const matchesSearch = !search || `${row.userName} ${row.userEmail}`.toLocaleLowerCase("pt-BR").includes(search);
    const matchesStatus = state.enrollmentFilter === "all" || row.status === state.enrollmentFilter;
    return matchesSearch && matchesStatus;
  });

  if (!allRows.length) {
    els.enrollmentState.hidden = false;
    els.enrollmentState.textContent = "Nenhum aluno matriculado neste curso.";
    updateSummary();
    refreshEnrollmentSelects();
    return;
  }

  if (!rows.length) {
    els.enrollmentState.hidden = false;
    els.enrollmentState.textContent = "Nenhum aluno encontrado com estes filtros.";
    updateSummary();
    refreshEnrollmentSelects();
    return;
  }

  els.enrollmentState.hidden = true;
  rows.forEach((row) => {
    const item = document.createElement("article");
    item.className = "admin-course-item compact";

    const eyebrow = document.createElement("span");
    eyebrow.textContent = row.userId;

    const title = document.createElement("strong");
    title.textContent = row.userName || row.userEmail || row.userId;

    const description = document.createElement("p");
    description.textContent = row.userEmail || "Sem e-mail cadastrado.";

    const hasCertificate = state.certificates.some((certificate) => certificate.userId === row.userId && certificate.status !== "revoked");
    const progress = getUserCourseProgress(row.userId);
    const meta = document.createElement("div");
    meta.className = "admin-course-meta";
    meta.append(
      createBadge(row.status || "active"),
      createBadge(`Matrícula: ${formatDate(row.enrolledAt)}`),
      createBadge(`Progresso: ${progress.completedCount}/${progress.total} (${progress.percent}%)`),
      createBadge(hasCertificate || row.certificateIssued ? "Certificado: sim" : "Certificado: não")
    );

    const actions = document.createElement("div");
    actions.className = "admin-actions";
    actions.append(
      createActionButton(row.status === "inactive" ? "Reativar acesso" : "Remover acesso", "enrollmentToggle", row.userId)
    );

    item.append(eyebrow, title, description, meta, actions);
    els.enrollmentList.appendChild(item);
  });

  updateSummary();
  refreshEnrollmentSelects();
}

async function enrollStudent(event) {
  event.preventDefault();
  const userId = els.enrollmentUser?.value;
  const user = getUserById(userId);

  if (!user || !state.course) {
    setMessage(els.enrollmentMessage, "Aluno obrigatório.", "error");
    return;
  }

  const activeEnrollment = getActiveEnrollmentRows().find((row) => row.userId === userId);
  if (activeEnrollment) {
    setMessage(els.enrollmentMessage, "Este aluno já possui acesso ativo neste curso.", "warning");
    return;
  }

  const enrollmentId = `${userId}_${state.courseId}`;

  try {
    const batch = writeBatch(db);
    batch.set(
      doc(db, "enrollments", enrollmentId),
      {
        userId,
        userEmail: user.email || "",
        userName: user.name || user.email || user.id,
        courseId: state.courseId,
        courseTitle: state.course.title || state.courseId,
        status: "active",
        enrolledAt: serverTimestamp(),
        completedAt: null,
        certificateIssued: false,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    batch.update(doc(db, "users", userId), { updatedAt: serverTimestamp() });
    await batch.commit();

    setMessage(els.enrollmentMessage, "Aluno matriculado com sucesso.");
    await recordActivity("Aluno matriculado", user.name || user.email || user.id);
    els.enrollmentForm?.reset();
    await Promise.all([loadUsers(), loadEnrollments()]);
  } catch (error) {
    setError(els.enrollmentMessage, "Erro ao matricular aluno.", error);
  }
}

async function toggleStudentAccess(userId) {
  const row = getEnrollmentRows().find((item) => item.userId === userId);
  const user = getUserById(userId);
  if (!row || !user) return;

  const shouldActivate = row.status === "inactive";
  const enrollmentId = `${userId}_${state.courseId}`;
  if (!shouldActivate && !window.confirm(`Remover o acesso de ${row.userName || row.userEmail || userId}? O progresso será preservado, mas o aluno não poderá acessar o curso.`)) {
    return;
  }

  try {
    const batch = writeBatch(db);
    batch.set(
      doc(db, "enrollments", enrollmentId),
      {
        userId,
        userEmail: user.email || row.userEmail || "",
        userName: user.name || row.userName || userId,
        courseId: state.courseId,
        courseTitle: state.course?.title || state.courseId,
        status: shouldActivate ? "active" : "inactive",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    batch.update(doc(db, "users", userId), { updatedAt: serverTimestamp() });
    await batch.commit();

    setMessage(els.enrollmentMessage, shouldActivate ? "Acesso reativado." : "Acesso removido.");
    await recordActivity(shouldActivate ? "Acesso de aluno reativado" : "Acesso de aluno removido", row.userName || row.userEmail || userId);
    await Promise.all([loadUsers(), loadEnrollments()]);
  } catch (error) {
    setError(els.enrollmentMessage, "Erro ao atualizar acesso.", error);
  }
}

async function savePricing(event) {
  event.preventDefault();

  const paymentInput = $("[data-payment-link]").value.trim();
  const paymentLink = safeHttpUrl(paymentInput);
  if (paymentInput && !paymentLink) {
    setMessage(els.pricingMessage, "O link de pagamento deve ser uma URL HTTPS válida.", "error");
    return;
  }

  try {
    await updateDoc(doc(db, "courses", state.courseId), {
      price: toNumber($("[data-price]").value, 0),
      salePrice: optionalNumber($("[data-sale-price]").value),
      currency: ($("[data-currency]").value.trim() || "BRL").toUpperCase(),
      paymentLink,
      active: $("[data-price-active]").checked,
      visible: $("[data-price-visible]").checked,
      updatedAt: serverTimestamp(),
    });
    setMessage(els.pricingMessage, "Preços salvos.");
    await recordActivity("Preços atualizados", formatCurrency(optionalNumber($("[data-sale-price]").value) ?? toNumber($("[data-price]").value, 0), ($("[data-currency]").value.trim() || "BRL").toUpperCase()));
    await loadCourse();
  } catch (error) {
    setError(els.pricingMessage, "Erro ao salvar preços.", error);
  }
}

async function loadCertificates() {
  const snapshot = await getDocs(query(collection(db, "certificates"), where("courseId", "==", state.courseId)));
  state.certificates = snapshot.docs
    .map((certificateDoc) => ({ id: certificateDoc.id, ...certificateDoc.data() }))
    .filter((certificate) => certificate.courseId === state.courseId);
  renderCertificates();
}

function renderCertificates() {
  if (!els.certificateList || !els.certificateState) return;
  els.certificateList.replaceChildren();

  if (!state.certificates.length) {
    els.certificateState.hidden = false;
    els.certificateState.textContent = "Nenhum certificado registrado para este curso.";
    renderEnrollments();
    return;
  }

  els.certificateState.hidden = true;
  state.certificates.forEach((certificate) => {
    const item = document.createElement("article");
    item.className = "admin-course-item compact";

    const code = document.createElement("span");
    code.textContent = certificate.certificateCode || certificate.id;

    const title = document.createElement("strong");
    title.textContent = certificate.userName || certificate.userId || "Aluno";

    const description = document.createElement("p");
    description.textContent = `Emitido em ${formatDate(certificate.issuedAt)}`;

    const meta = document.createElement("div");
    meta.className = "admin-course-meta";
    meta.append(createBadge(certificate.status || "issued"));

    const actions = document.createElement("div");
    actions.className = "admin-actions";
    actions.appendChild(createActionButton("Excluir certificado", "certificateDelete", certificate.id));

    item.append(code, title, description, meta, actions);
    els.certificateList.appendChild(item);
  });

  renderEnrollments();
}

async function deleteCertificate(certificateId) {
  const certificate = state.certificates.find((item) => item.id === certificateId);
  if (!certificate) return;
  if (!window.confirm(`Excluir o certificado ${certificate.certificateCode || certificate.id}? Esta ação não pode ser desfeita.`)) {
    return;
  }

  try {
    await deleteDoc(doc(db, "certificates", certificateId));
    state.certificates = state.certificates.filter((item) => item.id !== certificateId);
    const hasRemainingCertificate = state.certificates.some(
      (item) => item.userId === certificate.userId && item.status !== "revoked"
    );
    await setDoc(
      doc(db, "enrollments", `${certificate.userId}_${state.courseId}`),
      { certificateIssued: hasRemainingCertificate, updatedAt: serverTimestamp() },
      { merge: true }
    );
    setMessage(els.certificateMessage, "Certificado excluído.");
    await recordActivity("Certificado excluído", certificate.userName || certificate.certificateCode || certificate.id);
    renderCertificates();
    await loadEnrollments();
  } catch (error) {
    setError(els.certificateMessage, "Erro ao excluir certificado.", error);
  }
}

async function createCertificate(event) {
  event.preventDefault();
  const userId = els.certificateUser?.value;
  const user = getUserById(userId);

  if (!user || !state.course) {
    setMessage(els.certificateMessage, "Aluno matriculado obrigatório.", "error");
    return;
  }

  const code = `DEVER-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  try {
    await setDoc(doc(db, "certificates", code), {
      userId,
      courseId: state.courseId,
      userName: user.name || user.email || user.id,
      courseTitle: state.course.title || state.courseId,
      issuedAt: serverTimestamp(),
      certificateCode: code,
      status: "issued",
    });

    await setDoc(
      doc(db, "enrollments", `${userId}_${state.courseId}`),
      {
        userId,
        userEmail: user.email || "",
        userName: user.name || user.email || user.id,
        courseId: state.courseId,
        courseTitle: state.course.title || state.courseId,
        status: "active",
        certificateIssued: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    setMessage(els.certificateMessage, "Registro de certificado criado.");
    await recordActivity("Certificado emitido", user.name || user.email || user.id);
    els.certificateForm?.reset();
    await Promise.all([loadCertificates(), loadEnrollments()]);
  } catch (error) {
    setError(els.certificateMessage, "Erro ao criar certificado.", error);
  }
}

async function saveSettings(event) {
  event.preventDefault();

  try {
    await updateDoc(doc(db, "courses", state.courseId), {
      order: toNumber($("[data-settings-order]").value, 1),
      active: $("[data-settings-active]").checked,
      visible: $("[data-settings-visible]").checked,
      updatedAt: serverTimestamp(),
    });
    setMessage(els.settingsMessage, "Configurações salvas.");
    await recordActivity("Configurações de publicação atualizadas", $("[data-settings-active]").checked ? "Curso ativo" : "Curso inativo");
    await loadCourse();
  } catch (error) {
    setError(els.settingsMessage, "Erro ao salvar configurações.", error);
  }
}

async function disableCourse() {
  if (!window.confirm("Desativar e ocultar este curso? Alunos ativos perderão o acesso até que você o reative.")) {
    return;
  }

  try {
    await updateDoc(doc(db, "courses", state.courseId), {
      active: false,
      visible: false,
      updatedAt: serverTimestamp(),
    });
    setMessage(els.settingsMessage, "Curso desativado e ocultado.");
    await recordActivity("Curso desativado e ocultado", state.course?.title || state.courseId);
    await loadCourse();
  } catch (error) {
    setError(els.settingsMessage, "Erro ao desativar curso.", error);
  }
}

function bindEvents() {
  setupCourseTabs();
  els.overviewForm?.addEventListener("submit", saveCourseOverview);
  els.moduleForm?.addEventListener("submit", saveModule);
  els.lessonForm?.addEventListener("submit", saveLesson);
  els.enrollmentForm?.addEventListener("submit", enrollStudent);
  els.pricingForm?.addEventListener("submit", savePricing);
  els.certificateForm?.addEventListener("submit", createCertificate);
  els.settingsForm?.addEventListener("submit", saveSettings);

  els.editModeToggle?.addEventListener("click", toggleEditMode);
  $("[data-expand-all-modules]")?.addEventListener("click", expandAllModules);
  $("[data-collapse-all-modules]")?.addEventListener("click", collapseAllModules);
  $$("[data-module-new]").forEach((button) => {
    button.addEventListener("click", () => openModuleModal());
  });
  $$("[data-modal-close]").forEach((item) => {
    item.addEventListener("click", hideContentModal);
  });
  $$("[data-lesson-type-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      openLessonModal(state.selectedModuleId, null, button.dataset.lessonTypeChoice);
    });
  });
  $("[data-lesson-type]")?.addEventListener("change", syncLessonTypeFields);
  $("[data-lesson-preview-button]")?.addEventListener("click", () => renderLessonPreview());
  $("[data-course-disable]")?.addEventListener("click", disableCourse);

  els.moduleList?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.moduleExpand) {
      if (state.expandedModules.has(button.dataset.moduleExpand)) {
        state.expandedModules.delete(button.dataset.moduleExpand);
      } else {
        state.expandedModules.add(button.dataset.moduleExpand);
      }
      renderModules();
    }
    if (button.dataset.moduleEdit) openModuleModal(button.dataset.moduleEdit);
    if (button.dataset.moduleToggle) toggleModuleActive(button.dataset.moduleToggle);
    if (button.dataset.moduleNewLesson) {
      openLessonTypeModal(button.dataset.moduleNewLesson);
    }
    if (button.dataset.lessonEdit) openLessonModal(button.dataset.lessonModule, button.dataset.lessonEdit);
    if (button.dataset.lessonToggle) toggleLessonPublished(button.dataset.lessonModule, button.dataset.lessonToggle);
    if (button.dataset.lessonPreview) {
      const lesson = getLessonById(button.dataset.lessonModule, button.dataset.lessonPreview);
      setModalTitle("Preview da aula", lesson?.title || "Aula");
      renderLessonPreview(lesson);
      showContentModal("preview");
    }
  });

  els.moduleList?.addEventListener("dragstart", (event) => {
    if (!state.editMode) return;
    if (!event.target.closest(".admin-drag-handle")) return;
    const item = event.target.closest("[data-module-drag-id]");
    if (!item) return;
    state.draggedModuleId = item.dataset.moduleDragId;
    item.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", state.draggedModuleId);
  });

  els.moduleList?.addEventListener("dragover", (event) => {
    if (!state.editMode || !state.draggedModuleId) return;
    const item = event.target.closest("[data-module-drag-id]");
    if (!item || item.dataset.moduleDragId === state.draggedModuleId) return;
    event.preventDefault();
    item.classList.add("is-drop-target");
  });

  els.moduleList?.addEventListener("dragleave", (event) => {
    const item = event.target.closest("[data-module-drag-id]");
    item?.classList.remove("is-drop-target");
  });

  els.moduleList?.addEventListener("drop", (event) => {
    if (!state.editMode || !state.draggedModuleId) return;
    const item = event.target.closest("[data-module-drag-id]");
    if (!item) return;
    event.preventDefault();
    document.querySelectorAll(".is-drop-target").forEach((target) => target.classList.remove("is-drop-target"));
    reorderModules(state.draggedModuleId, item.dataset.moduleDragId);
  });

  els.moduleList?.addEventListener("dragend", () => {
    state.draggedModuleId = "";
    document.querySelectorAll(".is-dragging, .is-drop-target").forEach((item) => {
      item.classList.remove("is-dragging", "is-drop-target");
    });
  });

  els.enrollmentList?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (button?.dataset.enrollmentToggle) toggleStudentAccess(button.dataset.enrollmentToggle);
  });

  els.enrollmentSearch?.addEventListener("input", () => {
    state.enrollmentSearch = els.enrollmentSearch.value;
    renderEnrollments();
  });
  els.enrollmentFilter?.addEventListener("change", () => {
    state.enrollmentFilter = els.enrollmentFilter.value;
    renderEnrollments();
  });

  els.certificateList?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-certificate-delete]");
    if (button) deleteCertificate(button.dataset.certificateDelete);
  });
}

async function initAdminCoursePage() {
  bindEvents();
  const result = await requireAdmin();
  if (!result) return;

  const { user, profile, authorized, message } = result;
  const role = normalizeRole(profile?.role);
  state.adminUser = user;
  state.adminProfile = profile;
  state.courseId = getCourseId();

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

  if (!state.courseId) {
    setAdminState("Curso não informado na URL.");
    if (els.adminContent) els.adminContent.hidden = true;
    return;
  }

  try {
    await loadCourse();
    await Promise.all([loadUsers(), loadModules(), loadEnrollments(), loadCertificates(), loadProgress(), loadActivities()]);
    renderEnrollments();
    renderCertificates();
    refreshEnrollmentSelects();
    updateSummary();
    selectModuleForLesson("");
    renderLessonPreview(null);
    setAdminState("", false);
    if (els.adminDenied) els.adminDenied.hidden = true;
    if (els.adminContent) els.adminContent.hidden = false;
  } catch (error) {
    logAdminError("Erro ao carregar curso.", error);
    setAdminState(formatFirebaseError(error));
    if (els.adminContent) els.adminContent.hidden = true;
  }
}

initAdminCoursePage().catch((error) => {
  logAdminError("Erro ao iniciar admin do curso.", error);
  setAdminState(formatFirebaseError(error));
  if (els.adminContent) els.adminContent.hidden = true;
});
