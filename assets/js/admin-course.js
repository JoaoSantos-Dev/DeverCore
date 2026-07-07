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
import { db } from "./firebase.js";
import { logout, normalizeRole, requireAdmin } from "./auth.js";

const state = {
  adminUser: null,
  adminProfile: null,
  courseId: "",
  course: null,
  users: [],
  enrollments: [],
  certificates: [],
  modules: [],
  selectedModuleId: "",
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
  summaryPrice: $("[data-summary-price]"),
  overviewForm: $("[data-overview-form]"),
  overviewMessage: $("[data-overview-message]"),
  moduleForm: $("[data-module-form]"),
  moduleMessage: $("[data-module-message]"),
  moduleList: $("[data-admin-module-list]"),
  lessonForm: $("[data-lesson-form]"),
  lessonMessage: $("[data-lesson-message]"),
  lessonPreview: $("[data-lesson-preview]"),
  selectedModuleLabel: $("[data-selected-module-label]"),
  enrollmentForm: $("[data-enrollment-form]"),
  enrollmentUser: $("[data-enrollment-user]"),
  enrollmentMessage: $("[data-enrollment-message]"),
  enrollmentState: $("[data-enrollment-state]"),
  enrollmentList: $("[data-enrollment-list]"),
  pricingForm: $("[data-pricing-form]"),
  pricingMessage: $("[data-pricing-message]"),
  certificateForm: $("[data-certificate-form]"),
  certificateUser: $("[data-certificate-user]"),
  certificateMessage: $("[data-certificate-message]"),
  certificateState: $("[data-certificate-state]"),
  certificateList: $("[data-certificate-list]"),
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
  const code = error?.code || "";
  const message = error?.message || fallback;
  return `Erro: ${code} ${message}`.trim();
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
  return [...items].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
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

  state.users.forEach((user) => {
    const hasCourse = Array.isArray(user.enrolledCourses) && user.enrolledCourses.includes(state.courseId);
    if (!hasCourse) return;

    const existing = rows.get(user.id);
    if (existing) {
      existing.status = "active";
      existing.userName = existing.userName || user.name || user.email || user.id;
      existing.userEmail = existing.userEmail || user.email || "";
      return;
    }

    rows.set(user.id, {
      id: `${user.id}_${state.courseId}`,
      userId: user.id,
      userName: user.name || user.email || user.id,
      userEmail: user.email || "",
      status: "active",
      enrolledAt: null,
      certificateIssued: false,
      hasEnrollmentDoc: false,
    });
  });

  return [...rows.values()].sort((a, b) => String(a.userName).localeCompare(String(b.userName)));
}

function getActiveEnrollmentRows() {
  return getEnrollmentRows().filter((row) => row.status !== "inactive");
}

