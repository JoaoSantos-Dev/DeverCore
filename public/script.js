document.documentElement.classList.add("js-enabled");

const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");
const revealItems = document.querySelectorAll("[data-reveal]");

function setHeaderState() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 10);
}

function closeMenu() {
  if (!menuToggle || !nav) return;
  menuToggle.classList.remove("is-open");
  nav.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Abrir menu");
  document.body.classList.remove("menu-open");
}

function toggleMenu() {
  if (!menuToggle || !nav) return;
  const isOpen = menuToggle.classList.toggle("is-open");
  nav.classList.toggle("is-open", isOpen);
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Fechar menu" : "Abrir menu");
  document.body.classList.toggle("menu-open", isOpen);
}

menuToggle?.addEventListener("click", toggleMenu);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenu();
  }
});

document.addEventListener("click", (event) => {
  if (!document.body.classList.contains("menu-open")) return;
  if (!nav || !menuToggle) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (nav.contains(target) || menuToggle.contains(target)) return;
  closeMenu();
});

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const targetId = link.getAttribute("href");
    if (!targetId || targetId === "#") return;

    const target = document.querySelector(targetId);
    if (!target) return;

    event.preventDefault();
    closeMenu();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    if (target instanceof HTMLElement && target.tabIndex >= 0) {
      target.focus({ preventScroll: true });
    }
  });
});

window.addEventListener("scroll", setHeaderState, { passive: true });
setHeaderState();

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}
