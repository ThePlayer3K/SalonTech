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
    clients: { label:"Clientes", kicker:"Cadastro de clientes", submitLabel:"Salvar cliente", storeKey:"clients", titleField:"nome", fields:[{name:"nome",label:"Nome",required:true},{name:"cpf",label:"CPF",required:true,inputmode:"numeric",maxlength:"14"},{name:"telefone",label:"Telefone",required:true,inputmode:"numeric",maxlength:"15"},{name:"email",label:"E-mail",type:"email"}]},
    appointments: { label:"Agendamentos", kicker:"Servicos prestados", submitLabel:"Salvar agendamento", storeKey:"appointments", titleField:"clienteId", fields:[{name:"clienteId",label:"Cliente",type:"select",source:"clients",optionLabel:"nome",required:true},{name:"servicoId",label:"Servico",type:"select",source:"services",optionLabel:"nome",required:true},{name:"data",label:"Data",type:"date",required:true},{name:"hora",label:"Hora",type:"time",required:true},{name:"formaPagamentoId",label:"Pagamento",type:"select",source:"paymentMethods",optionLabel:"nome"},{name:"situacao",label:"Situacao",type:"select",options:statusLabels,required:true},{name:"observacoes",label:"Observacoes",type:"textarea",span:2}]},
    services: { label:"Serviços", kicker:"Catalogo editavel", submitLabel:"Salvar serviço", storeKey:"services", titleField:"nome", fields:[{name:"nome",label:"Nome",required:true},{name:"categoria",label:"Categoria",type:"select",options:[{value:"Cabelo",label:"Cabelo"},{value:"Unhas",label:"Unhas"},{value:"Estetica",label:"Estética"},{value:"Sobrancelha",label:"Sobrancelha"}],required:true},{name:"valor",label:"Valor",type:"number",step:"0.01",min:"0",required:true},{name:"duracaoMin",label:"Duração (min)",type:"number",min:"1",required:true},{name:"profissionalId",label:"Profissional",type:"select",source:"team",optionLabel:"nome",required:true},{name:"comissaoPct",label:"Comissão (%)",type:"number",min:"0",max:"100",step:"1",required:true}]},
    team: { label:"Equipe", kicker:"Profissionais", submitLabel:"Salvar profissional", storeKey:"team", titleField:"nome", fields:[{name:"nome",label:"Nome",required:true},{name:"cpf",label:"CPF",inputmode:"numeric",maxlength:"14"},{name:"telefone",label:"Telefone",inputmode:"numeric",maxlength:"15"},{name:"cargo",label:"Especialidade",required:true},{name:"tipoPagamento",label:"Tipo pagamento"},{name:"salario",label:"Salario",type:"number",step:"0.01",min:"0"}]},
    products: { label:"Produtos", kicker:"Estoque", submitLabel:"Salvar produto", storeKey:"products", titleField:"nome", fields:[{name:"nome",label:"Produto",required:true},{name:"quantidade",label:"Quantidade",type:"number",min:"0",required:true},{name:"categoria",label:"Categoria"}]},
    expenses: { label:"Despesas", kicker:"Gastos", submitLabel:"Salvar despesa", storeKey:"expenses", titleField:"nome", fields:[{name:"nome",label:"Descrição",required:true},{name:"data",label:"Data",type:"date",required:true},{name:"valor",label:"Valor",type:"number",step:"0.01",min:"0",required:true}]},
    paymentMethods: { label:"Pagamentos", kicker:"Formas de pagamento", submitLabel:"Salvar forma", storeKey:"paymentMethods", titleField:"nome", fields:[{name:"nome",label:"Nome",required:true}]},
    finances: { label:"Finanças", kicker:"Entradas x despesas", submitLabel:"Atualizar relatório", storeKey:"finances", fields:[{name:"inicio",label:"Inicio",type:"date",required:true},{name:"fim",label:"Fim",type:"date",required:true}], readonly:true }
};
const tableByStoreKey = { clients:"cliente", appointments:"agendamento", services:"servico", team:"funcionario", products:"produto", expenses:"despesa", paymentMethods:"forma_pagamento" };

let currentAdminModule = "clients";
let editingRecordId = null;

