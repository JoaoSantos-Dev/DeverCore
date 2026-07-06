import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { displayRole, getDisplayName, getUserProfile, logout, requireAuth } from "./auth.js";

const nameEl = document.querySelector("[data-user-name]");
const emailEl = document.querySelector("[data-user-email]");
const roleEl = document.querySelector("[data-user-role]");
const courseList = document.querySelector("[data-course-list]");
const emptyState = document.querySelector("[data-empty-courses]");
const logoutButtons = document.querySelectorAll("[data-logout]");

logoutButtons.forEach((button) => {
  button.addEventListener("click", logout);
});

function createCourseCard(course, courseId) {
  const link = document.createElement("a");
  link.className = "course-card";
  link.href = `course.html?id=${encodeURIComponent(courseId)}`;

  const eyebrow = document.createElement("span");
  eyebrow.textContent = "Curso inscrito";

  const title = document.createElement("strong");
  title.textContent = course.title || courseId;

  const description = document.createElement("p");
  description.textContent = course.description || "Acesse os módulos e aulas disponíveis.";

  link.append(eyebrow, title, description);
  return link;
}

async function loadCourse(courseId) {
  const snapshot = await getDoc(doc(db, "courses", courseId));
  if (!snapshot.exists()) return null;
  const course = snapshot.data();
  if (course.active === false) return null;
  return { id: snapshot.id, ...course };
}

async function initDashboard() {
  const user = await requireAuth();
  if (!user) return;

  const profile = await getUserProfile(user.uid);
  const enrolledCourses = Array.isArray(profile?.enrolledCourses) ? profile.enrolledCourses : [];

  if (nameEl) nameEl.textContent = `Bem-vindo, ${getDisplayName(user, profile)}`;
  if (emailEl) emailEl.textContent = profile?.email || user.email || "";
  if (roleEl) roleEl.textContent = `Perfil: ${displayRole(profile?.role)}`;

  if (!courseList || !emptyState) return;

  if (!enrolledCourses.length) {
    emptyState.hidden = false;
    return;
  }

  const results = await Promise.allSettled(enrolledCourses.map(loadCourse));
  const courses = results
    .filter((result) => result.status === "fulfilled" && result.value)
    .map((result) => result.value);

  if (!courses.length) {
    emptyState.hidden = false;
    return;
  }

  courses
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .forEach((course) => {
      courseList.appendChild(createCourseCard(course, course.id));
    });
}

initDashboard().catch(() => {
  if (emptyState) {
    emptyState.hidden = false;
    emptyState.textContent = "Não foi possível carregar seus cursos agora.";
  }
});
