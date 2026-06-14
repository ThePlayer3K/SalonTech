import { $, showToast } from "./utils.js";
import { storage, canAccessModule, getVisibleModuleOrder } from "./store.js";
import { adminModules } from "./config.js";

export function setupSplash() {
    const splash = $("#splashScreen");
    window.setTimeout(() => splash?.classList.add("is-hidden"), 650);
}

export function setupTheme() {
    const savedTheme = storage.get("salonTechTheme", "light");
    document.documentElement.dataset.theme = savedTheme;
    updateThemeButton(savedTheme);

    $("#themeToggle")?.addEventListener("click", () => {
        const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = nextTheme;
        storage.set("salonTechTheme", nextTheme);
        updateThemeButton(nextTheme);
    });
}

export function updateThemeButton(theme) {
    const button = $("#themeToggle");
    if (!button) return;
    button.textContent = theme === "dark" ? "Claro" : "Escuro";
    button.setAttribute("title", theme === "dark" ? "Usar tema claro" : "Usar tema escuro");

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        metaThemeColor.setAttribute("content", theme === "dark" ? "#09090b" : "#f9fafb");
    }
}

export function setupOfflineHandler() {
    const offlineScreen = $("#offlineScreen");
    if (!offlineScreen) return;

    function updateOnlineStatus() {
        if (navigator.onLine) {
            offlineScreen.hidden = true;
            showToast("Conexão restabelecida! A tesoura voltou a funcionar.", "success");
        } else {
            offlineScreen.hidden = false;
        }
    }

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    if (!navigator.onLine) updateOnlineStatus();
}

export function updateScrollProgress() {
    const progress = $("#scrollProgress");
    if (!progress) return;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const percent = maxScroll > 0 ? (window.scrollY / maxScroll) * 100 : 0;
    progress.style.width = `${Math.min(100, Math.max(0, percent))}%`;
}

export function setupNavigation(openModuleFn) {
    const menuButton = $("#mobileMenuBtn");
    const navLinks = $("#navLinks");

    menuButton?.addEventListener("click", () => {
        const isOpen = navLinks.classList.toggle("is-open");
        menuButton.setAttribute("aria-expanded", String(isOpen));
    });

    navLinks?.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => {
            navLinks.classList.remove("is-open");
            menuButton?.setAttribute("aria-expanded", "false");
        });
    });

    document.querySelectorAll("[data-open-module]").forEach((link) => {
        link.addEventListener("click", (event) => {
            const moduleKey = link.dataset.openModule;
            if (!adminModules[moduleKey] || !canAccessModule(moduleKey)) {
                event.preventDefault();
                showToast("Seu perfil nao tem acesso a este modulo.", "error");
                return;
            }
            openModuleFn(moduleKey);
        });
    });

    window.addEventListener("scroll", updateScrollProgress, { passive: true });
}

export function renderModuleNavigation(currentModule) {
    const visibleOrder = getVisibleModuleOrder();
    document.querySelectorAll("[data-open-module]").forEach((link) => {
        const allowed = canAccessModule(link.dataset.openModule);
        const item = link.closest("li");
        if (item) {
            item.hidden = !allowed;
            item.style.order = String(visibleOrder.indexOf(link.dataset.openModule));
        }
    });
    document.querySelectorAll('.nav-links a[href="#servicos"]:not([data-open-module])').forEach((link) => {
        const item = link.closest("li");
        if (item) item.style.order = String(visibleOrder.length);
    });
    syncActiveModuleNavigation(currentModule);
}

export function syncActiveModuleNavigation(currentModule) {
    document.querySelectorAll("[data-open-module]").forEach((link) => {
        link.classList.toggle("active", link.dataset.openModule === currentModule);
    });
}

export function setAuthStatus(message, type = "") {
    const status = $("#authStatus");
    if (!status) return;
    status.textContent = message;
    status.className = `auth-status ${type}`.trim();
}

export function setResetMode(mode) {
    $("#forgotPasswordForm")?.reset();

    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
        const isActive = button.dataset.authMode === "login" && mode === "login";
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-selected", String(isActive));
    });

    document.querySelectorAll("[data-auth-form]").forEach((form) => {
        form.hidden = form.dataset.authForm !== mode;
    });

    setAuthStatus("");
}

export function setupPasswordToggle() {
    document.addEventListener("click", (e) => {
        const btn = e.target.closest(".password-toggle");
        if (!btn) return;
        const input = btn.closest(".password-wrapper").querySelector("input");
        const isHidden = input.type === "password";
        input.type = isHidden ? "text" : "password";
        btn.querySelector(".eye-show").hidden = isHidden;
        btn.querySelector(".eye-hide").hidden = !isHidden;
        btn.setAttribute("aria-label", isHidden ? "Ocultar senha" : "Mostrar senha");
    });
}