// ─── UX: splash, theme, offline, toast, scroll progress, navigation ──────────

function setupSplash() {
    const splash = $("#splashScreen"); if (!splash) return;
    setTimeout(() => splash.classList.add("splash-hidden"), 800);
    splash.addEventListener("transitionend", () => splash.remove());
}

function setupTheme() {
    const saved = localStorage.getItem("salonTechTheme") || "light";
    applyTheme(saved);
    $("#themeToggle")?.addEventListener("click", () => { const next = document.body.dataset.theme === "dark" ? "light" : "dark"; localStorage.setItem("salonTechTheme", next); applyTheme(next); });
}

function applyTheme(theme) {
    document.body.dataset.theme = theme;
    const btn = $("#themeToggle"); if (btn) btn.setAttribute("aria-label", theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro");
}

function setupOfflineHandler() {
    const screen = $("#offlineScreen");
    const update = () => { if (screen) screen.hidden = navigator.onLine; };
    window.addEventListener("online", update); window.addEventListener("offline", update); update();
}

function updateScrollProgress() {
    const bar = $("#scrollProgress");
    if (!bar) return;
    window.addEventListener("scroll", () => { const h = document.documentElement; bar.style.width = `${(h.scrollTop/(h.scrollHeight-h.clientHeight))*100}%`; }, { passive:true });
}

function setupNavigation(openModuleFn) {
    const menuBtn = $("#mobileMenuBtn"); const navLinks = $("#navLinks");
    menuBtn?.addEventListener("click", () => { const open = navLinks?.classList.toggle("open"); menuBtn.setAttribute("aria-expanded", String(!!open)); });
    document.querySelectorAll("[data-open-module]").forEach((a) => a.addEventListener("click", () => { openModuleFn(a.dataset.openModule); navLinks?.classList.remove("open"); menuBtn?.setAttribute("aria-expanded","false"); }));
}

document.addEventListener("DOMContentLoaded", async () => {
    setupSplash(); setupTheme(); setupOfflineHandler(); updateScrollProgress(); setupNavigation(openAdminModule);
    try {
        await loadStoreFromSupabase();
        if (appStore.expenses.some((e) => /^Comissao agendamento #\d+$/.test(e.nome))) {
            await syncAllCommissionsDb(); await loadStoreFromSupabase();
        }
        await setupAuth();
    } catch (e) { setAuthStatus(`Erro ao conectar: ${e.message}`, "error"); }
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
    const failed = results.find((r) => r.error); if (failed) throw failed.error;
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
        expenses: expenses.map((r) => ({ id:String(r.id), nome:r.nome||"", data:r.data||"", valor:Number(r.valor||0), origem:isCommissionExpenseName(r.nome)?"comissao":"manual" }))
    };
}

function mapServiceRow(r) { return { id:String(r.id), nome:r.nome||"", duracaoMin:Number(r.duracao||0), categoria:r.categoria||"", valor:Number(r.valor||0), profissionalId:r.funcionario_id==null?"":String(r.funcionario_id), comissaoPct:Number(r.percentual_comissao||0) }; }
function mapAppointmentRow(r, services) { const s=services.find((x)=>x.id===String(r.servico_id)); const dt=String(r.data_hora||"").replace(" ","T"); return { id:String(r.id), clienteId:r.cliente_id==null?"":String(r.cliente_id), servicoId:r.servico_id==null?"":String(r.servico_id), profissionalId:s?.profissionalId||"", valor:Number(r.valor_total??0), data:dt.slice(0,10), hora:dt.slice(11,16), formaPagamentoId:r.forma_pag_id==null?"":String(r.forma_pag_id), situacao:r.situacao||"Agendado", observacoes:r.observacoes||"" }; }
function isCommissionExpenseName(name) { const v=String(name||""); return /^Comissão de .+/.test(v) || /^Comissao agendamento #\d+$/.test(v); }
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
function showToast(msg, type = "") {
    const region = $("#toastRegion"); if (!region) return;
    const toast = document.createElement("div"); toast.className = `toast${type?` toast-${type}`:""}`;
    toast.setAttribute("role", "status"); toast.textContent = msg;
    region.appendChild(toast); setTimeout(() => toast.remove(), 3500);
}

// ─── Finances ─────────────────────────────────────────────────────────────────

async function syncAllCommissionsDb() {
    const paid = appStore.appointments.filter((a) => a.situacao === "Pago");
    const commissionRows = paid.map((a) => {
        const service = appStore.services.find((s) => s.id === a.servicoId);
        const professional = appStore.team.find((t) => t.id === service?.profissionalId);
        const commission = Number((Number(a.valor||0) * (Number(service?.comissaoPct||0)/100)).toFixed(2));
        if (!commission) return null;
        return { nome:`Comissão de ${professional?.nome||"profissional"}`.slice(0,50), data:a.data, valor:commission };
    }).filter(Boolean);

    const pending = [...commissionRows];
    const toDelete = appStore.expenses.filter((e) => e.origem === "comissao").filter((e) => {
        const idx = pending.findIndex((r) => r.nome===e.nome && r.data===e.data && Number(r.valor).toFixed(2)===Number(e.valor).toFixed(2));
        if (idx===-1) return true; pending.splice(idx,1); return false;
    }).map((e) => Number(e.id));

    if (toDelete.length) { const { error } = await supabase.from("despesa").delete().in("id", toDelete); if (error) throw error; }
    if (pending.length) { const { error } = await supabase.from("despesa").insert(pending); if (error) throw error; }
}

function renderFinanceReport() {
    const list = $("#adminRecordsList"); if (!list) return;
    const inicio = $("#admin-inicio")?.value || monthStartISO();
    const fim = $("#admin-fim")?.value || todayISO();
    const isInRange = (date) => (!date) ? false : (!inicio||date>=inicio) && (!fim||date<=fim);
    const paid = appStore.appointments.filter((a) => a.situacao==="Pago" && isInRange(a.data));
    const expenses = appStore.expenses.filter((e) => isInRange(e.data));
    const groupBy = (items, labelFn, valueFn) => { const map=new Map(); items.forEach((i) => { const l=labelFn(i)||"Nao informado"; map.set(l,(map.get(l)||0)+valueFn(i)); }); return Array.from(map.entries()).map(([label,total])=>({label,total})).sort((a,b)=>b.total-a.total); };
    const entries = groupBy(paid, (a) => displayValue("services",a.servicoId), (a) => Number(a.valor||0));
    const exits = groupBy(expenses, (e) => e.nome, (e) => Number(e.valor||0));
    const totalIn = entries.reduce((s,i)=>s+i.total,0);
    const totalOut = exits.reduce((s,i)=>s+i.total,0);
    const net = totalIn - totalOut;
    if ($("#adminRecordCount")) $("#adminRecordCount").textContent = `${paid.length} atendimento${paid.length===1?"":"s"} pago${paid.length===1?"":"s"}`;
    const section = (title, items, empty) => `<section class="finance-section"><h4>${title}</h4>${items.length?items.map((i)=>`<div class="finance-row"><span>${escapeHtml(i.label)}</span><strong>${formatCurrency(i.total)}</strong></div>`).join(""):`<p class="empty-state">${empty}</p>`}</section>`;
    list.innerHTML = `<div class="finance-summary"><article><span>Entradas</span><strong>${formatCurrency(totalIn)}</strong></article><article><span>Despesas</span><strong>${formatCurrency(totalOut)}</strong></article><article class="${net<0?"negative":"positive"}"><span>Líquido</span><strong>${formatCurrency(net)}</strong></article></div><div class="finance-grid">${section("Entradas por serviço",entries,"Nenhuma entrada no período.")}${section("Despesas cadastradas",exits,"Nenhuma despesa no período.")}</div>`;
}

// ─── Services catalog ────────────────────────────────────────────────────────

function setupServices() {
    renderServiceOptions(); renderServices(appStore.services);
    $("#filtersForm")?.addEventListener("submit", (e) => { e.preventDefault(); applyServiceFilters(); });
    $("#searchInput")?.addEventListener("input", applyServiceFilters);
    $("#categoryFilter")?.addEventListener("change", applyServiceFilters);
    $("#priceFilter")?.addEventListener("change", applyServiceFilters);
    $("#clearFiltersBtn")?.addEventListener("click", () => { $("#filtersForm")?.reset(); renderServices(appStore.services); });
}

function renderServices(items) {
    const grid = $("#servicesGrid"); const count = $("#resultsCount"); if (!grid) return;
    if (count) count.textContent = `${items.length} ${items.length===1?"servico":"servicos"}`;
    if (!items.length) { grid.innerHTML = `<p class="empty-state">Nenhum serviço encontrado.</p>`; return; }
    grid.innerHTML = items.map((s) => { const pro=appStore.team.find((t)=>t.id===s.profissionalId); return `<article class="service-card"><div class="service-meta"><span class="badge">${escapeHtml(formatCategory(s.categoria))}</span><span class="price">${formatCurrency(Number(s.valor))}</span></div><h3>${escapeHtml(s.nome)}</h3><small>${Number(s.duracaoMin)} min com ${escapeHtml(pro?.nome||"Equipe")}</small><button class="btn btn-primary" type="button" data-service-interest="${s.id}">Usar na agenda</button></article>`; }).join("");
    grid.querySelectorAll("[data-service-interest]").forEach((btn) => btn.addEventListener("click", () => {
        const selected = appStore.services.find((s) => s.id === btn.dataset.serviceInterest); if (!selected) return;
        openAdminModule("appointments");
        if ($("#admin-servicoId")) { $("#admin-servicoId").value = selected.id; fillFromService(selected.id); }
        document.querySelector("#painel")?.scrollIntoView({ behavior:"smooth" });
    }));
}

function applyServiceFilters() {
    const search=($("#searchInput")?.value||"").trim().toLowerCase(); const category=($("#categoryFilter")?.value)||"todos"; const price=($("#priceFilter")?.value)||"todos";
    const filtered = appStore.services.filter((s) => { const pro=appStore.team.find((t)=>t.id===s.profissionalId); const matchSearch=[s.nome,s.categoria,pro?.nome].join(" ").toLowerCase().includes(search); const matchCategory=category==="todos"||s.categoria===category; const matchPrice=price==="todos"||(price==="ate40"&&Number(s.valor)<=40)||(price==="41a80"&&Number(s.valor)>=41&&Number(s.valor)<=80)||(price==="acima80"&&Number(s.valor)>80); return matchSearch&&matchCategory&&matchPrice; });
    renderServices(filtered);
}

function renderServiceOptions() {
    const opts = `<option value="">Selecione</option>${appStore.services.map((s)=>`<option value="${escapeHtml(s.nome)}">${escapeHtml(s.nome)}</option>`).join("")}`;
    const cs=$("#contactService"); const rs=$("#reviewService"); if (cs) cs.innerHTML=opts; if (rs) rs.innerHTML=opts;
}

// ─── Admin panel ─────────────────────────────────────────────────────────────

function setupAdmin() {
    renderAdminTabs(); renderAdminModule();
    $("#adminEntityForm")?.addEventListener("submit", handleAdminSubmit);
    $("#adminCancelEditBtn")?.addEventListener("click", cancelAdminEdit);
    document.querySelectorAll("[data-open-module]").forEach((a) => a.addEventListener("click", () => openAdminModule(a.dataset.openModule)));
}

function openAdminModule(key) { currentAdminModule=key; editingRecordId=null; renderAdminTabs(); renderAdminModule(); }
function cancelAdminEdit() { editingRecordId=null; $("#adminEntityForm")?.reset(); renderAdminModule(); }

function renderAdminTabs() {
    const tabs=$("#adminTabs"); if (!tabs) return;
    tabs.innerHTML=moduleOrder.map((key)=>{ const mod=adminModules[key]; return `<button type="button" class="${key===currentAdminModule?"active":""}" data-admin-module="${key}" role="tab" aria-selected="${key===currentAdminModule}">${mod.label}</button>`; }).join("");
    tabs.querySelectorAll("[data-admin-module]").forEach((btn)=>btn.addEventListener("click",()=>openAdminModule(btn.dataset.adminModule)));
}

function renderAdminModule() {
    const mod=adminModules[currentAdminModule]; const records=currentAdminModule==="finances"?[]:(appStore[mod.storeKey]||[]);
    if ($("#adminEntityKicker")) $("#adminEntityKicker").textContent=mod.kicker;
    if ($("#adminEntityTitle")) $("#adminEntityTitle").textContent=mod.label;
    if ($("#adminSubmitBtn")) $("#adminSubmitBtn").textContent=editingRecordId?"Salvar alterações":mod.submitLabel;
    if ($("#adminRecordCount")) $("#adminRecordCount").textContent=mod.readonly?"Relatório":`${records.length} registros`;
    if ($("#adminCancelEditBtn")) $("#adminCancelEditBtn").hidden=!editingRecordId;
    const fieldsGrid=$("#adminFieldsGrid"); if (!fieldsGrid) return;
    fieldsGrid.innerHTML=mod.fields.map(renderField).join("");
    if (currentAdminModule==="appointments") { if($("#admin-data")) $("#admin-data").value=todayISO(); if($("#admin-hora")) $("#admin-hora").value="14:00"; if($("#admin-situacao")) $("#admin-situacao").value="Agendado"; }
    if (currentAdminModule==="expenses"&&!editingRecordId) { if($("#admin-data")) $("#admin-data").value=todayISO(); }
    if (currentAdminModule==="services"&&!editingRecordId) { if($("#admin-comissaoPct")) $("#admin-comissaoPct").value="20"; }
    if (currentAdminModule==="finances") { if($("#admin-inicio")) $("#admin-inicio").value=monthStartISO(); if($("#admin-fim")) $("#admin-fim").value=todayISO(); }
    $("#admin-servicoId")?.addEventListener("change",(e)=>fillFromService(e.target.value));
    $("#admin-cpf")?.addEventListener("input",(e)=>{ e.target.value=formatCpf(e.target.value); });
    $("#admin-telefone")?.addEventListener("input",(e)=>{ e.target.value=formatPhone(e.target.value); });
    renderAdminRecords(records);
}

function renderField(field) {
    const type=field.type||"text"; const spanClass=field.span?` span-${field.span}`:"";
    const attrs=[`id="admin-${field.name}"`,`name="${field.name}"`,field.required?"required":"",field.placeholder?`placeholder="${escapeHtml(field.placeholder)}"`:"",,field.step?`step="${field.step}"`:"",field.min?`min="${field.min}"`:"",field.max?`max="${field.max}"`:"",field.inputmode?`inputmode="${field.inputmode}"`:"",field.maxlength?`maxlength="${field.maxlength}"`:""].filter(Boolean).join(" ");
    if (type==="select") { const empty=field.required?`<option value="">Selecione</option>`:`<option value="">Nao informado</option>`; let opts=field.options?field.options.map((o)=>{ const l=typeof o==="object"?o.label:o; const v=typeof o==="object"?o.value:o; return `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`; }).join(""):(appStore[field.source]||[]).map((r)=>`<option value="${escapeHtml(r.id)}">${escapeHtml(r[field.optionLabel]||r.nome||r.id)}</option>`).join(""); return `<div class="field${spanClass}"><label for="admin-${field.name}">${field.label}</label><select ${attrs}>${empty}${opts}</select></div>`; }
    if (type==="textarea") return `<div class="field${spanClass}"><label for="admin-${field.name}">${field.label}</label><textarea ${attrs}></textarea></div>`;
    return `<div class="field${spanClass}"><label for="admin-${field.name}">${field.label}</label><input type="${type}" ${attrs}></div>`;
}

function fillFromService(serviceId) { const s=appStore.services.find((x)=>x.id===serviceId); if (!s) return; if ($("#admin-valor")) $("#admin-valor").value=Number(s.valor||0).toFixed(2); if ($("#admin-profissionalId")) $("#admin-profissionalId").value=s.profissionalId||""; }

function renderAdminRecords(records) {
    const list=$("#adminRecordsList"); if (!list) return;
    if (currentAdminModule==="finances") { renderFinanceReport(); return; }
    if (!records.length) { list.innerHTML=`<p class="empty-state">Nenhum cadastro encontrado neste módulo.</p>`; return; }
    const mod=adminModules[currentAdminModule];
    list.innerHTML=records.map((r)=>{ const title=currentAdminModule==="appointments"?`${displayValue("clients",r.clienteId)} — ${displayValue("services",r.servicoId)}`:currentAdminModule==="services"?`${r.nome} — ${formatCurrency(Number(r.valor||0))}`:r.origem==="comissao"?`${r.nome} (automático)`:r[mod.titleField]||mod.label; const details=currentAdminModule==="appointments"?`<span>Data: ${formatDate(r.data)} ${r.hora||""}</span><span>Valor: ${formatCurrency(Number(r.valor||0))}</span><span>Situação: ${r.situacao}</span>`:currentAdminModule==="expenses"?`<span>Data: ${formatDate(r.data)}</span><span>Valor: ${formatCurrency(Number(r.valor||0))}</span><span>${r.origem==="comissao"?"Origem: automática":"Origem: manual"}</span>`:""; const locked=r.origem==="comissao"; return `<article class="record-card${locked?" record-card-locked":""}"><div><h4>${escapeHtml(title)}</h4><div class="record-details">${details}</div></div><div class="record-actions"><button class="mini-btn" type="button" data-edit-record="${r.id}" ${locked?"disabled":""}>Editar</button><button class="mini-btn danger" type="button" data-delete-record="${r.id}" ${locked?"disabled":""}>Excluir</button></div></article>`; }).join("");
    list.querySelectorAll("[data-edit-record]").forEach((btn)=>btn.addEventListener("click",()=>editAdminRecord(btn.dataset.editRecord)));
    list.querySelectorAll("[data-delete-record]").forEach((btn)=>btn.addEventListener("click",()=>deleteAdminRecord(btn.dataset.deleteRecord)));
}

async function handleAdminSubmit(event) {
    event.preventDefault(); if (currentAdminModule==="finances") { renderFinanceReport(); return; }
    const mod=adminModules[currentAdminModule]; const formData=new FormData(event.target); const raw=Object.fromEntries(formData.entries());
    mod.fields.forEach((f)=>{ if (f.type==="number") raw[f.name]=Number(raw[f.name]||0); });
    const payload=toDatabasePayload(mod.storeKey,raw); if (!payload) return;
    const btn=event.submitter; if (btn) btn.disabled=true;
    try {
        let q=editingRecordId?supabase.from(tableByStoreKey[mod.storeKey]).update(payload).eq("id",Number(editingRecordId)):supabase.from(tableByStoreKey[mod.storeKey]).insert(payload);
        const { error }=await q; if (error) throw error;
        if (["appointments","services","team"].includes(mod.storeKey)) { await syncAllCommissionsDb(); }
        await loadStoreFromSupabase(); renderServices(appStore.services); renderServiceOptions();
        showToast(editingRecordId?"Cadastro atualizado.":"Cadastro salvo."); event.target.reset(); editingRecordId=null; renderAdminModule();
    } catch (e) { showToast(`Erro ao salvar: ${e.message}`); } finally { if (btn) btn.disabled=false; }
}

function toDatabasePayload(storeKey, data) {
    const n=(v)=>String(v||"").trim()||null; const nid=(v)=>v?Number(v):null;
    const map={ clients:{nome:data.nome,cpf:n(data.cpf),telefone:n(formatPhone(data.telefone)),email:n(data.email)}, appointments:{cliente_id:Number(data.clienteId),forma_pag_id:nid(data.formaPagamentoId),situacao:data.situacao,data_hora:`${data.data}T${data.hora||"00:00"}:00`,observacoes:n(data.observacoes),servico_id:Number(data.servicoId),valor_total:Number(data.valor||0)}, services:{nome:data.nome,duracao:Number(data.duracaoMin),categoria:data.categoria,valor:Number(data.valor),funcionario_id:Number(data.profissionalId),percentual_comissao:Number(data.comissaoPct)}, team:{nome:data.nome,cpf:n(data.cpf),telefone:n(formatPhone(data.telefone)),cargo:n(data.cargo),tipo_pagamento:n(data.tipoPagamento),salario:Number(data.salario||0)}, products:{nome:data.nome,qtd_estoque:Number(data.quantidade||0),categoria:n(data.categoria)}, expenses:{nome:data.nome,data:data.data,valor:Number(data.valor||0)}, paymentMethods:{nome:data.nome} };
    return map[storeKey]||null;
}

function editAdminRecord(id) { const mod=adminModules[currentAdminModule]; const record=(appStore[mod.storeKey]||[]).find((r)=>r.id===id); if (!record||record.origem==="comissao") return; editingRecordId=id; renderAdminModule(); mod.fields.forEach((field)=>{ const input=$(`#admin-${field.name}`); if (input) input.value=record[field.name]??""; }); if ($("#adminSubmitBtn")) $("#adminSubmitBtn").textContent="Salvar alterações"; if ($("#adminCancelEditBtn")) $("#adminCancelEditBtn").hidden=false; $("#adminEntityForm")?.scrollIntoView({ behavior:"smooth",block:"center" }); }

async function deleteAdminRecord(id) {
    const mod=adminModules[currentAdminModule]; const table=tableByStoreKey[mod.storeKey]; if (!table) return;
    const record=(appStore[mod.storeKey]||[]).find((r)=>r.id===id); if (record?.origem==="comissao") { showToast("Comissões automáticas são removidas ao alterar o agendamento."); return; }
    if (!confirm("Excluir este cadastro?")) return;
    try { const { error }=await supabase.from(table).delete().eq("id",Number(id)); if (error) throw error; if (["appointments","services","team"].includes(mod.storeKey)) { await syncAllCommissionsDb(); } await loadStoreFromSupabase(); renderServices(appStore.services); editingRecordId=null; renderAdminModule(); showToast("Cadastro excluído."); }
    catch (e) { showToast(`Erro ao excluir: ${e.message}`); }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function setupAuth() {
    const input=$("#registerCpf"); if (input) input.oninput=(e)=>{ e.target.value=formatCpf(e.target.value); };
    document.querySelectorAll("[data-auth-mode]").forEach((btn)=>btn.addEventListener("click",()=>setAuthMode(btn.dataset.authMode)));
    $("#loginForm")?.addEventListener("submit",handleLogin); $("#registerForm")?.addEventListener("submit",handleRegister);
    $("#forgotPasswordBtn")?.addEventListener("click",(e)=>{ e.preventDefault(); setResetMode("forgot-password"); }); $("#backToLoginBtn")?.addEventListener("click",(e)=>{ e.preventDefault(); setResetMode("login"); });
    $("#forgotPasswordForm")?.addEventListener("submit",handleForgotPassword); $("#resetPasswordForm")?.addEventListener("submit",handleResetPassword);
    $("#googleLoginBtn")?.addEventListener("click",startGoogleOAuth); $("#googleRegisterBtn")?.addEventListener("click",startGoogleOAuth); $("#logoutBtn")?.addEventListener("click",handleLogout);
    supabase.auth.onAuthStateChange((event)=>{ if (event==="PASSWORD_RECOVERY") setAuthMode("reset-password"); if (event==="SIGNED_OUT") lockApp(); });
    const { data:{ session },error }=await supabase.auth.getSession(); if (error) throw error;
    if (window.location.hash.includes("type=recovery")) { setAuthMode("reset-password"); return; }
    if (!session?.user) { lockApp(); return; }
    const dbUser=appStore.users.find((u)=>u.authId===session.user.id); if (!dbUser) { lockApp(); return; }
    storage.set("salonTechSession",{ userId:dbUser.id,role:dbUser.role }); unlockApp(false);
}

async function handleLogin(event) { event.preventDefault(); const email=$("#loginEmail").value.trim().toLowerCase(); const password=$("#loginPassword").value; const btn=event.submitter; if (btn) btn.disabled=true; try { const { data,error }=await supabase.auth.signInWithPassword({ email,password }); if (error) throw error; const dbUser=appStore.users.find((u)=>u.authId===data.user.id); if (!dbUser) { await supabase.auth.signOut(); throw new Error("Conta sem vínculo."); } storage.set("salonTechSession",{ userId:dbUser.id,role:dbUser.role }); unlockApp(true); event.target.reset(); } catch (e) { setAuthStatus(getAuthErrorMsg(e),"error"); } finally { if (btn) btn.disabled=false; } }
async function handleRegister(event) { event.preventDefault(); const name=$("#registerName").value.trim(); const email=$("#registerEmail").value.trim().toLowerCase(); const cpf=normalizeCpf($("#registerCpf").value); const password=$("#registerPassword").value; const role=$("#registerRole").value; if (cpf.length!==11) { setAuthStatus("CPF inválido.","error"); return; } const professional=appStore.team.find((t)=>normalizeCpf(t.cpf)===cpf); if (!professional) { setAuthStatus("CPF não encontrado na equipe.","error"); return; } const btn=event.submitter; if (btn) btn.disabled=true; try { const { data,error }=await supabase.auth.signUp({ email,password,options:{ data:{ nome:name,cpf,role,funcionario_id:Number(professional.id) },emailRedirectTo:`${DEFAULT_ORIGIN}/` } }); if (error) throw error; await supabase.from("usuario").insert({ nome:name,senha:`${AUTH_MARKER_PREFIX}${data.user.id}`,tipo:role===ROLE_ADMIN?"A":"F",funcionario_id:Number(professional.id) }); await loadStoreFromSupabase(); if (data.session) { const dbUser=appStore.users.find((u)=>u.authId===data.user.id); if (dbUser) { storage.set("salonTechSession",{ userId:dbUser.id,role:dbUser.role }); unlockApp(true); } } else { setAuthStatus("Confirme o e-mail para entrar.","success"); } event.target.reset(); } catch (e) { setAuthStatus(getAuthErrorMsg(e),"error"); } finally { if (btn) btn.disabled=false; } }
async function handleForgotPassword(event) { event.preventDefault(); const email=$("#forgotPasswordEmail").value.trim().toLowerCase(); const btn=event.submitter; if (btn) btn.disabled=true; try { const { error }=await supabase.auth.resetPasswordForEmail(email,{ redirectTo:`${DEFAULT_ORIGIN}/?type=recovery` }); if (error) throw error; event.target.reset(); setAuthStatus("Link enviado.","success"); } catch (e) { setAuthStatus(getAuthErrorMsg(e),"error"); } finally { if (btn) btn.disabled=false; } }
async function handleResetPassword(event) { event.preventDefault(); const password=$("#resetNewPassword").value; if (password!==$($("#resetConfirmPassword")).value) { setAuthStatus("As senhas não correspondem.","error"); return; } const btn=event.submitter; if (btn) btn.disabled=true; try { const { error }=await supabase.auth.updateUser({ password }); if (error) throw error; event.target.reset(); setAuthStatus("Senha atualizada!","success"); setTimeout(()=>setAuthMode("login"),1500); } catch (e) { setAuthStatus(getAuthErrorMsg(e),"error"); } finally { if (btn) btn.disabled=false; } }
async function startGoogleOAuth() { const { error }=await supabase.auth.signInWithOAuth({ provider:"google",options:{ redirectTo:`${DEFAULT_ORIGIN}/` } }); if (error) setAuthStatus(error.message,"error"); }
async function handleLogout() { await supabase.auth.signOut(); lockApp(); }
function lockApp() { localStorage.removeItem("salonTechSession"); document.body.classList.add("auth-locked"); }
function unlockApp(showMsg) { document.body.classList.remove("auth-locked"); setupAdmin(); setupServices(); if (showMsg) showToast("Bem-vindo ao SalonTech!", "success"); }
function setAuthMode(mode) { document.querySelectorAll("[data-auth-mode]").forEach((b)=>{ b.classList.toggle("active",b.dataset.authMode===mode); b.setAttribute("aria-selected",String(b.dataset.authMode===mode)); }); document.querySelectorAll("[data-auth-form]").forEach((f)=>{ f.hidden=f.dataset.authForm!==mode; }); setAuthStatus(""); }
function setResetMode(mode) { document.querySelectorAll("[data-auth-mode]").forEach((b)=>b.classList.toggle("active",b.dataset.authMode==="login"&&mode==="login")); document.querySelectorAll("[data-auth-form]").forEach((f)=>{ f.hidden=f.dataset.authForm!==mode; }); setAuthStatus(""); }
function setAuthStatus(msg,type="") { const s=$("#authStatus"); if(!s) return; s.textContent=msg; s.className=`auth-status ${type}`.trim(); }
function getAuthErrorMsg(error) { const msg=String(error?.message||error||"erro"); return {"Invalid login credentials":"e-mail ou senha inválidos","User already registered":"e-mail já cadastrado"}[msg]||msg; }
