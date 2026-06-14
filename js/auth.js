import { supabase } from "./supabase.js";
import { ROLE_ADMIN, ROLE_PROFESSIONAL, DEFAULT_PUBLISHED_ORIGIN, PUBLISHED_ORIGINS } from "./config.js";
import { $, normalizeCpf, formatCpf, showToast } from "./utils.js";
import {
    getStore,
    storage,
    loadStoreFromSupabase,
    encodeRole,
    authMarker
} from "./store.js";
import { setAuthStatus, setResetMode } from "./ui.js";

let _onUnlockCallback = () => {};

export function setOnUnlockCallback(fn) {
    _onUnlockCallback = fn;
}

export async function setupAuth() {
    setupRegisterCpfControl();
    setupForgotPasswordCpfControl();
    setupGoogleCpfControl();

    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
        button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
    });

    $("#loginForm")?.addEventListener("submit", handleLogin);
    $("#registerForm")?.addEventListener("submit", handleRegister);
    $("#forgotPasswordBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        setResetMode("forgot-password");
    });
    $("#backToLoginBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        setResetMode("login");
    });
    $("#forgotPasswordForm")?.addEventListener("submit", handleForgotPassword);
    $("#resetPasswordForm")?.addEventListener("submit", handleResetPassword);
    $("#googleAccessForm")?.addEventListener("submit", handleGoogleAccess);
    $("#googleLoginBtn")?.addEventListener("click", startGoogleOAuth);
    $("#googleRegisterBtn")?.addEventListener("click", startGoogleOAuth);
    $("#backFromGoogleBtn")?.addEventListener("click", handleBackFromGoogle);
    $("#logoutBtn")?.addEventListener("click", handleLogout);

    supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") setAuthMode("reset-password");
        if (event === "SIGNED_OUT") lockApp();
    });

    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;

    if (isPasswordRecoveryReturn()) {
        setAuthMode("reset-password");
        return;
    }

    if (!session?.user) {
        lockApp();
        return;
    }

    try {
        const provider = session.user.app_metadata?.provider;
        const databaseUser = provider === "google"
            ? await completeGoogleAuth(session.user)
            : resolveDatabaseUser(session.user);
        if (!databaseUser && provider === "google") {
            setAuthMode("google");
            setAuthStatus("Confirme seu CPF para vincular a conta Google ao funcionario.");
            return;
        }
        if (!databaseUser) throw new Error("Conta autenticada sem vinculo com a tabela usuario.");
        storage.set("salonTechSession", createSession(databaseUser, session.user));
        unlockApp(false);
    } catch (authError) {
        await supabase.auth.signOut();
        setAuthStatus(getAuthErrorMessage(authError), "error");
    }
}

export function setupRegisterCpfControl() {
    const input = $("#registerCpf");
    if (!input) return;
    input.oninput = (event) => {
        event.target.value = formatCpf(event.target.value);
    };
}

function setupForgotPasswordCpfControl() {
    const input = $("#forgotPasswordCpf");
    if (!input) return;
    input.oninput = (event) => {
        event.target.value = formatCpf(event.target.value);
    };
}

function setupGoogleCpfControl() {
    const input = $("#googleCpf");
    if (!input) return;
    input.oninput = (event) => {
        event.target.value = formatCpf(event.target.value);
    };
}

export function setAuthMode(mode) {
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
        const isActive = button.dataset.authMode === mode;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-selected", String(isActive));
    });

    document.querySelectorAll("[data-auth-form]").forEach((form) => {
        form.hidden = form.dataset.authForm !== mode;
    });

    setAuthStatus("");
}

