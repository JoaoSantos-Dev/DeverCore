import {
  collection,
  getCountFromServer,
  query,
  Timestamp,
  where,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from "./firebase.js";

export function initSiteAnalytics() {
  const panel = document.querySelector("[data-site-analytics]");
  if (!panel) return;

  const refresh = panel.querySelector("[data-traffic-refresh]");
  const status = panel.querySelector("[data-traffic-status]");
  const metrics = {
    total: panel.querySelector("[data-traffic-total]"),
    day: panel.querySelector("[data-traffic-day]"),
    week: panel.querySelector("[data-traffic-week]"),
    month: panel.querySelector("[data-traffic-month]"),
  };
  const numberFormat = new Intl.NumberFormat("pt-BR");
  const timeFormat = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
  let loading = false;

  async function refreshCounts() {
    if (loading) return;
    loading = true;
    refresh.disabled = true;
    panel.setAttribute("aria-busy", "true");
    status.classList.remove("error", "success");
    status.textContent = "Carregando acessos...";

    try {
      const visits = collection(db, "siteVisits");
      const now = Date.now();
      const since = (days) => query(visits, where("createdAt", ">=", Timestamp.fromMillis(now - days * 86400000)));
      // Agregações retornam apenas os totais, sem baixar o histórico de visitas.
      const [total, day, week, month] = await Promise.all([
        getCountFromServer(visits),
        getCountFromServer(since(1)),
        getCountFromServer(since(7)),
        getCountFromServer(since(30)),
      ]);

      for (const [key, snapshot] of Object.entries({ total, day, week, month })) {
        metrics[key].textContent = numberFormat.format(snapshot.data().count);
      }
      status.textContent = `Atualizado em ${timeFormat.format(new Date())} (horário de Brasília).`;
    } catch (error) {
      // Não apresentar falha de rede ou permissão como zero visitas.
      Object.values(metrics).forEach((metric) => { metric.textContent = "—"; });
      status.classList.add("error");
      status.textContent = error?.code === "permission-denied"
        ? "A contagem não foi liberada. Publique as regras atualizadas do Firestore e confirme que seu perfil admin está ativo."
        : "Não foi possível carregar os acessos. Confira sua conexão e clique em Atualizar acessos.";
      console.warn("[VISITAS] Falha ao carregar contagem:", error?.code || error?.message);
    } finally {
      loading = false;
      refresh.disabled = false;
      panel.setAttribute("aria-busy", "false");
    }
  }

  refresh.addEventListener("click", refreshCounts);
  return refreshCounts();
}
