import { supabase } from "./supabase.js";

const $ = (selector) => document.querySelector(selector);
const STORAGE_KEY = "salonTechAuxiliaryStore_v1";
const AUTH_MARKER_PREFIX = "auth:";
const DEFAULT_ORIGIN = "https://salontech-7ee16.web.app";
const ROLE_ADMIN = "admin";
const ROLE_PROFESSIONAL = "professional";

const storage = {
    get(key, fb) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch { return fb; } },
    set(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
};

let appStore = {
    users: [], clients: [], team: [], products: [], paymentMethods: [],
    services: [], appointments: [], expenses: [],
    reviews: storage.get(STORAGE_KEY, {})?.reviews || [],
    contactRequests: storage.get(STORAGE_KEY, {})?.contactRequests || []
};

const moduleOrder = ["clients","appointments","services","team","products","expenses","paymentMethods","finances"];
const statusLabels = ["Agendado","Pago","Concluído","Cancelado"];
const adminModules = {
    clients: { label:"Clientes", kicker:"Cadastro de clientes", submitLabel:"Salvar cliente", storeKey:"clients", titleField:"nome",
        fields:[{name:"nome",label:"Nome",required:true,placeholder:"Nome do cliente"},{name:"cpf",label:"CPF",required:true,placeholder:"000.000.000-00",inputmode:"numeric",maxlength:"14"},{name:"telefone",label:"Telefone",required:true,placeholder:"(00) 00000-0000",inputmode:"numeric",maxlength:"15"},{name:"email",label:"E-mail",type:"email",placeholder:"cliente@email.com"}]},
    appointments: { label:"Agendamentos", kicker:"Servicos prestados", submitLabel:"Salvar agendamento", storeKey:"appointments", titleField:"clienteId",
        fields:[{name:"clienteId",label:"Cliente",type:"select",source:"clients",optionLabel:"nome",required:true},{name:"servicoId",label:"Servico",type:"select",source:"services",optionLabel:"nome",required:true},{name:"data",label:"Data",type:"date",required:true},{name:"hora",label:"Hora",type:"time",required:true},{name:"formaPagamentoId",label:"Pagamento",type:"select",source:"paymentMethods",optionLabel:"nome"},{name:"situacao",label:"Situacao",type:"select",options:statusLabels,required:true},{name:"observacoes",label:"Observacoes",type:"textarea",span:2}]},
    services: { label:"Serviços", kicker:"Catalogo editavel", submitLabel:"Salvar serviço", storeKey:"services", titleField:"nome",
        fields:[{name:"nome",label:"Nome",required:true},{name:"categoria",label:"Categoria",type:"select",options:[{value:"Cabelo",label:"Cabelo"},{value:"Unhas",label:"Unhas"},{value:"Estetica",label:"Estética"},{value:"Sobrancelha",label:"Sobrancelha"}],required:true},{name:"valor",label:"Valor",type:"number",step:"0.01",min:"0",required:true},{name:"duracaoMin",label:"Duração (min)",type:"number",min:"1",required:true},{name:"profissionalId",label:"Profissional",type:"select",source:"team",optionLabel:"nome",required:true},{name:"comissaoPct",label:"Comissão (%)",type:"number",min:"0",max:"100",step:"1",required:true}]},
    team: { label:"Equipe", kicker:"Profissionais", submitLabel:"Salvar profissional", storeKey:"team", titleField:"nome",
        fields:[{name:"nome",label:"Nome",required:true},{name:"cpf",label:"CPF",placeholder:"000.000.000-00",inputmode:"numeric",maxlength:"14"},{name:"telefone",label:"Telefone",inputmode:"numeric",maxlength:"15"},{name:"cargo",label:"Especialidade",required:true},{name:"tipoPagamento",label:"Tipo de pagamento"},{name:"salario",label:"Salario",type:"number",step:"0.01",min:"0"}]},
    products: { label:"Produtos", kicker:"Estoque", submitLabel:"Salvar produto", storeKey:"products", titleField:"nome",
        fields:[{name:"nome",label:"Produto",required:true},{name:"quantidade",label:"Quantidade",type:"number",min:"0",required:true},{name:"categoria",label:"Categoria"}]},
    expenses: { label:"Despesas", kicker:"Gastos", submitLabel:"Salvar despesa", storeKey:"expenses", titleField:"nome",
        fields:[{name:"nome",label:"Descrição",required:true},{name:"data",label:"Data",type:"date",required:true},{name:"valor",label:"Valor",type:"number",step:"0.01",min:"0",required:true}]},
    paymentMethods: { label:"Pagamentos", kicker:"Formas de pagamento", submitLabel:"Salvar forma", storeKey:"paymentMethods", titleField:"nome",
        fields:[{name:"nome",label:"Nome",required:true,placeholder:"Pix, dinheiro, cartao..."}]},
    finances: { label:"Finanças", kicker:"Entradas x despesas", submitLabel:"Atualizar relatório", storeKey:"finances", fields:[{name:"inicio",label:"Inicio",type:"date",required:true},{name:"fim",label:"Fim",type:"date",required:true}], readonly:true }
};