function updateSummary() {
  const lessonCount = state.modules.reduce((total, module) => total + (module.lessons?.length || 0), 0);
  const activeStudents = getActiveEnrollmentRows().length;

  if (els.summaryModules) els.summaryModules.textContent = String(state.modules.length);
  if (els.summaryLessons) els.summaryLessons.textContent = String(lessonCount);
  if (els.summaryStudents) els.summaryStudents.textContent = String(activeStudents);
  if (els.summaryPrice) els.summaryPrice.textContent = formatCurrency(state.course?.salePrice ?? state.course?.price, state.course?.currency);
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

function editModule(moduleId) {
  const module = getModuleById(moduleId);
  if (!module) return;

  $("[data-module-edit-id]").value = module.id;
  $("[data-module-title]").value = module.title || "";
  $("[data-module-description]").value = module.description || "";
  $("[data-module-order]").value = module.order ?? 1;
  $("[data-module-active]").checked = module.active !== false;
  setMessage(els.moduleMessage, `Editando módulo: ${module.title || module.id}`, "muted");
  els.moduleForm?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const payload = {
    title,
    description: $("[data-module-description]").value.trim(),
    order: toNumber($("[data-module-order]").value, 1),
    active: $("[data-module-active]").checked,
    updatedAt: serverTimestamp(),
  };

  try {
    const moduleRef = doc(db, "courses", state.courseId, "modules", moduleId);
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

async function toggleModuleActive(moduleId) {
  const module = getModuleById(moduleId);
  if (!module) return;

  try {
    await updateDoc(doc(db, "courses", state.courseId, "modules", moduleId), {
      active: module.active === false,
      updatedAt: serverTimestamp(),
    });
    setMessage(els.moduleMessage, "Módulo atualizado.");
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
  const module = getModuleById(moduleId);
  if (els.selectedModuleLabel) {
    els.selectedModuleLabel.textContent = module ? `Aula em: ${module.title || module.id}` : "Selecione um módulo";
  }
}

function resetLessonForm() {
  els.lessonForm?.reset();
  if ($("[data-lesson-edit-id]")) $("[data-lesson-edit-id]").value = "";
  if ($("[data-lesson-type]")) $("[data-lesson-type]").value = "text";
  if ($("[data-lesson-order]")) $("[data-lesson-order]").value = "1";
  if ($("[data-lesson-published]")) $("[data-lesson-published]").checked = true;
  renderLessonPreview(null);
  setMessage(els.lessonMessage, "", "muted");
}

function editLesson(moduleId, lessonId) {
  const lesson = getLessonById(moduleId, lessonId);
  if (!lesson) return;

  selectModuleForLesson(moduleId);
  $("[data-lesson-edit-id]").value = lesson.id;
  $("[data-lesson-title]").value = lesson.title || "";
  $("[data-lesson-type]").value = lesson.type || "text";
  $("[data-lesson-content]").value = lesson.content || "";
  $("[data-lesson-media-url]").value = lesson.mediaUrl || "";
  $("[data-lesson-order]").value = lesson.order ?? 1;
  $("[data-lesson-published]").checked = lesson.published !== false;
  renderLessonPreview(lesson);
  setMessage(els.lessonMessage, `Editando aula: ${lesson.title || lesson.id}`, "muted");
  els.lessonForm?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const payload = { ...lesson, updatedAt: serverTimestamp() };

  try {
    const lessonRef = doc(db, "courses", state.courseId, "modules", state.selectedModuleId, "lessons", lessonId);
    const existing = await getDoc(lessonRef);
    if (!existing.exists()) payload.createdAt = serverTimestamp();

    await setDoc(lessonRef, payload, { merge: true });
    setMessage(els.lessonMessage, "Aula salva com sucesso.");
    resetLessonForm();
    await loadModules();
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

function renderModules() {
  if (!els.moduleList) return;
  els.moduleList.replaceChildren();

  if (!state.modules.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Nenhum módulo encontrado.";
    els.moduleList.appendChild(empty);
    return;
  }

  state.modules.forEach((module) => {
    const block = document.createElement("article");
    block.className = "admin-module-block";

    const header = document.createElement("div");
    header.className = "admin-module-header";

    const copy = document.createElement("div");
    const eyebrow = document.createElement("span");
    eyebrow.textContent = `Módulo ${String(module.order || 0).padStart(2, "0")} · ${module.id}`;
    const title = document.createElement("h3");
    title.textContent = module.title || module.id;
    const description = document.createElement("p");
    description.textContent = module.description || "Sem descrição.";
    copy.append(eyebrow, title, description);

    const meta = document.createElement("div");
    meta.className = "admin-course-meta";
    meta.append(createBadge(module.active === false ? "Inativo" : "Ativo"), createBadge(`${module.lessons?.length || 0} aulas`));

    const actions = document.createElement("div");
    actions.className = "admin-actions";
    actions.append(
      createActionButton("Editar módulo", "moduleEdit", module.id),
      createActionButton("Nova aula", "moduleNewLesson", module.id, "app-button-primary"),
      createActionButton(module.active === false ? "Ativar" : "Ocultar", "moduleToggle", module.id)
    );

    header.append(copy, meta, actions);

    const lessonList = document.createElement("div");
    lessonList.className = "admin-lesson-list";

    if (!module.lessons?.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Nenhuma aula cadastrada neste módulo.";
      lessonList.appendChild(empty);
    } else {
      module.lessons.forEach((lesson) => {
        const row = document.createElement("article");
        row.className = "admin-lesson-row";

        const lessonCopy = document.createElement("div");
        const lessonEyebrow = document.createElement("span");
        lessonEyebrow.textContent = `Aula ${String(lesson.order || 0).padStart(2, "0")} · ${lesson.type || "text"}`;
        const lessonTitle = document.createElement("strong");
        lessonTitle.textContent = lesson.title || lesson.id;
        const lessonDescription = document.createElement("p");
        lessonDescription.textContent = lesson.content || lesson.mediaUrl || "Sem conteúdo.";
        lessonCopy.append(lessonEyebrow, lessonTitle, lessonDescription);

        const lessonMeta = document.createElement("div");
        lessonMeta.className = "admin-course-meta";
        lessonMeta.append(createBadge(lesson.published === false ? "Não publicada" : "Publicada"));

        const lessonActions = document.createElement("div");
        lessonActions.className = "admin-actions";
        const editButton = createActionButton("Editar aula", "lessonEdit", lesson.id);
        editButton.dataset.lessonModule = module.id;
        const toggleButton = createActionButton(lesson.published === false ? "Publicar" : "Despublicar", "lessonToggle", lesson.id);
        toggleButton.dataset.lessonModule = module.id;
        const previewButton = createActionButton("Preview", "lessonPreview", lesson.id);
        previewButton.dataset.lessonModule = module.id;
        lessonActions.append(editButton, toggleButton, previewButton);

        row.append(lessonCopy, lessonMeta, lessonActions);
        lessonList.appendChild(row);
      });
    }

    block.append(header, lessonList);
    els.moduleList.appendChild(block);
  });
}

async function loadUsers() {
  const snapshot = await getDocs(collection(db, "users"));
  state.users = snapshot.docs
    .map((userDoc) => ({ id: userDoc.id, ...userDoc.data() }))
    .sort((a, b) => String(a.name || a.email || a.id).localeCompare(String(b.name || b.email || b.id)));
}

async function loadEnrollments() {
  const snapshot = await getDocs(collection(db, "enrollments"));
  state.enrollments = snapshot.docs.map((enrollmentDoc) => ({ id: enrollmentDoc.id, ...enrollmentDoc.data() }));
  renderEnrollments();
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
  const rows = getEnrollmentRows();

  if (!rows.length) {
    els.enrollmentState.hidden = false;
    els.enrollmentState.textContent = "Nenhum aluno matriculado neste curso.";
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
    const meta = document.createElement("div");
    meta.className = "admin-course-meta";
    meta.append(
      createBadge(row.status || "active"),
      createBadge(`Matrícula: ${formatDate(row.enrolledAt)}`),
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
    await setDoc(
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

    await updateDoc(doc(db, "users", userId), {
      enrolledCourses: arrayUnion(state.courseId),
      updatedAt: serverTimestamp(),
    });

    setMessage(els.enrollmentMessage, "Aluno matriculado com sucesso.");
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

  try {
    await setDoc(
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

    await updateDoc(doc(db, "users", userId), {
      enrolledCourses: shouldActivate ? arrayUnion(state.courseId) : arrayRemove(state.courseId),
      updatedAt: serverTimestamp(),
    });

    setMessage(els.enrollmentMessage, shouldActivate ? "Acesso reativado." : "Acesso removido.");
    await Promise.all([loadUsers(), loadEnrollments()]);
  } catch (error) {
    setError(els.enrollmentMessage, "Erro ao atualizar acesso.", error);
  }
}

async function savePricing(event) {
  event.preventDefault();

  try {
    await updateDoc(doc(db, "courses", state.courseId), {
      price: toNumber($("[data-price]").value, 0),
      salePrice: optionalNumber($("[data-sale-price]").value),
      currency: ($("[data-currency]").value.trim() || "BRL").toUpperCase(),
      paymentLink: $("[data-payment-link]").value.trim(),
      active: $("[data-price-active]").checked,
      visible: $("[data-price-visible]").checked,
      updatedAt: serverTimestamp(),
    });
    setMessage(els.pricingMessage, "Preços salvos.");
    await loadCourse();
  } catch (error) {
    setError(els.pricingMessage, "Erro ao salvar preços.", error);
  }
}

async function loadCertificates() {
  const snapshot = await getDocs(collection(db, "certificates"));
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

    item.append(code, title, description, meta);
    els.certificateList.appendChild(item);
  });

  renderEnrollments();
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
    await loadCourse();
  } catch (error) {
    setError(els.settingsMessage, "Erro ao salvar configurações.", error);
  }
}

async function disableCourse() {
  try {
    await updateDoc(doc(db, "courses", state.courseId), {
      active: false,
      visible: false,
      updatedAt: serverTimestamp(),
    });
    setMessage(els.settingsMessage, "Curso desativado e ocultado.");
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

  $("[data-module-new]")?.addEventListener("click", () => {
    resetModuleForm();
    els.moduleForm?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("[data-module-cancel]")?.addEventListener("click", resetModuleForm);
  $("[data-lesson-cancel]")?.addEventListener("click", resetLessonForm);
  $("[data-lesson-preview-button]")?.addEventListener("click", () => renderLessonPreview());
  $("[data-course-disable]")?.addEventListener("click", disableCourse);

  els.moduleList?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.moduleEdit) editModule(button.dataset.moduleEdit);
    if (button.dataset.moduleToggle) toggleModuleActive(button.dataset.moduleToggle);
    if (button.dataset.moduleNewLesson) {
      selectModuleForLesson(button.dataset.moduleNewLesson);
      resetLessonForm();
      setMessage(els.lessonMessage, "Criando aula neste módulo.", "muted");
      els.lessonForm?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (button.dataset.lessonEdit) editLesson(button.dataset.lessonModule, button.dataset.lessonEdit);
    if (button.dataset.lessonToggle) toggleLessonPublished(button.dataset.lessonModule, button.dataset.lessonToggle);
    if (button.dataset.lessonPreview) {
      const lesson = getLessonById(button.dataset.lessonModule, button.dataset.lessonPreview);
      renderLessonPreview(lesson);
      els.lessonPreview?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });

  els.enrollmentList?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (button?.dataset.enrollmentToggle) toggleStudentAccess(button.dataset.enrollmentToggle);
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
    await Promise.all([loadUsers(), loadModules(), loadEnrollments(), loadCertificates()]);
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