async function handleLogin(event) {
    event.preventDefault();
    const email = $("#loginEmail").value.trim().toLowerCase();
    const password = $("#loginPassword").value;
    const submitButton = event.submitter;
    if (submitButton) submitButton.disabled = true;

    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const databaseUser = resolveDatabaseUser(data.user);
        if (!databaseUser) {
            await supabase.auth.signOut();
            throw new Error("Esta conta do Auth nao esta vinculada a um funcionario do sistema.");
        }

        storage.set("salonTechSession", createSession(databaseUser, data.user));
        unlockApp(true);
        event.target.reset();
        setAuthStatus("");
    } catch (error) {
        setAuthStatus(`Nao foi possivel entrar: ${getAuthErrorMessage(error)}`, "error");
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

async function handleRegister(event) {
    event.preventDefault();
    const name = $("#registerName").value.trim();
    const email = $("#registerEmail").value.trim().toLowerCase();
    const cpf = normalizeCpf($("#registerCpf").value);
    const password = $("#registerPassword").value;
    const role = $("#registerRole").value === ROLE_ADMIN ? ROLE_ADMIN : ROLE_PROFESSIONAL;

    if (cpf.length !== 11) {
        setAuthStatus("Informe um CPF com 11 digitos.", "error");
        return;
    }

    const professional = requireProfessionalByCpf(cpf);
    if (!professional) return;

    const existingUser = getStore().users.find((user) => user.profissionalId === professional.id);
    if (existingUser?.authId) {
        setAuthStatus("Este funcionario ja possui uma conta no Supabase Auth.", "error");
        return;
    }

    const submitButton = event.submitter;
    if (submitButton) submitButton.disabled = true;

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    nome: name,
                    cpf,
                    role,
                    funcionario_id: Number(professional.id)
                },
                emailRedirectTo: authRedirectUrl()
            }
        });
        if (error) throw error;
        if (!data.user || data.user.identities?.length === 0) {
            throw new Error("Este e-mail ja esta cadastrado no Supabase Auth.");
        }

        const databaseUser = await linkAuthenticatedUser(data.user, professional, role, name);
        event.target.reset();
        if (data.session) {
            storage.set("salonTechSession", createSession(databaseUser, data.user));
            unlockApp(true);
            setAuthStatus("");
        } else {
            setAuthStatus("Cadastro criado. Confirme o e-mail para entrar.", "success");
        }
    } catch (error) {
        console.error("Falha ao cadastrar usuario", error);
        setAuthStatus(`Nao foi possivel criar a conta: ${getAuthErrorMessage(error)}`, "error");
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

function createSession(user, authUser) {
    return {
        userId: user.id,
        authUserId: authUser?.id || user.authId,
        email: authUser?.email || "",
        name: user.name,
        role: user.role || ROLE_ADMIN,
        profissionalId: user.profissionalId || "",
        startedAt: new Date().toISOString()
    };
}

function requireProfessionalByCpf(cpf) {
    const matches = getStore().team.filter((item) => normalizeCpf(item.cpf) === cpf);
    if (!matches.length) {
        setAuthStatus("CPF nao encontrado na equipe.", "error");
        return null;
    }
    if (matches.length > 1) {
        setAuthStatus("CPF duplicado na equipe. Solicite a correcao ao administrador.", "error");
        return null;
    }
    return matches[0];
}

export function resolveDatabaseUser(authUser) {
    if (!authUser) return null;
    const byAuthId = getStore().users.find((user) => user.authId === authUser.id);
    if (byAuthId) return byAuthId;

    const professionalId = authUser.user_metadata?.funcionario_id;
    if (!professionalId) return null;
    return getStore().users.find((user) => user.profissionalId === String(professionalId) && user.authId === authUser.id) || null;
}

async function linkAuthenticatedUser(authUser, professional, requestedRole, displayName) {
    const existingUser = getStore().users.find((user) => user.profissionalId === professional.id);
    if (existingUser?.authId && existingUser.authId !== authUser.id) {
        throw new Error("Este funcionario ja esta vinculado a outra conta do Supabase Auth.");
    }

    const role = existingUser?.authId ? existingUser.role : requestedRole;
    const payload = {
        nome: displayName || existingUser?.name || professional.nome,
        senha: authMarker(authUser.id),
        tipo: encodeRole(role),
        funcionario_id: Number(professional.id)
    };

    const query = existingUser
        ? supabase.from("usuario").update(payload).eq("id", Number(existingUser.id))
        : supabase.from("usuario").insert(payload);
    const { error } = await query;
    if (error) throw error;

    if (authUser.id === (await supabase.auth.getUser()).data.user?.id) {
        const { error: metadataError } = await supabase.auth.updateUser({
            data: {
                nome: payload.nome,
                cpf: normalizeCpf(professional.cpf),
                role,
                funcionario_id: Number(professional.id)
            }
        });
        if (metadataError) throw metadataError;
    }

    await loadStoreFromSupabase();
    return getStore().users.find((user) => user.authId === authUser.id);
}

async function handleGoogleAccess(event) {
    event.preventDefault();
    const cpf = normalizeCpf($("#googleCpf").value);
    const role = $("#googleRole").value === ROLE_ADMIN ? ROLE_ADMIN : ROLE_PROFESSIONAL;
    if (cpf.length !== 11) {
        setAuthStatus("Informe um CPF com 11 digitos.", "error");
        return;
    }

    const professional = requireProfessionalByCpf(cpf);
    if (!professional) return;

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
        setAuthStatus(`Nao foi possivel validar a sessao Google: ${getAuthErrorMessage(sessionError)}`, "error");
        return;
    }
    if (!session?.user || session.user.app_metadata?.provider !== "google") {
        setAuthStatus("Inicie o acesso com Google antes de confirmar o CPF.", "error");
        return;
    }

    try {
        const displayName = session.user.user_metadata?.full_name
            || session.user.user_metadata?.name
            || professional.nome;
        const databaseUser = await linkAuthenticatedUser(session.user, professional, role, displayName);
        storage.set("salonTechSession", createSession(databaseUser, session.user));
        event.target.reset();
        unlockApp(true);
        setAuthStatus("");
    } catch (error) {
        setAuthStatus(`Nao foi possivel vincular a conta Google: ${getAuthErrorMessage(error)}`, "error");
    }
}