let currentAdminModule = "clients";

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
    appStore = { ...appStore,
        users: users.map((r) => ({ id:String(r.id), name:r.nome||"", authId:parseAuthMarker(r.senha), role:normalizeRole(r.tipo), profissionalId:r.funcionario_id==null?"":String(r.funcionario_id) })),
        clients: clients.map((r) => ({ id:String(r.id), nome:r.nome||"", cpf:r.cpf||"", telefone:r.telefone||"", email:r.email||"" })),
        team: team.map((r) => ({ id:String(r.id), nome:r.nome||"", cpf:r.cpf||"", telefone:r.telefone||"", cargo:r.cargo||"", tipoPagamento:r.tipo_pagamento||"", salario:Number(r.salario||0) })),
        products: products.map((r) => ({ id:String(r.id), nome:r.nome||"", quantidade:Number(r.qtd_estoque||0), categoria:r.categoria||"" })),
        paymentMethods: paymentMethods.map((r) => ({ id:String(r.id), nome:r.nome||"" })),
        services: mappedServices,
        appointments: appointments.map((r) => mapAppointmentRow(r, mappedServices)),
        expenses: expenses.map((r) => ({ id:String(r.id), nome:r.nome||"", data:r.data||"", valor:Number(r.valor||0) }))
    };
}

