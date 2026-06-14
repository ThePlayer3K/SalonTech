import { supabase } from "./supabase.js";

const $ = (selector) => document.querySelector(selector);
const ROLE_ADMIN = "admin";
const ROLE_PROFESSIONAL = "professional";
const AUTH_MARKER_PREFIX = "auth:";
const DEFAULT_ORIGIN = "https://salontech-7ee16.web.app";

let appStore = { users: [], team: [] };

document.addEventListener("DOMContentLoaded", async () => {
    try {
        await loadUsers();
        await setupAuth();
    } catch (e) {
        setAuthStatus(`Erro ao iniciar: ${e.message}`, "error");
    }
});

async function loadUsers() {
    const { data, error } = await supabase.from("usuario").select("id,nome,senha,tipo,funcionario_id").order("id");
    if (error) throw error;
    const { data: team, error: teamErr } = await supabase.from("funcionario").select("id,nome,cpf").order("id");
    if (teamErr) throw teamErr;
    appStore.users = (data || []).map((r) => ({
        id: String(r.id), name: r.nome || "", authId: parseAuthMarker(r.senha),
        role: normalizeRole(r.tipo), profissionalId: r.funcionario_id == null ? "" : String(r.funcionario_id)
    }));
    appStore.team = (team || []).map((r) => ({ id: String(r.id), nome: r.nome || "", cpf: r.cpf || "" }));
}

async function setupAuth() {
    setupCpfMask("#registerCpf");
    setupCpfMask("#forgotPasswordCpf");

    document.querySelectorAll("[data-auth-mode]").forEach((btn) =>
        btn.addEventListener("click", () => setAuthMode(btn.dataset.authMode)));

    $("#loginForm")?.addEventListener("submit", handleLogin);
    $("#registerForm")?.addEventListener("submit", handleRegister);
    $("#forgotPasswordBtn")?.addEventListener("click", (e) => { e.preventDefault(); setResetMode("forgot-password"); });
    $("#backToLoginBtn")?.addEventListener("click", (e) => { e.preventDefault(); setResetMode("login"); });
    $("#forgotPasswordForm")?.addEventListener("submit", handleForgotPassword);
    $("#resetPasswordForm")?.addEventListener("submit", handleResetPassword);
    $("#googleLoginBtn")?.addEventListener("click", startGoogleOAuth);
    $("#googleRegisterBtn")?.addEventListener("click", startGoogleOAuth);
    $("#logoutBtn")?.addEventListener("click", handleLogout);

    supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") setAuthMode("reset-password");
        if (event === "SIGNED_OUT") lockApp();
    });

    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;

    if (window.location.hash.includes("type=recovery")) { setAuthMode("reset-password"); return; }
    if (!session?.user) { lockApp(); return; }

    const dbUser = resolveDatabaseUser(session.user);
    if (!dbUser) { lockApp(); return; }
    localStorage.setItem("salonTechSession", JSON.stringify({ userId: dbUser.id, role: dbUser.role }));
    unlockApp(false);
}

async function handleLogin(event) {
    event.preventDefault();
    const email = $("#loginEmail").value.trim().toLowerCase();
    const password = $("#loginPassword").value;
    const btn = event.submitter;
    if (btn) btn.disabled = true;
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const dbUser = resolveDatabaseUser(data.user);
        if (!dbUser) { await supabase.auth.signOut(); throw new Error("Conta sem vínculo no sistema."); }
        localStorage.setItem("salonTechSession", JSON.stringify({ userId: dbUser.id, role: dbUser.role }));
        unlockApp(true);
        event.target.reset();
        setAuthStatus("");
    } catch (e) { setAuthStatus(getAuthErrorMessage(e), "error"); }
    finally { if (btn) btn.disabled = false; }
}

