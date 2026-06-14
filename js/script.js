import { supabase } from "./supabase.js";

const $ = (selector) => document.querySelector(selector);
const STORAGE_KEY = "salonTechAuxiliaryStore_v1";
const AUTH_MARKER_PREFIX = "auth:";
const DEFAULT_ORIGIN = "https://salontech-7ee16.web.app";
const ROLE_ADMIN = "admin";
const ROLE_PROFESSIONAL = "professional";

const storage = {
    get(key, fallback) {
        try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
        catch { return fallback; }
    },
    set(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
};

let appStore = {
    users: [], clients: [], team: [], products: [], paymentMethods: [],
    services: [], appointments: [], expenses: [],
    reviews: storage.get(STORAGE_KEY, {})?.reviews || [],
    contactRequests: storage.get(STORAGE_KEY, {})?.contactRequests || []
};

document.addEventListener("DOMContentLoaded", async () => {
    try {
        await loadStoreFromSupabase();
        await setupAuth();
    } catch (e) {
        setAuthStatus(`Erro ao conectar: ${e.message}`, "error");
    }
});

async function loadStoreFromSupabase() {
    const results = await Promise.all([
        supabase.from("usuario").select("id,nome,senha,tipo,funcionario_id").order("id"),
        supabase.from("cliente").select("id,nome,cpf,telefone,email").order("id"),
        supabase.from("funcionario").select("id,nome,cpf,telefone,cargo,tipo_pagamento,salario").order("id"),
        supabase.from("produto").select("id,nome,qtd_estoque,categoria").order("id"),
        supabase.from("forma_pagamento").select("id,nome").order("id"),
        supabase.from("servico").select("id,nome,duracao,categoria,valor,funcionario_id,percentual_comissao").order("id"),
        supabase.from("agendamento").select("id,cliente_id,forma_pag_id,situacao,data_hora,observacoes,servico_id,valor_total").order("data_hora", { ascending: false }),
        supabase.from("despesa").select("id,nome,data,valor").order("data", { ascending: false })
    ]);

    const failed = results.find((r) => r.error);
    if (failed) throw failed.error;

    const [users, clients, team, products, paymentMethods, services, appointments, expenses] = results.map((r) => r.data || []);
    const mappedServices = services.map(mapServiceRow);

    appStore = {
        ...appStore,
        users: users.map((r) => ({
            id: String(r.id), name: r.nome || "",
            authId: parseAuthMarker(r.senha), role: normalizeRole(r.tipo),
            profissionalId: r.funcionario_id == null ? "" : String(r.funcionario_id)
        })),
        clients: clients.map((r) => ({ id: String(r.id), nome: r.nome || "", cpf: r.cpf || "", telefone: r.telefone || "", email: r.email || "" })),
        team: team.map((r) => ({ id: String(r.id), nome: r.nome || "", cpf: r.cpf || "", telefone: r.telefone || "", cargo: r.cargo || "", tipoPagamento: r.tipo_pagamento || "", salario: Number(r.salario || 0) })),
        products: products.map((r) => ({ id: String(r.id), nome: r.nome || "", quantidade: Number(r.qtd_estoque || 0), categoria: r.categoria || "" })),
        paymentMethods: paymentMethods.map((r) => ({ id: String(r.id), nome: r.nome || "" })),
        services: mappedServices,
        appointments: appointments.map((r) => mapAppointmentRow(r, mappedServices)),
        expenses: expenses.map((r) => ({ id: String(r.id), nome: r.nome || "", data: r.data || "", valor: Number(r.valor || 0) }))
    };
}

function mapServiceRow(r) {
    return {
        id: String(r.id), nome: r.nome || "", duracaoMin: Number(r.duracao || 0),
        categoria: r.categoria || "", valor: Number(r.valor || 0),
        profissionalId: r.funcionario_id == null ? "" : String(r.funcionario_id),
        comissaoPct: Number(r.percentual_comissao || 0)
    };
}

function mapAppointmentRow(r, services) {
    const service = services.find((s) => s.id === String(r.servico_id));
    const dt = String(r.data_hora || "").replace(" ", "T");
    return {
        id: String(r.id), clienteId: r.cliente_id == null ? "" : String(r.cliente_id),
        servicoId: r.servico_id == null ? "" : String(r.servico_id),
        profissionalId: service?.profissionalId || "",
        valor: Number(r.valor_total ?? 0), data: dt.slice(0, 10), hora: dt.slice(11, 16),
        formaPagamentoId: r.forma_pag_id == null ? "" : String(r.forma_pag_id),
        situacao: r.situacao || "Agendado", observacoes: r.observacoes || ""
    };
}

function normalizeRole(role) {
    const v = String(role || "").toLowerCase();
    return ["f", "p", ROLE_PROFESSIONAL, "profissional", "funcionario"].includes(v) ? ROLE_PROFESSIONAL : ROLE_ADMIN;
}

function parseAuthMarker(value) {
    const v = String(value || "");
    return v.startsWith(AUTH_MARKER_PREFIX) ? v.slice(AUTH_MARKER_PREFIX.length) : "";
}

function normalizeCpf(value) { return String(value || "").replace(/\D/g, "").slice(0, 11); }
function formatCpf(value) {
    const d = normalizeCpf(value);
    return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function getCurrentSession() { return storage.get("salonTechSession", null); }
function getCurrentUser() {
    const s = getCurrentSession();
    if (!s) return null;
    return appStore.users.find((u) => u.id === s.userId) || null;
}

async function setupAuth() {
    const input = $("#registerCpf");
    if (input) input.oninput = (e) => { e.target.value = formatCpf(e.target.value); };

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

    const dbUser = appStore.users.find((u) => u.authId === session.user.id);
    if (!dbUser) { lockApp(); return; }
    storage.set("salonTechSession", { userId: dbUser.id, role: dbUser.role });
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
        const dbUser = appStore.users.find((u) => u.authId === data.user.id);
        if (!dbUser) { await supabase.auth.signOut(); throw new Error("Conta sem vínculo no sistema."); }
        storage.set("salonTechSession", { userId: dbUser.id, role: dbUser.role });
        unlockApp(true);
        event.target.reset();
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
    const professional = appStore.team.find((t) => normalizeCpf(t.cpf) === cpf);
    if (!professional) { setAuthStatus("CPF não encontrado na equipe.", "error"); return; }
    const btn = event.submitter;
    if (btn) btn.disabled = true;
    try {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { nome: name, cpf, role, funcionario_id: Number(professional.id) }, emailRedirectTo: `${DEFAULT_ORIGIN}/` } });
        if (error) throw error;
        await supabase.from("usuario").insert({ nome: name, senha: `${AUTH_MARKER_PREFIX}${data.user.id}`, tipo: role === ROLE_ADMIN ? "A" : "F", funcionario_id: Number(professional.id) });
        await loadStoreFromSupabase();
        if (data.session) {
            const dbUser = appStore.users.find((u) => u.authId === data.user.id);
            if (dbUser) { storage.set("salonTechSession", { userId: dbUser.id, role: dbUser.role }); unlockApp(true); }
        } else { setAuthStatus("Confirme o e-mail para entrar.", "success"); }
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
        setAuthStatus("Link enviado. Verifique seu e-mail.", "success");
    } catch (e) { setAuthStatus(getAuthErrorMessage(e), "error"); }
    finally { if (btn) btn.disabled = false; }
}