function mapServiceRow(r) { return { id:String(r.id), nome:r.nome||"", duracaoMin:Number(r.duracao||0), categoria:r.categoria||"", valor:Number(r.valor||0), profissionalId:r.funcionario_id==null?"":String(r.funcionario_id), comissaoPct:Number(r.percentual_comissao||0) }; }
function mapAppointmentRow(r, services) { const s=services.find((x)=>x.id===String(r.servico_id)); const dt=String(r.data_hora||"").replace(" ","T"); return { id:String(r.id), clienteId:r.cliente_id==null?"":String(r.cliente_id), servicoId:r.servico_id==null?"":String(r.servico_id), profissionalId:s?.profissionalId||"", valor:Number(r.valor_total??0), data:dt.slice(0,10), hora:dt.slice(11,16), formaPagamentoId:r.forma_pag_id==null?"":String(r.forma_pag_id), situacao:r.situacao||"Agendado", observacoes:r.observacoes||"" }; }
function normalizeRole(role) { const v=String(role||"").toLowerCase(); return ["f","p",ROLE_PROFESSIONAL,"profissional","funcionario"].includes(v)?ROLE_PROFESSIONAL:ROLE_ADMIN; }
function parseAuthMarker(value) { const v=String(value||""); return v.startsWith(AUTH_MARKER_PREFIX)?v.slice(AUTH_MARKER_PREFIX.length):""; }
function normalizeCpf(value) { return String(value||"").replace(/\D/g,"").slice(0,11); }
function formatCpf(value) { const d=normalizeCpf(value); return d.replace(/^(\d{3})(\d)/,"$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/,"$1.$2.$3").replace(/\.(\d{3})(\d)/,".$1-$2"); }
function formatPhone(value) { const d=String(value||"").replace(/\D/g,"").slice(0,11); if(d.length<=2) return d; if(d.length<=6) return `(${d.slice(0,2)}) ${d.slice(2)}`; if(d.length<=10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`; return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`; }
function formatCurrency(value) { return Number(value||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
function formatDate(value) { if(!value) return ""; const [y,m,d]=String(value).split("-"); return `${d}/${m}/${y}`; }
function formatCategory(cat) { return {Cabelo:"Cabelo",Unhas:"Unhas",Estetica:"Estética",Sobrancelha:"Sobrancelha"}[cat]||cat||""; }
function escapeHtml(text) { return String(text||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function todayISO() { return new Date().toISOString().slice(0,10); }
function monthStartISO() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; }
function displayValue(storeKey, id) { if(!id) return "Nao informado"; const r=(appStore[storeKey]||[]).find((x)=>x.id===String(id)); return r?.nome||r?.name||String(id); }

function setupAdmin() {
    renderAdminTabs();
    renderAdminModule();
    $("#adminEntityForm")?.addEventListener("submit", (event) => { event.preventDefault(); alert("Salvar: funcionalidade em desenvolvimento."); });
    document.querySelectorAll("[data-open-module]").forEach((a) => a.addEventListener("click", () => openAdminModule(a.dataset.openModule)));
}

function openAdminModule(key) {
    currentAdminModule = key;
    renderAdminTabs();
    renderAdminModule();
}

function renderAdminTabs() {
    const tabs = $("#adminTabs");
    if (!tabs) return;
    tabs.innerHTML = moduleOrder.map((key) => {
        const mod = adminModules[key];
        return `<button type="button" class="${key===currentAdminModule?"active":""}" data-admin-module="${key}" role="tab" aria-selected="${key===currentAdminModule}">${mod.label}</button>`;
    }).join("");
    tabs.querySelectorAll("[data-admin-module]").forEach((btn) => btn.addEventListener("click", () => openAdminModule(btn.dataset.adminModule)));
}

function renderAdminModule() {
    const mod = adminModules[currentAdminModule];
    const records = currentAdminModule === "finances" ? [] : (appStore[mod.storeKey] || []);
    $("#adminEntityKicker").textContent = mod.kicker;
    $("#adminEntityTitle").textContent = mod.label;
    $("#adminSubmitBtn").textContent = mod.submitLabel;
    $("#adminRecordCount").textContent = mod.readonly ? "Relatório" : `${records.length} registros`;
    $("#adminCancelEditBtn").hidden = true;
    const fieldsGrid = $("#adminFieldsGrid");
    fieldsGrid.innerHTML = mod.fields.map((field) => renderField(field, mod)).join("");
    if (currentAdminModule === "appointments") { $("#admin-data").value = todayISO(); $("#admin-hora").value = "14:00"; $("#admin-situacao").value = "Agendado"; }
    if (currentAdminModule === "expenses") { $("#admin-data").value = todayISO(); }
    if (currentAdminModule === "services") { if($("#admin-comissaoPct")) $("#admin-comissaoPct").value = "20"; }
    if (currentAdminModule === "finances") { if($("#admin-inicio")) $("#admin-inicio").value = monthStartISO(); if($("#admin-fim")) $("#admin-fim").value = todayISO(); }
    renderAdminRecords(records);
}

function renderField(field) {
    const type = field.type || "text";
    const spanClass = field.span ? ` span-${field.span}` : "";
    const attrs = [`id="admin-${field.name}"`, `name="${field.name}"`, field.required?"required":"", field.placeholder?`placeholder="${escapeHtml(field.placeholder)}"`:"", field.step?`step="${field.step}"`:"", field.min?`min="${field.min}"`:"", field.max?`max="${field.max}"`:"", field.inputmode?`inputmode="${field.inputmode}"`:"", field.maxlength?`maxlength="${field.maxlength}"`:""].filter(Boolean).join(" ");
    if (type === "select") {
        const empty = field.required ? `<option value="">Selecione</option>` : `<option value="">Nao informado</option>`;
        let opts = "";
        if (field.options) { opts = field.options.map((o) => { const l=typeof o==="object"?o.label:o; const v=typeof o==="object"?o.value:o; return `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`; }).join(""); }
        else { opts = (appStore[field.source]||[]).map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r[field.optionLabel]||r.nome||r.id)}</option>`).join(""); }
        return `<div class="field${spanClass}"><label for="admin-${field.name}">${field.label}</label><select ${attrs}>${empty}${opts}</select></div>`;
    }
    if (type === "textarea") return `<div class="field${spanClass}"><label for="admin-${field.name}">${field.label}</label><textarea ${attrs}></textarea></div>`;
    return `<div class="field${spanClass}"><label for="admin-${field.name}">${field.label}</label><input type="${type}" ${attrs}></div>`;
}

function renderAdminRecords(records) {
    const list = $("#adminRecordsList");
    if (currentAdminModule === "finances") { list.innerHTML = `<p class="empty-state">Relatório financeiro em desenvolvimento.</p>`; return; }
    if (!records.length) { list.innerHTML = `<p class="empty-state">Nenhum cadastro encontrado neste módulo.</p>`; return; }
    const mod = adminModules[currentAdminModule];
    list.innerHTML = records.map((r) => {
        const title = currentAdminModule === "appointments" ? `${displayValue("clients",r.clienteId)} — ${displayValue("services",r.servicoId)}` : (currentAdminModule === "services" ? `${r.nome} — ${formatCurrency(Number(r.valor||0))}` : r[mod.titleField] || mod.label);
        return `<article class="record-card"><div><h4>${escapeHtml(title)}</h4></div><div class="record-actions"><button class="mini-btn" type="button" disabled>Editar</button><button class="mini-btn danger" type="button" disabled>Excluir</button></div></article>`;
    }).join("");
}

async function setupAuth() {
    const input = $("#registerCpf");
    if (input) input.oninput = (e) => { e.target.value = formatCpf(e.target.value); };
    document.querySelectorAll("[data-auth-mode]").forEach((btn) => btn.addEventListener("click", () => setAuthMode(btn.dataset.authMode)));
    $("#loginForm")?.addEventListener("submit", handleLogin);
    $("#registerForm")?.addEventListener("submit", handleRegister);
    $("#forgotPasswordBtn")?.addEventListener("click", (e) => { e.preventDefault(); setResetMode("forgot-password"); });
    $("#backToLoginBtn")?.addEventListener("click", (e) => { e.preventDefault(); setResetMode("login"); });
    $("#forgotPasswordForm")?.addEventListener("submit", handleForgotPassword);
    $("#resetPasswordForm")?.addEventListener("submit", handleResetPassword);
    $("#googleLoginBtn")?.addEventListener("click", startGoogleOAuth);
    $("#googleRegisterBtn")?.addEventListener("click", startGoogleOAuth);
    $("#logoutBtn")?.addEventListener("click", handleLogout);
    supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") setAuthMode("reset-password"); if (event === "SIGNED_OUT") lockApp(); });
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
    const email = $("#loginEmail").value.trim().toLowerCase(); const password = $("#loginPassword").value; const btn = event.submitter; if (btn) btn.disabled = true;
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const dbUser = appStore.users.find((u) => u.authId === data.user.id);
        if (!dbUser) { await supabase.auth.signOut(); throw new Error("Conta sem vínculo no sistema."); }
        storage.set("salonTechSession", { userId: dbUser.id, role: dbUser.role });
        unlockApp(true); event.target.reset();
    } catch (e) { setAuthStatus(getAuthErrorMsg(e), "error"); } finally { if (btn) btn.disabled = false; }
}

async function handleRegister(event) {
    event.preventDefault();
    const name = $("#registerName").value.trim(); const email = $("#registerEmail").value.trim().toLowerCase(); const cpf = normalizeCpf($("#registerCpf").value); const password = $("#registerPassword").value; const role = $("#registerRole").value;
    if (cpf.length !== 11) { setAuthStatus("CPF inválido.", "error"); return; }
    const professional = appStore.team.find((t) => normalizeCpf(t.cpf) === cpf);
    if (!professional) { setAuthStatus("CPF não encontrado na equipe.", "error"); return; }
    const btn = event.submitter; if (btn) btn.disabled = true;
    try {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { nome:name, cpf, role, funcionario_id:Number(professional.id) }, emailRedirectTo:`${DEFAULT_ORIGIN}/` } });
        if (error) throw error;
        await supabase.from("usuario").insert({ nome:name, senha:`${AUTH_MARKER_PREFIX}${data.user.id}`, tipo:role===ROLE_ADMIN?"A":"F", funcionario_id:Number(professional.id) });
        await loadStoreFromSupabase();
        if (data.session) { const dbUser = appStore.users.find((u) => u.authId === data.user.id); if (dbUser) { storage.set("salonTechSession", { userId:dbUser.id, role:dbUser.role }); unlockApp(true); } }
        else { setAuthStatus("Confirme o e-mail para entrar.", "success"); }
        event.target.reset();
    } catch (e) { setAuthStatus(getAuthErrorMsg(e), "error"); } finally { if (btn) btn.disabled = false; }
}

async function handleForgotPassword(event) {
    event.preventDefault(); const email = $("#forgotPasswordEmail").value.trim().toLowerCase(); const btn = event.submitter; if (btn) btn.disabled = true;
    try { const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo:`${DEFAULT_ORIGIN}/?type=recovery` }); if (error) throw error; event.target.reset(); setAuthStatus("Link enviado.", "success"); }
    catch (e) { setAuthStatus(getAuthErrorMsg(e), "error"); } finally { if (btn) btn.disabled = false; }
}

async function handleResetPassword(event) {
    event.preventDefault(); const password = $("#resetNewPassword").value;
    if (password !== $("#resetConfirmPassword").value) { setAuthStatus("As senhas não correspondem.", "error"); return; }
    const btn = event.submitter; if (btn) btn.disabled = true;
    try { const { error } = await supabase.auth.updateUser({ password }); if (error) throw error; event.target.reset(); setAuthStatus("Senha atualizada!", "success"); setTimeout(() => setAuthMode("login"), 1500); }
    catch (e) { setAuthStatus(getAuthErrorMsg(e), "error"); } finally { if (btn) btn.disabled = false; }
}

async function startGoogleOAuth() { const { error } = await supabase.auth.signInWithOAuth({ provider:"google", options:{ redirectTo:`${DEFAULT_ORIGIN}/` } }); if (error) setAuthStatus(error.message, "error"); }
async function handleLogout() { await supabase.auth.signOut(); lockApp(); }

function lockApp() { localStorage.removeItem("salonTechSession"); document.body.classList.add("auth-locked"); }
function unlockApp(showMsg) {
    document.body.classList.remove("auth-locked");
    setupAdmin();
    if (showMsg) console.log("Sessão iniciada.");
}

function setAuthMode(mode) {
    document.querySelectorAll("[data-auth-mode]").forEach((b) => { b.classList.toggle("active", b.dataset.authMode===mode); b.setAttribute("aria-selected", String(b.dataset.authMode===mode)); });
    document.querySelectorAll("[data-auth-form]").forEach((f) => { f.hidden = f.dataset.authForm!==mode; });
    setAuthStatus("");
}
function setResetMode(mode) {
    document.querySelectorAll("[data-auth-mode]").forEach((b) => b.classList.toggle("active", b.dataset.authMode==="login"&&mode==="login"));
    document.querySelectorAll("[data-auth-form]").forEach((f) => { f.hidden = f.dataset.authForm!==mode; });
    setAuthStatus("");
}
function setAuthStatus(msg, type="") { const s=$("#authStatus"); if(!s) return; s.textContent=msg; s.className=`auth-status ${type}`.trim(); }
function getAuthErrorMsg(error) { const msg=String(error?.message||error||"erro"); return {"Invalid login credentials":"e-mail ou senha inválidos","User already registered":"e-mail já cadastrado"}[msg]||msg; }
