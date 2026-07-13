import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { safeHttpUrl } from "./url.js";
import {
  displayRole,
  getDisplayName,
  getUserProfile,
  logout,
  normalizeRole,
  requireAuth,
} from "./auth.js";

const nameEl = document.querySelector("[data-user-name]");
const emailEl = document.querySelector("[data-user-email]");
const roleEl = document.querySelector("[data-user-role]");
const adminCard = document.querySelector("[data-admin-card]");
const courseList = document.querySelector("[data-course-list]");
const availableCourseList = document.querySelector("[data-available-course-list]");
const emptyState = document.querySelector("[data-empty-courses]");
const emptyAvailable = document.querySelector("[data-empty-available]");
const certificatePanel = document.querySelector("[data-certificate-panel]");
const certificateList = document.querySelector("[data-certificate-list]");
const logoutButtons = document.querySelectorAll("[data-logout]");

logoutButtons.forEach((button) => {
  button.addEventListener("click", logout);
});

function formatPrice(course) {
  const currency = course.currency || "BRL";
  const price = Number(course.price || 0);
  const salePrice = Number(course.salePrice || 0);
  let formatter;

  try {
    formatter = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
    });
  } catch {
    formatter = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  if (salePrice > 0) {
    const current = formatter.format(salePrice);
    if (price > salePrice) return `De ${formatter.format(price)} por ${current}`;
    return current;
  }

  if (price > 0) return formatter.format(price);
  return course.price === 0 ? "Gratuito" : "Preço em definição";
}

function createEnrolledCourseCard(course, courseId) {
  const link = document.createElement("a");
  link.className = "course-card";
  link.href = `course.html?id=${encodeURIComponent(courseId)}`;

  const eyebrow = document.createElement("span");
  eyebrow.textContent = course.status || "Curso inscrito";

  const title = document.createElement("strong");
  title.textContent = course.title || courseId;

  const description = document.createElement("p");
  description.textContent = course.description || "Acesse os módulos e aulas disponíveis.";

  const action = document.createElement("span");
  action.className = "course-card-action";
  action.textContent = "Ver conteúdo do curso";

  link.append(eyebrow, title, description, action);
  return link;
}

function createAvailableCourseCard(course) {
  const card = document.createElement("article");
  card.className = "course-card available-course-card";

  const eyebrow = document.createElement("span");
  eyebrow.textContent = "Curso disponível";

  const title = document.createElement("strong");
  title.textContent = course.title || course.id;

  const description = document.createElement("p");
  description.textContent = course.description || "Treinamento disponível para inscrição.";

  const price = document.createElement("p");
  price.className = "course-price";
  price.textContent = formatPrice(course);

  const action = document.createElement("a");
  action.className = "app-button app-button-primary";
  const paymentLink = safeHttpUrl(course.paymentLink);
  if (paymentLink) {
    action.href = paymentLink;
    action.target = "_blank";
    action.rel = "noopener noreferrer";
    action.setAttribute("aria-label", `Comprar ${course.title || "curso"} em uma nova aba`);
    action.textContent = "Comprar curso";
  } else {
    action.href = "index.html#contato";
    action.textContent = "Tenho interesse";
  }

  card.append(eyebrow, title, description, price, action);
  return card;
}

function formatCertificateDate(value) {
  if (!value) return "Data de emissão indisponível";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "Data de emissão indisponível";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(date);
}

function createCertificateCard(certificate) {
  const card = document.createElement("article");
  card.className = "course-card available-course-card";

  const eyebrow = document.createElement("span");
  eyebrow.textContent = "Certificado emitido";
  const title = document.createElement("strong");
  title.textContent = certificate.courseTitle || "Curso DEVER";
  const description = document.createElement("p");
  description.textContent = `Emitido em ${formatCertificateDate(certificate.issuedAt)}.`;
  const action = document.createElement("a");
  action.className = "app-button app-button-primary";
  action.href = `certificate.html?code=${encodeURIComponent(certificate.id)}`;
  action.textContent = "Ver certificado";

  card.append(eyebrow, title, description, action);
  return card;
}