async function handleResetPassword(event) {
    event.preventDefault();
    const password = $("#resetNewPassword").value;
    if (password !== $("#resetConfirmPassword").value) { setAuthStatus("As senhas não correspondem.", "error"); return; }
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
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${DEFAULT_ORIGIN}/` } });
    if (error) setAuthStatus(error.message, "error");
}

async function handleLogout() { await supabase.auth.signOut(); lockApp(); }

function lockApp() { localStorage.removeItem("salonTechSession"); document.body.classList.add("auth-locked"); }
function unlockApp(showMsg) { document.body.classList.remove("auth-locked"); if (showMsg) console.log("Sessão iniciada."); }

function setAuthMode(mode) {
    document.querySelectorAll("[data-auth-mode]").forEach((b) => { b.classList.toggle("active", b.dataset.authMode === mode); b.setAttribute("aria-selected", String(b.dataset.authMode === mode)); });
    document.querySelectorAll("[data-auth-form]").forEach((f) => { f.hidden = f.dataset.authForm !== mode; });
    setAuthStatus("");
}

function setResetMode(mode) {
    $("#forgotPasswordForm")?.reset();
    document.querySelectorAll("[data-auth-mode]").forEach((b) => { b.classList.toggle("active", b.dataset.authMode === "login" && mode === "login"); });
    document.querySelectorAll("[data-auth-form]").forEach((f) => { f.hidden = f.dataset.authForm !== mode; });
    setAuthStatus("");
}

function setAuthStatus(msg, type = "") { const s = $("#authStatus"); if (!s) return; s.textContent = msg; s.className = `auth-status ${type}`.trim(); }
function getAuthErrorMessage(error) {
    const msg = String(error?.message || error || "erro desconhecido");
    return { "Invalid login credentials": "e-mail ou senha inválidos", "User already registered": "e-mail já cadastrado" }[msg] || msg;
}
