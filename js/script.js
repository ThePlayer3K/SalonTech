import { supabase } from "./supabase.js";

const $ = (selector) => document.querySelector(selector);

document.addEventListener("DOMContentLoaded", async () => {
    setupAuth();
});

function setupAuth() {
    document.querySelectorAll("[data-auth-mode]").forEach((btn) => {
        btn.addEventListener("click", () => setAuthMode(btn.dataset.authMode));
    });

    $("#forgotPasswordBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        showForgotPassword();
    });

    $("#backToLoginBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        setAuthMode("login");
    });
}

function setAuthMode(mode) {
    document.querySelectorAll("[data-auth-mode]").forEach((btn) => {
        const isActive = btn.dataset.authMode === mode;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-selected", String(isActive));
    });
    document.querySelectorAll("[data-auth-form]").forEach((form) => {
        form.hidden = form.dataset.authForm !== mode;
    });
    setAuthStatus("");
}

function showForgotPassword() {
    document.querySelectorAll("[data-auth-mode]").forEach((btn) => {
        btn.classList.remove("active");
    });
    document.querySelectorAll("[data-auth-form]").forEach((form) => {
        form.hidden = form.dataset.authForm !== "forgot-password";
    });
    setAuthStatus("");
}

function setAuthStatus(message, type = "") {
    const status = $("#authStatus");
    if (!status) return;
    status.textContent = message;
    status.className = `auth-status ${type}`.trim();
}
