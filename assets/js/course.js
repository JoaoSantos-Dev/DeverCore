import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { getUserProfile, logout, requireAuth } from "./auth.js";

const titleEl = document.querySelector("[data-course-title]");
const descriptionEl = document.querySelector("[data-course-description]");
const progressEl = document.querySelector("[data-course-progress]");
const courseHero = document.querySelector("[data-course-hero]");
const courseContent = document.querySelector("[data-course-content]");
const moduleList = document.querySelector("[data-module-list]");
const lessonContent = document.querySelector("[data-lesson-content]");
const stateEl = document.querySelector("[data-course-state]");
const logoutButtons = document.querySelectorAll("[data-logout]");

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

function isEnrolled(profile, courseId) {
  return Array.isArray(profile?.enrolledCourses) && profile.enrolledCourses.includes(courseId);
}

function getYouTubeEmbedUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace("www.", "");
    let videoId = "";

    if (host === "youtu.be") {
      videoId = parsed.pathname.slice(1);
    } else if (host.endsWith("youtube.com")) {
      if (parsed.pathname === "/watch") videoId = parsed.searchParams.get("v") || "";
      if (parsed.pathname.startsWith("/embed/")) videoId = parsed.pathname.split("/")[2] || "";
      if (parsed.pathname.startsWith("/shorts/")) videoId = parsed.pathname.split("/")[2] || "";
    }

    if (!videoId) return "";
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
  } catch (error) {
    return "";
  }
}

function createExternalLink(url, label = "Abrir material") {
  const link = document.createElement("a");
  link.className = "app-button app-button-secondary";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  return link;
}

function renderLesson(lesson) {
  if (!lessonContent) return;
  lessonContent.replaceChildren();

  const header = document.createElement("div");
  header.className = "lesson-header";

  const type = document.createElement("span");
  type.textContent = lesson.type || "text";

  const title = document.createElement("h2");
  title.textContent = lesson.title || "Aula";

  header.append(type, title);
  lessonContent.appendChild(header);

  const content = document.createElement("p");
  content.className = "lesson-text";
  content.textContent = lesson.content || "";

  const mediaUrl = String(lesson.mediaUrl || "").trim();
  const lessonType = String(lesson.type || "text").toLowerCase();

  if (lessonType === "image" && mediaUrl) {
    lessonContent.appendChild(content);
    const image = document.createElement("img");
    image.className = "lesson-image";
    image.src = mediaUrl;
    image.alt = lesson.title || lesson.content || "Imagem da aula";
    image.loading = "lazy";
    lessonContent.appendChild(image);
    return;
  }

  if (lessonType === "video" && mediaUrl) {
    lessonContent.appendChild(content);
    const embedUrl = getYouTubeEmbedUrl(mediaUrl);
    if (embedUrl) {
      const frame = document.createElement("iframe");
      frame.className = "lesson-video";
      frame.src = embedUrl;
      frame.title = lesson.title || "Vídeo da aula";
      frame.loading = "lazy";
      frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      frame.allowFullscreen = true;
      lessonContent.appendChild(frame);
    } else {
      lessonContent.appendChild(createExternalLink(mediaUrl, "Abrir vídeo"));
    }
    return;
  }

  if (lessonType === "live" && mediaUrl) {
    lessonContent.appendChild(content);
    lessonContent.appendChild(createExternalLink(mediaUrl, "Acessar live"));
    return;
  }

  if (lessonType === "link" && mediaUrl) {
    lessonContent.appendChild(content);
    lessonContent.appendChild(createExternalLink(mediaUrl));
    return;
  }

  lessonContent.appendChild(content);
}

function createLessonButton(lesson, isFirst) {
  const button = document.createElement("button");
  button.className = "lesson-button";
  button.type = "button";
  button.textContent = lesson.title || "Aula";
  button.addEventListener("click", () => {
    document.querySelectorAll(".lesson-button.is-active").forEach((item) => {
      item.classList.remove("is-active");
    });
    button.classList.add("is-active");
    renderLesson(lesson);
  });

  if (isFirst) {
    button.classList.add("is-active");
    renderLesson(lesson);
  }

  return button;
}

function createModuleBlock(module, lessons, isFirstLessonRendered) {
  const block = document.createElement("section");
  block.className = "module-block";

  const title = document.createElement("h3");
  title.textContent = module.title || "Módulo";

  const description = document.createElement("p");
  description.textContent = module.description || "";

  const lessonList = document.createElement("div");
  lessonList.className = "lesson-list";

  lessons.forEach((lesson, index) => {
    const shouldRender = !isFirstLessonRendered.value && index === 0;
    lessonList.appendChild(createLessonButton(lesson, shouldRender));
    if (shouldRender) isFirstLessonRendered.value = true;
  });

  block.append(title, description, lessonList);
  return block;
}

async function loadModulesWithLessons(courseId) {
  const moduleSnapshot = await getDocs(
    query(collection(db, "courses", courseId, "modules"), orderBy("order", "asc"))
  );

  const modules = [];
  for (const moduleDoc of moduleSnapshot.docs) {
    const lessonSnapshot = await getDocs(
      query(
        collection(db, "courses", courseId, "modules", moduleDoc.id, "lessons"),
        orderBy("order", "asc")
      )
    );

    const lessons = lessonSnapshot.docs
      .map((lessonDoc) => ({ id: lessonDoc.id, ...lessonDoc.data() }))
      .filter((lesson) => lesson.published !== false);

    modules.push({ id: moduleDoc.id, ...moduleDoc.data(), lessons });
  }

  return modules;
}

async function initCourse() {
  const user = await requireAuth();
  if (!user) return;

  const courseId = getCourseId();
  const profile = await getUserProfile(user.uid);

  if (!courseId || !isEnrolled(profile, courseId)) {
    setState("Curso não encontrado ou acesso não liberado.", {
      hideHero: true,
      hideContent: true,
    });
    return;
  }

  const courseSnapshot = await getDoc(doc(db, "courses", courseId));
  if (!courseSnapshot.exists()) {
    setState("Curso não encontrado ou acesso não liberado.", {
      hideHero: true,
      hideContent: true,
    });
    return;
  }

  const course = courseSnapshot.data();
  if (course.active === false) {
    setState("Curso não encontrado ou acesso não liberado.", {
      hideHero: true,
      hideContent: true,
    });
    return;
  }

  clearState();
  if (titleEl) titleEl.textContent = course.title || "Curso";
  if (descriptionEl) descriptionEl.textContent = course.description || "";
  if (progressEl) {
    const progress = course.progress || course.status || "Em andamento";
    progressEl.textContent = `Status: ${progress}`;
  }

  const modules = await loadModulesWithLessons(courseId);
  const hasLessons = modules.some((module) => module.lessons.length);
  if (!moduleList || !hasLessons) {
    setState("Este curso ainda não possui aulas publicadas.", { hideContent: true });
    return;
  }

  moduleList.replaceChildren();
  const isFirstLessonRendered = { value: false };
  modules
    .filter((module) => module.lessons.length)
    .forEach((module) => {
      moduleList.appendChild(createModuleBlock(module, module.lessons, isFirstLessonRendered));
    });
}

initCourse().catch(() => {
  setState("Curso não encontrado ou acesso não liberado.", {
    hideHero: true,
    hideContent: true,
  });
});