async function startGoogleOAuth() {
    const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
            redirectTo: authRedirectUrl(),
            queryParams: { prompt: "select_account" }
        }
    });
    if (error) {
        setAuthStatus(`Nao foi possivel abrir o Google: ${getAuthErrorMessage(error)}`, "error");
    }
}

async function completeGoogleAuth(authUser) {
    return resolveDatabaseUser(authUser) || null;
}

async function handleLogout() {
    await supabase.auth.signOut();
    lockApp();
    showToast("Sessao encerrada.");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function handleBackFromGoogle() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.app_metadata?.provider === "google" && !resolveDatabaseUser(session.user)) {
        await supabase.auth.signOut();
    }
    setAuthMode("login");
}

export function lockApp() {
    localStorage.removeItem("salonTechSession");
    document.body.classList.add("auth-locked");
}

export function unlockApp(showMessage) {
    document.body.classList.remove("auth-locked");
    _onUnlockCallback();
    if (showMessage) showToast("Bem-vindo ao SalonTech.", "success");
}

function authRedirectUrl() {
    const origin = PUBLISHED_ORIGINS.has(window.location.origin)
        ? window.location.origin
        : DEFAULT_PUBLISHED_ORIGIN;
    return `${origin}/`;
}

function isPasswordRecoveryReturn() {
    return window.location.hash.includes("type=recovery") || new URLSearchParams(window.location.search).get("type") === "recovery";
}

function getAuthErrorMessage(error) {
    const message = String(error?.message || error || "erro desconhecido");
    const translations = {
        "Invalid login credentials": "e-mail ou senha invalidos",
        "User already registered": "este e-mail ja esta cadastrado",
        "Password should be at least 6 characters": "a senha deve ter pelo menos 6 caracteres"
    };
    return translations[message] || message;
}

async function handleForgotPassword(event) {
    event.preventDefault();
    const email = $("#forgotPasswordEmail").value.trim().toLowerCase();
    const cpfNormalized = normalizeCpf($("#forgotPasswordCpf").value);

    if (cpfNormalized.length !== 11) {
        setAuthStatus("CPF invalido. Informe um CPF com 11 digitos.", "error");
        return;
    }

    const submitButton = event.submitter;
    if (submitButton) submitButton.disabled = true;

    try {
        const professional = requireProfessionalByCpf(cpfNormalized);
        if (!professional) return;
        const databaseUser = getStore().users.find((user) => user.profissionalId === professional.id && user.authId);
        if (!databaseUser) {
            setAuthStatus("Este CPF ainda nao possui uma conta no Supabase Auth.", "error");
            return;
        }

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${authRedirectUrl()}?type=recovery`
        });
        if (error) throw error;
        event.target.reset();
        setAuthStatus("Se o e-mail pertencer a esta conta, o link de recuperacao foi enviado.", "success");
    } catch (error) {
        console.error("Falha ao solicitar recuperacao", error);
        setAuthStatus(`Erro ao solicitar recuperacao: ${getAuthErrorMessage(error)}`, "error");
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

async function handleResetPassword(event) {
    event.preventDefault();
    const password = $("#resetNewPassword").value;
    const confirmation = $("#resetConfirmPassword").value;
    if (password !== confirmation) {
        setAuthStatus("As senhas nao correspondem.", "error");
        return;
    }
    if (password.length < 6) {
        setAuthStatus("A senha deve ter pelo menos 6 caracteres.", "error");
        return;
    }

    const submitButton = event.submitter;
    if (submitButton) submitButton.disabled = true;
    try {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        event.target.reset();
        const origin = PUBLISHED_ORIGINS.has(window.location.origin)
            ? window.location.origin
            : DEFAULT_PUBLISHED_ORIGIN;
        window.history.replaceState({}, document.title, `${origin}/`);
        setAuthStatus("Senha atualizada no Supabase Auth.", "success");
        window.setTimeout(() => setAuthMode("login"), 1500);
    } catch (error) {
        setAuthStatus(`Nao foi possivel atualizar a senha: ${getAuthErrorMessage(error)}`, "error");
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}
