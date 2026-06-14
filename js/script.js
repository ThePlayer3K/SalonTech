import { supabase } from "./supabase.js";

const $ = (selector) => document.querySelector(selector);
const STORAGE_KEY = "salonTechSession";

document.addEventListener("DOMContentLoaded", async () => {
    await setupAuth();
});

async function setupAuth() {
    document.querySelectorAll("[data-auth-mode]").forEach((btn) => {
        btn.addEventListener("click", () => setAuthMode(btn.dataset.authMode));
    });

    $("#loginForm")?.addEventListener("submit", handleLogin);
    $("#forgotPasswordBtn")?.addEventListener("click", (e) => { e.preventDefault(); showForgotPassword(); });
    $("#backToLoginBtn")?.addEventListener("click", (e) => { e.preventDefault(); setAuthMode("login"); });
    $("#logoutBtn")?.addEventListener("click", handleLogout);

    supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") lockApp();
    });

    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) { setAuthStatus(error.message, "error"); return; }

    if (!session?.user) { lockApp(); return; }

    unlockApp(false);
}

async function handleLogin(event) {
    event.preventDefault();
    const email = $("#loginEmail").value.trim().toLowerCase();
    const password = $("#loginPassword").value;
    const btn = event.submitter;
    if (btn) btn.disabled = true;

    try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        unlockApp(true);
        event.target.reset();
        setAuthStatus("");
    } catch (error) {
        setAuthStatus(`Não foi possível entrar: ${error.message}`, "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function handleLogout() {
    await supabase.auth.signOut();
    lockApp();
}

function lockApp() {
    localStorage.removeItem(STORAGE_KEY);
    document.body.classList.add("auth-locked");
}

function unlockApp(showMsg) {
    document.body.classList.remove("auth-locked");
    if (showMsg) alert("Bem-vindo ao SalonTech!");
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
    document.querySelectorAll("[data-auth-mode]").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll("[data-auth-form]").forEach((f) => {
        f.hidden = f.dataset.authForm !== "forgot-password";
    });
    setAuthStatus("");
}

function setAuthStatus(message, type = "") {
    const status = $("#authStatus");
    if (!status) return;
    status.textContent = message;
    status.className = `auth-status ${type}`.trim();
}
