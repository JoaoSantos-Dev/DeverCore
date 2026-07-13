// Exemplo manual de seed para o Firestore.
// Este arquivo nao e importado pelo site e nao deve rodar automaticamente.
// Preencha o UID de um usuario criado no Firebase Authentication antes de executar.
//
// Observacao: as regras sugeridas em firestore.rules bloqueiam escrita pelo client.
// Use este exemplo apenas em ambiente controlado, antes de aplicar as regras finais,
// no Emulator Suite, ou replique estes dados manualmente pelo Firebase Console.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  doc,
  getFirestore,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDisBPkogSSydEOXVND2EV11J_iT1goOrU",
  authDomain: "devercore.firebaseapp.com",
  projectId: "devercore",
  storageBucket: "devercore.firebasestorage.app",
  messagingSenderId: "1037811489265",
  appId: "1:1037811489265:web:d2c609e493b4a74011cc50",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const studentUid = "COLE_O_UID_DO_ALUNO_AQUI";
const courseId = "unity-2d-primeiro-jogo";

if (studentUid === "COLE_O_UID_DO_ALUNO_AQUI") {
  throw new Error("Preencha studentUid com o UID real do aluno antes de executar o seed.");
}

const batch = writeBatch(db);

batch.set(doc(db, "users", studentUid), {
  name: "Joao Ricardo",
  email: "email@email.com",
  // Roles validas: admin, mod, estudante.
  role: "estudante",
  active: true,
  createdAt: serverTimestamp(),
});

batch.set(doc(db, "courses", courseId), {
  title: "Unity 2D — Primeiro Jogo",
  slug: courseId,
  description: "Treinamento pratico para criar seu primeiro jogo 2D na Unity.",
  coverUrl: "",
  price: 197,
  currency: "BRL",
  salePrice: null,
  paymentLink: "",
  active: true,
  visible: true,
  order: 1,
  createdAt: serverTimestamp(),
});

batch.set(doc(db, "enrollments", `${studentUid}_${courseId}`), {
  userId: studentUid,
  courseId,
  status: "active",
  enrolledAt: serverTimestamp(),
  completedAt: null,
  certificateIssued: false,
});

batch.set(doc(db, "certificates", "DEVER-2026-0001"), {
  userId: studentUid,
  courseId,
  userName: "Joao Ricardo",
  courseTitle: "Unity 2D — Primeiro Jogo",
  issuedAt: serverTimestamp(),
  certificateCode: "DEVER-2026-0001",
  status: "issued",
});

batch.set(doc(db, "courses", courseId, "modules", "modulo-01-fundamentos"), {
  title: "Modulo 01 — Fundamentos",
  description: "Primeiros passos com Unity e organizacao do projeto.",
  order: 1,
});

batch.set(
  doc(db, "courses", courseId, "modules", "modulo-01-fundamentos", "lessons", "aula-01-boas-vindas"),
  {
    title: "Aula 01 — Boas-vindas",
    type: "text",
    content: "Visao geral do treinamento, do projeto e da entrega final.",
    mediaUrl: "",
    order: 1,
    published: true,
  }
);

batch.set(
  doc(db, "courses", courseId, "modules", "modulo-01-fundamentos", "lessons", "aula-02-instalando-unity"),
  {
    title: "Aula 02 — Instalando e preparando a Unity",
    type: "link",
    content: "Material de apoio para instalar a Unity e preparar o ambiente.",
    mediaUrl: "https://unity.com/download",
    order: 2,
    published: true,
  }
);

batch.set(
  doc(db, "courses", courseId, "modules", "modulo-01-fundamentos", "lessons", "aula-03-primeira-cena"),
  {
    title: "Aula 03 — Criando a primeira cena",
    type: "text",
    content: "Organizacao inicial da cena e criacao dos primeiros objetos do jogo.",
    mediaUrl: "",
    order: 3,
    published: true,
  }
);

await batch.commit();
console.log("Seed de exemplo concluido.");