async function loadCertificates(userId) {
  if (!certificatePanel || !certificateList) return;
  certificateList.replaceChildren();
  const snapshot = await getDocs(query(collection(db, "certificates"), where("userId", "==", userId)));
  const certificates = snapshot.docs
    .map((certificateDoc) => ({ id: certificateDoc.id, ...certificateDoc.data() }))
    .filter((certificate) => certificate.status !== "revoked")
    .sort((a, b) => (b.issuedAt?.seconds || 0) - (a.issuedAt?.seconds || 0));

  certificatePanel.hidden = certificates.length === 0;
  certificates.forEach((certificate) => certificateList.appendChild(createCertificateCard(certificate)));
}

async function loadCourse(courseId) {
  const snapshot = await getDoc(doc(db, "courses", courseId));
  if (!snapshot.exists()) return null;
  const course = snapshot.data();
  if (course.active === false) return null;
  return { id: snapshot.id, ...course };
}

async function loadEnrolledCourses(enrolledIds) {
  if (!courseList || !emptyState) return [];
  courseList.replaceChildren();

  if (!enrolledIds.length) {
    emptyState.hidden = false;
    return [];
  }

  const results = await Promise.allSettled(enrolledIds.map(loadCourse));
  const courses = results
    .filter((result) => result.status === "fulfilled" && result.value)
    .map((result) => result.value)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  if (!courses.length) {
    emptyState.hidden = false;
    return [];
  }

  emptyState.hidden = true;
  courses.forEach((course) => {
    courseList.appendChild(createEnrolledCourseCard(course, course.id));
  });

  return courses;
}

async function loadAvailableCourses(enrolledIds) {
  if (!availableCourseList || !emptyAvailable) return [];
  availableCourseList.replaceChildren();

  const coursesQuery = query(
    collection(db, "courses"),
    where("active", "==", true),
    where("visible", "==", true)
  );
  const snapshot = await getDocs(coursesQuery);
  const courses = snapshot.docs
    .map((courseDoc) => ({ id: courseDoc.id, ...courseDoc.data() }))
    .filter((course) => !enrolledIds.includes(course.id))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  if (!courses.length) {
    emptyAvailable.hidden = false;
    return [];
  }

  emptyAvailable.hidden = true;
  courses.forEach((course) => {
    availableCourseList.appendChild(createAvailableCourseCard(course));
  });

  return courses;
}

async function loadStudentDashboard() {
  const user = await requireAuth();
  if (!user) return;

  const profile = await getUserProfile(user.uid);
  const enrollmentSnapshot = await getDocs(query(collection(db, "enrollments"), where("userId", "==", user.uid)));
  const enrolledIds = enrollmentSnapshot.docs
    .map((item) => item.data())
    .filter((item) => item.status === "active")
    .map((item) => item.courseId);
  const role = normalizeRole(profile?.role);

  if (nameEl) nameEl.textContent = getDisplayName(user, profile);
  if (emailEl) emailEl.textContent = profile?.email || user.email || "";
  if (roleEl) roleEl.textContent = `Perfil: ${displayRole(profile?.role)}`;
  if (adminCard) adminCard.hidden = role !== "admin";

  await loadEnrolledCourses(enrolledIds);
  await loadCertificates(user.uid);
  await loadAvailableCourses(enrolledIds);
}

loadStudentDashboard().catch((error) => {
  console.error("[DASHBOARD] Erro ao carregar dashboard:", error);
  if (emptyState) {
    emptyState.hidden = false;
    emptyState.textContent = "Não foi possível carregar seus cursos agora.";
  }
  if (emptyAvailable) {
    emptyAvailable.hidden = false;
    emptyAvailable.textContent = "Não foi possível carregar cursos disponíveis agora.";
  }
});
