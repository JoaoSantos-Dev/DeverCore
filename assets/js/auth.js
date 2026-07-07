import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";

let cachedProfileUid = "";
let cachedProfile = null;

export function waitForAuth() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

export async function requireAuth() {
  const user = await waitForAuth();
  if (!user) {
    window.location.replace("login.html");
    return null;
  }
  console.log("[AUTH] Usuário autenticado atual:", user);
  console.log("[AUTH] UID:", user.uid);
  console.log("[AUTH] E-mail:", user.email);
  return user;
}

export async function redirectIfAuthenticated() {
  const user = await waitForAuth();
  if (user) {
    window.location.replace("dashboard.html");
  }
}

export async function getUserProfile(uid) {
  if (cachedProfileUid === uid && cachedProfile) return cachedProfile;
  const snapshot = await getDoc(doc(db, "users", uid));
  console.log(`[AUTH] Documento users/${uid} existe:`, snapshot.exists());
  console.log("[AUTH] Documento users/{uid}:", snapshot.exists() ? snapshot.data() : null);
  if (!snapshot.exists()) return null;
  cachedProfileUid = uid;
  cachedProfile = { id: snapshot.id, ...snapshot.data() };
  return cachedProfile;
}

export async function getCurrentUserProfile() {
  const user = await waitForAuth();
  if (!user) return null;
  return getUserProfile(user.uid);
}

export function normalizeRole(role) {
  const normalized = String(role || "estudante").toLowerCase();
  if (normalized === "admin") return "admin";
  if (normalized === "mod" || normalized === "moderador") return "mod";
  return "estudante";
}

export async function requireAdmin() {
  const user = await requireAuth();
  if (!user) return null;

  const profile = await getUserProfile(user.uid);
  const role = normalizeRole(profile?.role);
  const active = profile?.active === true;
  const authorized = Boolean(profile) && role === "admin" && active;

  console.log("[AUTH] Perfil:", profile);
  console.log("[AUTH] Role:", profile?.role);
  console.log("[AUTH] Active:", profile?.active);

  if (!profile) {
    return {
      user,
      profile,
      authorized: false,
      reason: "profile-missing",
      message: `Perfil Firestore não encontrado para este usuário. Crie o documento users/${user.uid}.`,
    };
  }

  if (role !== "admin") {
    return {
      user,
      profile,
      authorized: false,
      reason: "not-admin",
      message: "Você não tem permissão para acessar esta área.",
    };
  }

  if (!active) {
    return {
      user,
      profile,
      authorized: false,
      reason: "inactive",
      message: "Perfil administrativo inativo. Defina active: true no documento do usuário.",
    };
  }

  return { user, profile, authorized, reason: "ok", message: "" };
}

export async function hasRole(role) {
  const profile = await getCurrentUserProfile();
  return normalizeRole(profile?.role) === normalizeRole(role);
}

export async function isAdmin() {
  const profile = await getCurrentUserProfile();
  return normalizeRole(profile?.role) === "admin" && profile?.active === true;
}

export async function isMod() {
  return hasRole("mod");
}

export async function isStudent() {
  return hasRole("estudante");
}

export async function logout() {
  await signOut(auth);
  window.location.replace("login.html");
}

export function displayRole(role) {
  const normalized = normalizeRole(role);
  if (normalized === "admin") return "admin";
  if (normalized === "mod") return "moderador";
  return "estudante";
}

export function getDisplayName(user, profile) {
  return profile?.name || user.displayName || user.email || "Aluno";
}
