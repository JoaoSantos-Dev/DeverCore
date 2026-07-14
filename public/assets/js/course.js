import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { safeHttpUrl } from "./url.js";
import { getUserProfile, logout, normalizeRole, requireAuth } from "./auth.js";

const state = {
  user: null,
  profile: null,
  courseId: "",
  course: null,
  modules: [],
  progress: new Map(),
  expandedModules: new Set(),
  selectedLesson: null,
  lastViewedLessonId: "",
  canWriteProgress: false,
};

const titleEl = document.querySelector("[data-course-title]");
const descriptionEl = document.querySelector("[data-course-description]");
const progressLabelEl = document.querySelector("[data-course-progress-label]");
const progressCountEl = document.querySelector("[data-course-progress-count]");
const progressBarEl = document.querySelector("[data-course-progress-bar]");
const courseHero = document.querySelector("[data-course-hero]");
const courseContent = document.querySelector("[data-course-content]");
const moduleList = document.querySelector("[data-module-list]");
const lessonContent = document.querySelector("[data-lesson-content]");
const courseOverview = document.querySelector("[data-course-overview]");
const continueButton = document.querySelector("[data-continue-course]");
const stateEl = document.querySelector("[data-course-state]");
const adminReturnLink = document.querySelector("[data-admin-return]");
const logoutButtons = document.querySelectorAll("[data-logout]");

let youtubeApiPromise = null;
let stopActiveVideoTracking = null;

logoutButtons.forEach((button) => {
  button.addEventListener("click", logout);
});

function setState(message, options = {}) {
  if (stateEl) {
    stateEl.hidden = false;
    stateEl.textContent = message;
  }
  if (options.hideHero && courseHero) courseHero.hidden = true;
  if (options.hideContent && courseContent) courseContent.hidden = true;
}

function clearState() {
  if (stateEl) {
    stateEl.hidden = true;
    stateEl.textContent = "";
  }
  if (courseHero) courseHero.hidden = false;
  if (courseContent) courseContent.hidden = false;
}

function getCourseId() {
  return new URLSearchParams(window.location.search).get("id");
}

async function hasActiveEnrollment(userId, courseId) {
  if (!userId || !courseId) return false;
  const snapshot = await getDoc(doc(db, "enrollments", `${userId}_${courseId}`));
  return snapshot.exists() && snapshot.data().userId === userId && snapshot.data().courseId === courseId && snapshot.data().status === "active";
}