async function handleRegister(event) {
    event.preventDefault();
    const name = $("#registerName").value.trim();
    const email = $("#registerEmail").value.trim().toLowerCase();
    const cpf = normalizeCpf($("#registerCpf").value);
    const password = $("#registerPassword").value;
    const role = $("#registerRole").value;
    if (cpf.length !== 11) { setAuthStatus("CPF inválido.", "error"); return; }
    const professional = findTeamByCpf(cpf);
    if (!professional) { setAuthStatus("CPF não encontrado na equipe.", "error"); return; }
    const btn = event.submitter;
    if (btn) btn.disabled = true;
    try {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { nome: name, cpf, role, funcionario_id: Number(professional.id) }, emailRedirectTo: `${DEFAULT_ORIGIN}/` } });
        if (error) throw error;
        await supabase.from("usuario").insert({ nome: name, senha: `${AUTH_MARKER_PREFIX}${data.user.id}`, tipo: role === ROLE_ADMIN ? "A" : "F", funcionario_id: Number(professional.id) });
        if (data.session) { unlockApp(true); } else { setAuthStatus("Confirme o e-mail para entrar.", "success"); }
        event.target.reset();
    } catch (e) { setAuthStatus(getAuthErrorMessage(e), "error"); }
    finally { if (btn) btn.disabled = false; }
}

async function handleForgotPassword(event) {
    event.preventDefault();
    const email = $("#forgotPasswordEmail").value.trim().toLowerCase();
    const btn = event.submitter;
    if (btn) btn.disabled = true;
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${DEFAULT_ORIGIN}/?type=recovery` });
        if (error) throw error;
        event.target.reset();
        setAuthStatus("Link de recuperação enviado.", "success");
    } catch (e) { setAuthStatus(getAuthErrorMessage(e), "error"); }
    finally { if (btn) btn.disabled = false; }
}

async function handleResetPassword(event) {
    event.preventDefault();
    const password = $("#resetNewPassword").value;
    const confirm = $("#resetConfirmPassword").value;
    if (password !== confirm) { setAuthStatus("As senhas não correspondem.", "error"); return; }
    const btn = event.submitter;
    if (btn) btn.disabled = true;
    try {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        event.target.reset();
        setAuthStatus("Senha atualizada!", "success");
        setTimeout(() => setAuthMode("login"), 1500);
    } catch (e) { setAuthStatus(getAuthErrorMessage(e), "error"); }
    finally { if (btn) btn.disabled = false; }
}

async function startGoogleOAuth() {
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${DEFAULT_ORIGIN}/`, queryParams: { prompt: "select_account" } } });
    if (error) setAuthStatus(error.message, "error");
}

async function handleLogout() {
    await supabase.auth.signOut();
    lockApp();
}

function lockApp() {
    localStorage.removeItem("salonTechSession");
    document.body.classList.add("auth-locked");
}

function unlockApp(showMsg) {
    document.body.classList.remove("auth-locked");
    if (showMsg) showToast("Bem-vindo ao SalonTech!", "success");
}

function showToast(message) {
    alert(message);
}

function resolveDatabaseUser(authUser) {
    if (!authUser) return null;
    return appStore.users.find((u) => u.authId === authUser.id) || null;
}

function findTeamByCpf(cpf) {
    return appStore.team.find((t) => normalizeCpf(t.cpf) === cpf) || null;
}

function normalizeRole(role) {
    const v = String(role || "").toLowerCase();
    return ["f", "p", "professional", "profissional", "funcionario"].includes(v) ? ROLE_PROFESSIONAL : ROLE_ADMIN;
}

function parseAuthMarker(value) {
    const v = String(value || "");
    return v.startsWith(AUTH_MARKER_PREFIX) ? v.slice(AUTH_MARKER_PREFIX.length) : "";
}

function normalizeCpf(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 11);
}

function formatCpf(value) {
    const d = normalizeCpf(value);
    return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function setupCpfMask(selector) {
    const input = $(selector);
    if (!input) return;
    input.oninput = (e) => { e.target.value = formatCpf(e.target.value); };
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

function setResetMode(mode) {
    $("#forgotPasswordForm")?.reset();
    document.querySelectorAll("[data-auth-mode]").forEach((btn) => {
        const isActive = btn.dataset.authMode === "login" && mode === "login";
        btn.classList.toggle("active", isActive);
    });
    document.querySelectorAll("[data-auth-form]").forEach((form) => {
        form.hidden = form.dataset.authForm !== mode;
    });
    setAuthStatus("");
}

function setAuthStatus(message, type = "") {
    const status = $("#authStatus");
    if (!status) return;
    status.textContent = message;
    status.className = `auth-status ${type}`.trim();
}

function getAuthErrorMessage(error) {
    const msg = String(error?.message || error || "erro desconhecido");
    const map = { "Invalid login credentials": "e-mail ou senha inválidos", "User already registered": "e-mail já cadastrado" };
    return map[msg] || msg;
}
