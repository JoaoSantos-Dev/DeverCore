import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";

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
  return user;
}

export async function redirectIfAuthenticated() {
  const user = await waitForAuth();
  if (user) {
    window.location.replace("dashboard.html");
  }
}

export async function getUserProfile(uid) {
  const snapshot = await getDoc(doc(db, "users", uid));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

export async function logout() {
  await signOut(auth);
  window.location.replace("login.html");
}

export function displayRole(role) {
  const normalized = String(role || "estudante").toLowerCase();
  if (normalized === "admin") return "admin";
  if (normalized === "moderador") return "moderador";
  return "estudante";
}

export function getDisplayName(user, profile) {
  return profile?.name || user.displayName || user.email || "Aluno";
}