function sortByOrder(items) {
  return [...items].sort((a, b) => {
    const orderA = Number(a.order || 999);
    const orderB = Number(b.order || 999);
    if (orderA !== orderB) return orderA - orderB;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

function getVisualNumber(index) {
  return String(index + 1).padStart(2, "0");
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

function getProgressId(lesson) {
  return `${state.user.uid}_${state.courseId}_${lesson.id}`;
}

function isLessonCompleted(lesson) {
  return state.progress.has(lesson.id);
}

function getPublishedLessons(module = null) {
  const modules = module ? [module] : state.modules;
  return modules.flatMap((item) => {
    if (item.active === false) return [];
    return (item.lessons || [])
      .filter((lesson) => lesson.published !== false)
      .map((lesson) => ({ ...lesson, moduleId: item.id }));
  });
}

function getLessonDuration(lesson) {
  const value = lesson.durationMinutes ?? lesson.duration;
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes > 0 ? `${minutes} min` : "";
}

function getLessonSequence() {
  return state.modules.flatMap((module) => getPublishedLessons(module));
}

function selectLesson(lesson, shouldScroll = true) {
  if (!lesson) return;
  state.selectedLesson = lesson;
  state.lastViewedLessonId = lesson.id;
  localStorage.setItem(`dever:last-lesson:${state.user.uid}:${state.courseId}`, lesson.id);
  state.expandedModules.add(lesson.moduleId);
  renderStudentCourse();
  if (courseOverview) courseOverview.hidden = true;
  if (lessonContent) lessonContent.hidden = false;
  if (shouldScroll) lessonContent?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showCourseOverview() {
  state.selectedLesson = null;
  if (courseOverview) courseOverview.hidden = false;
  if (lessonContent) lessonContent.hidden = true;
  renderStudentModules();
  courseOverview?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function calculateModuleProgress(module) {
  const lessons = getPublishedLessons(module);
  const completed = lessons.filter((lesson) => isLessonCompleted(lesson)).length;
  const total = lessons.length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percent, done: total > 0 && completed === total };
}

function calculateCourseProgress() {
  const lessons = getPublishedLessons();
  const completed = lessons.filter((lesson) => isLessonCompleted(lesson)).length;
  const total = lessons.length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percent, done: total > 0 && completed === total };
}

function updateCourseProgress() {
  const progress = calculateCourseProgress();
  if (progressLabelEl) progressLabelEl.textContent = `${progress.percent}% concluído`;
  if (progressCountEl) {
    progressCountEl.textContent = `${progress.completed} de ${progress.total} aulas concluídas`;
  }
  if (progressBarEl) progressBarEl.style.width = `${progress.percent}%`;
}

function isYouTubeUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace("www.", "");
    return host === "youtu.be" || host.endsWith("youtube.com");
  } catch {
    return false;
  }
}

function getYouTubeVideoId(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace("www.", "");
    if (host === "youtu.be") return parsed.pathname.slice(1);
    if (host.endsWith("youtube.com") && parsed.pathname === "/watch") return parsed.searchParams.get("v") || "";
    if (host.endsWith("youtube.com") && parsed.pathname.startsWith("/embed/")) return parsed.pathname.split("/")[2] || "";
    if (host.endsWith("youtube.com") && parsed.pathname.startsWith("/shorts/")) return parsed.pathname.split("/")[2] || "";
    return "";
  } catch {
    return "";
  }
}

function convertYouTubeUrlToEmbed(url) {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) return "";
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?enablejsapi=1&rel=0`;
}

function ensureYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === "function") previous();
      resolve(window.YT);
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

function getCompletionThresholdSeconds(lesson) {
  const minutes = Number(lesson.completionThresholdMinutes);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : 0;
}

function setupYouTubeCompletionTracking(containerId, videoId, lesson) {
  if (!videoId || isLessonCompleted(lesson) || !state.canWriteProgress) return;

  ensureYouTubeApi().then((YT) => {
    let checkTimer = null;
    let completed = false;
    const thresholdSeconds = getCompletionThresholdSeconds(lesson);
    const stopTracking = () => {
      if (checkTimer) window.clearInterval(checkTimer);
      checkTimer = null;
    };
    const completeLesson = () => {
      if (completed) return;
      completed = true;
      stopTracking();
      markLessonCompleted(lesson, "video_auto");
    };
    stopActiveVideoTracking = stopTracking;

    new YT.Player(containerId, {
      videoId,
      host: "https://www.youtube-nocookie.com",
      playerVars: { rel: 0 },
      events: {
        onStateChange(event) {
          if (event.data === YT.PlayerState.ENDED) {
            completeLesson();
            return;
          }

          if (event.data !== YT.PlayerState.PLAYING || !thresholdSeconds || completed) {
            stopTracking();
            return;
          }

          stopTracking();
          checkTimer = window.setInterval(() => {
            try {
              if (event.target.getCurrentTime() >= thresholdSeconds) completeLesson();
            } catch {
              stopTracking();
            }
          }, 500);
        },
      },
    });
  });
}

function createExternalLink(url, label = "Abrir material") {
  const link = document.createElement("a");
  link.className = "app-button app-button-secondary";
  link.href = safeHttpUrl(url) || "#";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  return link;
}

function createBadge(text) {
  const badge = document.createElement("span");
  badge.textContent = text;
  return badge;
}

function renderStudentModules() {
  if (!moduleList) return;
  moduleList.replaceChildren();

  if (!state.modules.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Nenhum módulo publicado neste curso.";
    moduleList.appendChild(empty);
    return;
  }

  state.modules.forEach((module, moduleIndex) => {
    const progress = calculateModuleProgress(module);
    const isExpanded = state.expandedModules.has(module.id);
    const block = document.createElement("section");
    block.className = `student-module-block ${isExpanded ? "is-expanded" : ""} ${progress.done ? "is-complete" : ""}`;

    const toggle = document.createElement("button");
    toggle.className = "student-module-toggle";
    toggle.type = "button";
    toggle.dataset.studentModuleToggle = module.id;
    toggle.setAttribute("aria-expanded", String(isExpanded));

    const copy = document.createElement("div");
    const eyebrow = document.createElement("span");
    eyebrow.textContent = `${isExpanded ? "▾" : "▸"} Módulo ${getVisualNumber(moduleIndex)}`;
    const title = document.createElement("strong");
    title.textContent = `${progress.done ? "✓ " : ""}${module.title || module.id}`;
    const description = document.createElement("p");
    description.textContent = module.description || "";
    copy.append(eyebrow, title, description);

    const meta = document.createElement("div");
    meta.className = "admin-course-meta";
    const totalMinutes = getPublishedLessons(module).reduce((total, lesson) => total + (Number(lesson.durationMinutes ?? lesson.duration) || 0), 0);
    meta.append(
      createBadge(`${progress.total} ${progress.total === 1 ? "aula" : "aulas"}`),
      createBadge(`${progress.completed}/${progress.total} concluídas`),
      createBadge(progress.done ? "Módulo concluído" : `${progress.percent}%`),
      ...(totalMinutes > 0 ? [createBadge(`${totalMinutes} min estimados`)] : [])
    );

    const progressTrack = document.createElement("div");
    progressTrack.className = "student-module-progress";
    progressTrack.setAttribute("aria-hidden", "true");
    const progressBar = document.createElement("span");
    progressBar.style.width = `${progress.percent}%`;
    progressTrack.appendChild(progressBar);

    toggle.append(copy, meta, progressTrack);
    block.appendChild(toggle);

    const lessons = document.createElement("div");
    lessons.className = "student-lesson-list";
    lessons.hidden = !isExpanded;

    const publishedLessons = getPublishedLessons(module);
    if (!publishedLessons.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Nenhuma aula publicada neste módulo.";
      lessons.appendChild(empty);
    } else {
      publishedLessons.forEach((lesson, lessonIndex) => {
        const completed = isLessonCompleted(lesson);
        const row = document.createElement("button");
        row.className = `student-lesson-row ${completed ? "is-complete" : ""} ${
          state.selectedLesson?.id === lesson.id ? "is-active" : ""
        }`;
        row.type = "button";
        row.dataset.studentLesson = lesson.id;
        row.dataset.studentModule = module.id;

        const label = document.createElement("span");
        label.textContent = `${completed ? "✓" : "○"} Aula ${getVisualNumber(lessonIndex)} · ${getLessonIcon(lesson.type)}`;

        const name = document.createElement("strong");
        name.textContent = lesson.title || lesson.id;

        const status = document.createElement("small");
        const duration = getLessonDuration(lesson);
        const activityStatus = completed ? "Concluída" : state.lastViewedLessonId === lesson.id ? "Em andamento" : "Não iniciada";
        status.textContent = [activityStatus, getLessonTypeLabel(lesson.type), duration]
          .filter(Boolean)
          .join(" · ");

        row.append(label, name, status);
        lessons.appendChild(row);
      });
    }

    block.appendChild(lessons);
    moduleList.appendChild(block);
  });
}

function renderStudentLesson(lesson = state.selectedLesson) {
  if (!lessonContent) return;
  stopActiveVideoTracking?.();
  stopActiveVideoTracking = null;
  lessonContent.replaceChildren();

  if (!lesson) {
    const placeholder = document.createElement("div");
    placeholder.className = "lesson-placeholder";
    placeholder.textContent = "Selecione uma aula para começar.";
    lessonContent.appendChild(placeholder);
    return;
  }

  const completed = isLessonCompleted(lesson);
  const sequence = getLessonSequence();
  const currentIndex = sequence.findIndex((item) => item.id === lesson.id && item.moduleId === lesson.moduleId);
  const previousLesson = currentIndex > 0 ? sequence[currentIndex - 1] : null;
  const nextLesson = currentIndex >= 0 && currentIndex < sequence.length - 1 ? sequence[currentIndex + 1] : null;

  const topNav = document.createElement("div");
  topNav.className = "lesson-top-nav";
  const overviewButton = document.createElement("button");
  overviewButton.className = "app-button";
  overviewButton.type = "button";
  overviewButton.textContent = "← Visão geral do curso";
  overviewButton.addEventListener("click", showCourseOverview);
  const position = document.createElement("span");
  position.textContent = `Aula ${currentIndex + 1} de ${sequence.length}`;
  topNav.append(overviewButton, position);
  lessonContent.appendChild(topNav);

  const header = document.createElement("div");
  header.className = "lesson-header";

  const type = document.createElement("span");
  type.textContent = `${getLessonTypeLabel(lesson.type)} · ${completed ? "Concluída" : "Pendente"}`;

  const title = document.createElement("h2");
  title.textContent = lesson.title || "Aula";

  header.append(type, title);
  lessonContent.appendChild(header);

  const content = document.createElement("p");
  content.className = "lesson-text";
  content.textContent = lesson.content || "";

  const mediaUrl = String(lesson.mediaUrl || "").trim();
  const lessonType = String(lesson.type || "text").toLowerCase();

  if (content.textContent) lessonContent.appendChild(content);

  if (lessonType === "image" && mediaUrl) {
    const image = document.createElement("img");
    image.className = "lesson-image";
    image.src = mediaUrl;
    image.alt = lesson.title || lesson.content || "Imagem da aula";
    image.loading = "lazy";
    lessonContent.appendChild(image);
  }

  if (lessonType === "video" && mediaUrl) {
    if (isYouTubeUrl(mediaUrl)) {
      const videoId = getYouTubeVideoId(mediaUrl);
      const playerId = `yt-${lesson.moduleId}-${lesson.id}`.replace(/[^a-zA-Z0-9_-]/g, "-");
      const player = document.createElement("iframe");
      player.className = "lesson-video";
      player.id = playerId;
      player.src = convertYouTubeUrlToEmbed(mediaUrl);
      player.title = lesson.title || "Vídeo da aula";
      player.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      player.allowFullscreen = true;
      lessonContent.appendChild(player);
      setupYouTubeCompletionTracking(playerId, videoId, lesson);
    } else {
      lessonContent.appendChild(createExternalLink(mediaUrl, "Abrir vídeo"));
    }
  }

  if (lessonType === "live" && mediaUrl) {
    lessonContent.appendChild(createExternalLink(mediaUrl, "Acessar live"));
  }

  if (lessonType === "link" && mediaUrl) {
    lessonContent.appendChild(createExternalLink(mediaUrl, "Abrir material"));
  }

  const status = document.createElement("div");
  status.className = "lesson-completion";

  const statusText = document.createElement("p");
  const videoRequiresWatchTime = lessonType === "video" && isYouTubeUrl(mediaUrl);
  const completionThreshold = Number(lesson.completionThresholdMinutes);
  statusText.textContent = completed
    ? "Aula marcada como concluída."
    : videoRequiresWatchTime && completionThreshold > 0
      ? "A aula será concluída automaticamente ao atingir " + completionThreshold + " min de vídeo."
      : videoRequiresWatchTime
      ? "A aula será marcada como concluída automaticamente ao finalizar o vídeo."
      : "Marque esta aula como concluída quando terminar.";

  const button = document.createElement("button");
  button.className = "app-button app-button-primary";
  button.type = "button";
  button.textContent = completed ? "Concluída" : "Marcar como concluída";
  button.disabled = completed || !state.canWriteProgress || videoRequiresWatchTime;
  if (videoRequiresWatchTime && !completed) {
    button.title = "Esta aula é concluída automaticamente pelo tempo assistido no vídeo.";
  }
  button.addEventListener("click", () => markLessonCompleted(lesson, "manual"));

  status.append(statusText, button);
  lessonContent.appendChild(status);

  const navigation = document.createElement("nav");
  navigation.className = "lesson-navigation";
  navigation.setAttribute("aria-label", "Navegação entre aulas");
  const previous = document.createElement("button");
  previous.className = "app-button";
  previous.type = "button";
  previous.disabled = !previousLesson;
  previous.textContent = previousLesson ? `← ${previousLesson.title || "Aula anterior"}` : "← Aula anterior";
  previous.addEventListener("click", () => selectLesson(previousLesson));
  const next = document.createElement("button");
  next.className = "app-button app-button-primary";
  next.type = "button";
  next.disabled = !nextLesson;
  next.textContent = nextLesson ? `${nextLesson.title || "Próxima aula"} →` : "Fim do curso";
  next.addEventListener("click", () => selectLesson(nextLesson));
  navigation.append(previous, next);
  lessonContent.appendChild(navigation);
}

function renderStudentCourse() {
  updateCourseProgress();
  renderStudentModules();
  renderStudentLesson();
}

async function markLessonCompleted(lesson, completionType = "manual") {
  if (!lesson || isLessonCompleted(lesson) || !state.canWriteProgress) return;

  await setDoc(
    doc(db, "progress", getProgressId(lesson)),
    {
      userId: state.user.uid,
      courseId: state.courseId,
      moduleId: lesson.moduleId,
      lessonId: lesson.id,
      status: "completed",
      completedAt: serverTimestamp(),
      type: completionType,
    },
    { merge: true }
  );

  state.progress.set(lesson.id, {
    userId: state.user.uid,
    courseId: state.courseId,
    moduleId: lesson.moduleId,
    lessonId: lesson.id,
    status: "completed",
    type: completionType,
  });

  const module = state.modules.find((item) => item.id === lesson.moduleId);
  const moduleProgress = module ? calculateModuleProgress(module) : null;
  const courseProgress = calculateCourseProgress();

  if (stateEl) {
    stateEl.hidden = false;
    stateEl.textContent = courseProgress.done
      ? "Curso concluído."
      : moduleProgress?.done
        ? "Módulo concluído."
        : "Aula marcada como concluída.";
  }

  renderStudentCourse();
}

async function loadModulesAndLessons(courseId, includeUnpublished = false) {
  const moduleSnapshot = await getDocs(
    query(collection(db, "courses", courseId, "modules"), orderBy("order", "asc"))
  );

  const modules = [];
  for (const moduleDoc of moduleSnapshot.docs) {
    const lessonSnapshot = await getDocs(
      query(collection(db, "courses", courseId, "modules", moduleDoc.id, "lessons"), orderBy("order", "asc"))
    );

    const lessons = lessonSnapshot.docs
      .map((lessonDoc) => ({ id: lessonDoc.id, moduleId: moduleDoc.id, ...lessonDoc.data() }))
      .filter((lesson) => includeUnpublished || lesson.published !== false);

    const module = { id: moduleDoc.id, ...moduleDoc.data(), lessons };
    if (includeUnpublished || module.active !== false) modules.push(module);
  }

  state.modules = sortByOrder(modules);
}

async function loadUserProgress() {
  const snapshot = await getDocs(query(collection(db, "progress"), where("userId", "==", state.user.uid), where("courseId", "==", state.courseId)));
  state.progress = new Map(
    snapshot.docs
      .map((progressDoc) => ({ id: progressDoc.id, ...progressDoc.data() }))
      .filter((item) => item.status === "completed")
      .map((item) => [item.lessonId, item])
  );
}

function bindCourseEvents() {
  moduleList?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.studentModuleToggle) {
      const moduleId = button.dataset.studentModuleToggle;
      if (state.expandedModules.has(moduleId)) {
        state.expandedModules.delete(moduleId);
      } else {
        state.expandedModules.add(moduleId);
      }
      renderStudentModules();
    }

    if (button.dataset.studentLesson) {
      const module = state.modules.find((item) => item.id === button.dataset.studentModule);
      const lesson = module?.lessons?.find((item) => item.id === button.dataset.studentLesson);
      if (!lesson) return;
      selectLesson(lesson);
    }
  });

  continueButton?.addEventListener("click", () => selectLesson(findInitialLesson()));
  document.querySelector("[data-expand-course]")?.addEventListener("click", () => {
    state.modules.forEach((module) => state.expandedModules.add(module.id));
    renderStudentModules();
  });
  document.querySelector("[data-collapse-course]")?.addEventListener("click", () => {
    state.expandedModules.clear();
    renderStudentModules();
  });
}

function findInitialLesson() {
  const lastViewed = getLessonSequence().find((lesson) => lesson.id === state.lastViewedLessonId && !isLessonCompleted(lesson));
  if (lastViewed) return lastViewed;
  for (const module of state.modules) {
    const pendingLesson = getPublishedLessons(module).find((lesson) => !isLessonCompleted(lesson));
    if (pendingLesson) return pendingLesson;
  }

  const firstModule = state.modules.find((module) => getPublishedLessons(module).length);
  return firstModule ? getPublishedLessons(firstModule)[0] : null;
}

async function loadCourseForStudent() {
  state.user = await requireAuth();
  if (!state.user) return;

  state.courseId = getCourseId();
  state.profile = await getUserProfile(state.user.uid);
  const isAdminProfile = normalizeRole(state.profile?.role) === "admin";
  if (adminReturnLink) {
    adminReturnLink.hidden = !isAdminProfile || !state.courseId;
    adminReturnLink.href = `admin-course.html?id=${encodeURIComponent(state.courseId || "")}`;
  }
  state.canWriteProgress = await hasActiveEnrollment(state.user.uid, state.courseId);

  if (!state.courseId || (!isAdminProfile && !state.canWriteProgress)) {
    setState("Curso não encontrado ou acesso não liberado.", {
      hideHero: true,
      hideContent: true,
    });
    return;
  }

  const courseSnapshot = await getDoc(doc(db, "courses", state.courseId));
  if (!courseSnapshot.exists()) {
    setState("Curso não encontrado ou acesso não liberado.", {
      hideHero: true,
      hideContent: true,
    });
    return;
  }

  state.course = { id: courseSnapshot.id, ...courseSnapshot.data() };
  if (state.course.active === false && !isAdminProfile) {
    setState("Curso não encontrado ou acesso não liberado.", {
      hideHero: true,
      hideContent: true,
    });
    return;
  }

  clearState();
  if (titleEl) titleEl.textContent = state.course.title || "Curso";
  if (descriptionEl) descriptionEl.textContent = state.course.description || "";

  await loadModulesAndLessons(state.courseId, isAdminProfile);
  await loadUserProgress();
  state.lastViewedLessonId = localStorage.getItem(`dever:last-lesson:${state.user.uid}:${state.courseId}`) || "";

  const hasLessons = state.modules.some((module) => getPublishedLessons(module).length);
  if (!hasLessons) {
    setState("Este curso ainda não possui aulas publicadas.", { hideContent: true });
    return;
  }

  state.selectedLesson = null;
  state.modules.forEach((module) => state.expandedModules.add(module.id));
  if (continueButton) {
    const progress = calculateCourseProgress();
    continueButton.textContent = progress.done ? "Rever curso" : progress.completed ? "Continuar curso" : "Começar curso";
  }
  if (courseOverview) courseOverview.hidden = false;
  if (lessonContent) lessonContent.hidden = true;
  renderStudentCourse();
}

bindCourseEvents();

loadCourseForStudent().catch((error) => {
  console.error("[COURSE] Erro ao carregar curso:", error);
  setState("Curso não encontrado ou acesso não liberado.", {
    hideHero: true,
    hideContent: true,
  });
});
