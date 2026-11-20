// Registra somente visualizações da página pública nos domínios de produção.
const productionHosts = new Set(["devercore.com", "www.devercore.com"]);
let recorded = false;

async function recordVisit() {
  if (recorded || document.visibilityState !== "visible") return;
  recorded = true;

  try {
    // Mesmo projeto de firebase.js. O envio REST evita carregar o SDK na landing page.
    const database = "projects/devercore/databases/(default)";
    const response = await fetch(`https://firestore.googleapis.com/v1/${database}/documents:commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      keepalive: true,
      body: JSON.stringify({
        writes: [{
          update: {
            name: `${database}/documents/siteVisits/${crypto.randomUUID()}`,
            fields: { page: { stringValue: "/" } },
          },
          updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }],
          currentDocument: { exists: false },
        }],
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    // Uma falha da contagem nunca interrompe a navegação nem os CTAs.
    console.warn("[VISITAS] Não foi possível registrar o acesso:", error?.code || error?.message);
  }
}

if (location.protocol === "https:" && productionHosts.has(location.hostname)) {
  if (document.visibilityState === "visible") {
    void recordVisit();
  } else {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onVisible);
      void recordVisit();
    };
    document.addEventListener("visibilitychange", onVisible);
  }
}
