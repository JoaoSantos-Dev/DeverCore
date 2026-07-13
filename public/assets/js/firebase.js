import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDisBPkogSSydEOXVND2EV11J_iT1goOrU",
  authDomain: "devercore.firebaseapp.com",
  projectId: "devercore",
  storageBucket: "devercore.firebasestorage.app",
  messagingSenderId: "1037811489265",
  appId: "1:1037811489265:web:d2c609e493b4a74011cc50",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  // Evita o WebChannel/streaming padrão, que pode ser bloqueado por extensões,
  // proxies ou ambientes locais e aparecer como ERR_BLOCKED_BY_CLIENT.
  experimentalForceLongPolling: true,
  useFetchStreams: false,
});
