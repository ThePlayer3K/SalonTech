import { supabase } from "./supabase.js";
import { adminModules } from "./config.js";
import {
    $,
    todayISO,
    monthStartISO,
    formatCurrency,
    formatDate,
    formatCpf,
    formatPhone,
    formatCategory,
    escapeHtml,
    getErrorMessage,
    showToast
} from "./utils.js";
import {
    getStore,
    getRecords,
    getVisibleRecords,
    findRecord,
    displayValue,
    loadStoreFromSupabase,
    isProfessionalUser,
    getCurrentProfessionalId,
    canAccessModule,
    canAccessRecord,
    getVisibleModuleOrder
} from "./store.js";
import { syncActiveModuleNavigation } from "./ui.js";
import { renderFinanceReport, syncAllCommissionsDb, calculatePaymentTotals } from "./finances.js";

let currentAdminModule = "clients";
let editingRecordId = null;

let _onStoreChangedCallback = () => {};

export function setOnStoreChangedCallback(fn) {
    _onStoreChangedCallback = fn;
}

export function getCurrentAdminModule() {
    return currentAdminModule;
}

export function ensureCurrentModuleAccess() {
    if (!canAccessModule(currentAdminModule)) {
        currentAdminModule = getVisibleModuleOrder()[0];
        editingRecordId = null;
    }
}

export function openAdminModule(key) {
    currentAdminModule = key;
    editingRecordId = null;
    renderAdminTabs();
    renderAdminModule();
    syncActiveModuleNavigation(currentAdminModule);
}

export function setupAdmin() {
    renderAdminTabs();
    renderAdminModule();

    $("#adminEntityForm")?.addEventListener("submit", handleAdminSubmit);
    $("#adminCancelEditBtn")?.addEventListener("click", cancelAdminEdit);
}

export function renderAdminTabs() {
    const tabs = $("#adminTabs");
    if (!tabs) return;

    ensureCurrentModuleAccess();

    tabs.innerHTML = getVisibleModuleOrder().map((key) => {
        const module = adminModules[key];
        return `
            <button type="button" class="${key === currentAdminModule ? "active" : ""}" data-admin-module="${key}" role="tab" aria-selected="${key === currentAdminModule}">
                ${module.label}
            </button>
        `;
    }).join("");

    tabs.querySelectorAll("[data-admin-module]").forEach((button) => {
        button.addEventListener("click", () => {
            openAdminModule(button.dataset.adminModule);
        });
    });

    syncActiveModuleNavigation(currentAdminModule);
}

export function renderAdminModule() {
    ensureCurrentModuleAccess();
    const module = adminModules[currentAdminModule];
    const records = getAdminRecords();

    $("#adminEntityKicker").textContent = module.kicker;
    $("#adminEntityTitle").textContent = module.label;
    $("#adminSubmitBtn").textContent = module.submitLabel;
    $("#adminRecordCount").textContent = getRecordCountLabel(records, module);
    $("#adminCancelEditBtn").hidden = true;

    const isReadOnlyProductView = isProfessionalUser() && currentAdminModule === "products";
    $("#adminEntityForm").hidden = isReadOnlyProductView;

    const fieldsGrid = $("#adminFieldsGrid");
    fieldsGrid.innerHTML = getCurrentModuleFields(module).map((field) => renderField(field)).join("");

    setDefaultFieldValues(module);
    bindDynamicFields();

    if (module.readonly) {
        $("#adminCancelEditBtn").hidden = true;
    }

    renderAdminRecords();
}

function getCurrentModuleFields(module) {
    if (!isProfessionalUser()) return module.fields;
    if (currentAdminModule === "services" || currentAdminModule === "appointments") {
        return module.fields.filter((field) => field.name !== "profissionalId");
    }
    return module.fields;
}

function renderField(field) {
    const type = field.type || "text";
    const spanClass = field.span ? ` span-${field.span}` : "";
    const attrs = [
        `id="admin-${field.name}"`,
        `name="${field.name}"`,
        field.required ? "required" : "",
        field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : "",
        field.step ? `step="${field.step}"` : "",
        field.min ? `min="${field.min}"` : "",
        field.max ? `max="${field.max}"` : "",
        field.inputmode ? `inputmode="${field.inputmode}"` : "",
        field.maxlength ? `maxlength="${field.maxlength}"` : "",
        field.readonly ? "readonly" : ""
    ].filter(Boolean).join(" ");

    if (type === "select") {
        return `
            <div class="field${spanClass}">
                <label for="admin-${field.name}">${field.label}</label>
                <select ${attrs}>
                    ${getSelectOptions(field)}
                </select>
            </div>
        `;
    }

    if (type === "textarea") {
        return `
            <div class="field${spanClass}">
                <label for="admin-${field.name}">${field.label}</label>
                <textarea ${attrs}></textarea>
            </div>
        `;
    }

    return `
        <div class="field${spanClass}">
            <label for="admin-${field.name}">${field.label}</label>
            <input type="${type}" ${attrs}>
        </div>
    `;
}

function getSelectOptions(field) {
    const empty = field.required ? `<option value="">Selecione</option>` : `<option value="">Nao informado</option>`;
    if (field.options) {
        return `${empty}${field.options.map((option) => {
            const label = optionLabel(option);
            const value = optionValue(option);
            return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
        }).join("")}`;
    }

    const records = getSelectableRecords(field.source);
    return `${empty}${records.map((record) => {
        return `<option value="${escapeHtml(record.id)}">${escapeHtml(record[field.optionLabel] || record.nome || record.id)}</option>`;
    }).join("")}`;
}

function getSelectableRecords(storeKey) {
    if (!isProfessionalUser()) return getRecords(storeKey);
    if (storeKey === "services" || storeKey === "team") return getVisibleRecords(storeKey);
    return getRecords(storeKey);
}

function optionLabel(option) {
    return typeof option === "object" ? option.label : option;
}

function optionValue(option) {
    return typeof option === "object" ? option.value : option;
}

function setDefaultFieldValues(module) {
    if (currentAdminModule === "finances") {
        $("#admin-inicio").value = monthStartISO();
        $("#admin-fim").value = todayISO();
        return;
    }

    if (currentAdminModule === "appointments") {
        $("#admin-data").value = todayISO();
        $("#admin-hora").value = "14:00";
        $("#admin-situacao").value = "Agendado";
    }

    if (currentAdminModule === "expenses") {
        $("#admin-data").value = todayISO();
    }

    if (currentAdminModule === "services") {
        $("#admin-comissaoPct").value = "20";
    }
}

function bindDynamicFields() {
    $("#admin-servicoId")?.addEventListener("change", (event) => fillAppointmentFromService(event.target.value));
    $("#admin-cpf")?.addEventListener("input", (event) => {
        event.target.value = formatCpf(event.target.value);
    });
    $("#admin-telefone")?.addEventListener("input", (event) => {
        event.target.value = formatPhone(event.target.value);
    });
}

export function fillAppointmentFromService(serviceId) {
    const service = findRecord("services", serviceId);
    if (!service) return;
    if ($("#admin-valor")) $("#admin-valor").value = Number(service.valor || 0).toFixed(2);
    if ($("#admin-profissionalId")) $("#admin-profissionalId").value = service.profissionalId || "";
}

function renderAdminRecords() {
    if (currentAdminModule === "finances") {
        renderFinanceReport();
        return;
    }

    const list = $("#adminRecordsList");
    const module = adminModules[currentAdminModule];
    const records = getAdminRecords();

    $("#adminRecordCount").textContent = getRecordCountLabel(records, module);

    if (!records.length) {
        list.innerHTML = `<p class="empty-state">Nenhum cadastro encontrado neste modulo.</p>`;
        return;
    }

    list.innerHTML = records.map((record) => renderRecordCard(record, module)).join("");

    list.querySelectorAll("[data-edit-record]").forEach((button) => {
        button.addEventListener("click", () => editAdminRecord(button.dataset.editRecord));
    });

    list.querySelectorAll("[data-delete-record]").forEach((button) => {
        button.addEventListener("click", () => deleteAdminRecord(button.dataset.deleteRecord));
    });
}

function renderRecordCard(record, module) {
    const title = getRecordTitle(record, module);
    const details = getRecordDetails(record);
    const locked = record.origem === "comissao" || (isProfessionalUser() && currentAdminModule === "products");

    return `
        <article class="record-card ${locked ? "record-card-locked" : ""}">
            <div>
                <h4>${escapeHtml(title)}</h4>
                <div class="record-details">${details}</div>
            </div>
            <div class="record-actions">
                <button class="mini-btn" type="button" data-edit-record="${record.id}" ${locked ? "disabled" : ""}>Editar</button>
                <button class="mini-btn danger" type="button" data-delete-record="${record.id}" ${locked ? "disabled" : ""}>Excluir</button>
            </div>
        </article>
    `;
}

function getRecordTitle(record, module) {
    if (currentAdminModule === "appointments") {
        return `${displayValue("clients", record.clienteId)} - ${displayValue("services", record.servicoId)}`;
    }
    if (currentAdminModule === "services") {
        return `${record.nome} - ${formatCurrency(Number(record.valor || 0))}`;
    }
    if (currentAdminModule === "expenses" && record.origem === "comissao") {
        return `${record.nome} (automatico)`;
    }
    return record[module.titleField] || module.label;
}

function getRecordDetails(record) {
    if (currentAdminModule === "appointments") {
        return [
            `Data: ${formatDate(record.data)} ${record.hora || ""}`,
            `Servico: ${displayValue("services", record.servicoId)}`,
            `Profissional: ${displayValue("team", record.profissionalId)}`,
            `Valor: ${formatCurrency(Number(record.valor || 0))}`,
            `Pagamento: ${displayValue("paymentMethods", record.formaPagamentoId)}`,
            `Situacao: ${record.situacao || "Agendado"}`
        ].map(detailChip).join("");
    }

    if (currentAdminModule === "services") {
        return [
            `Categoria: ${formatCategory(record.categoria)}`,
            `Duracao: ${record.duracaoMin} min`,
            `Profissional: ${displayValue("team", record.profissionalId)}`,
            `Comissao: ${Number(record.comissaoPct || 0)}%`
        ].map(detailChip).join("");
    }

    if (currentAdminModule === "expenses") {
        return [
            `Data: ${formatDate(record.data)}`,
            `Valor: ${formatCurrency(Number(record.valor || 0))}`,
            record.origem === "comissao" ? "Origem: comissao automatica" : "Origem: manual"
        ].map(detailChip).join("");
    }

    if (currentAdminModule === "paymentMethods") {
        const total = calculatePaymentTotals()[record.id] || 0;
        return [total ? `Vendas no periodo: ${formatCurrency(total)}` : "Sem vendas pagas"].map(detailChip).join("");
    }

    return adminModules[currentAdminModule].fields.slice(1).map((field) => {
        const value = formatRecordValue(field, record[field.name]);
        return value ? detailChip(`${field.label}: ${value}`) : "";
    }).join("");
}

function detailChip(text) {
    return `<span>${escapeHtml(text)}</span>`;
}

function formatRecordValue(field, value) {
    if (value == null || value === "") return "";
    if (field.type === "number" && ["valor", "salario"].includes(field.name)) return formatCurrency(Number(value));
    if (field.type === "date") return formatDate(value);
    if (field.source) return displayValue(field.source, value);
    return value;
}

async function handleAdminSubmit(event) {
    event.preventDefault();

    if (currentAdminModule === "finances") {
        renderFinanceReport();
        return;
    }

    const module = adminModules[currentAdminModule];
    const formData = new FormData(event.target);
    const store = getStore();
    const existingRecord = editingRecordId ? (store[module.storeKey] || []).find((record) => record.id === editingRecordId) : null;

    if (!canAccessModule(currentAdminModule) || (editingRecordId && !canAccessRecord(module.storeKey, existingRecord))) {
        showToast("Seu perfil nao pode alterar este cadastro.", "error");
        return;
    }

    const rawData = normalizeFormData(Object.fromEntries(formData.entries()), module);
    const preparedData = prepareRecordData(rawData, module.storeKey, store, existingRecord);
    const data = applyAccessRulesToData(preparedData, module.storeKey, store);
    if (!data) return;

    const changedId = editingRecordId;
    const submitButton = event.submitter;
    if (submitButton) submitButton.disabled = true;

    try {
        await persistRecord(module.storeKey, data, changedId);
        await loadStoreFromSupabase();
        await afterRecordMutation(module.storeKey);
        await loadStoreFromSupabase();

        showToast(changedId ? "Cadastro atualizado." : "Cadastro salvo.", "success");
        event.target.reset();
        editingRecordId = null;
        renderAdminModule();
        _onStoreChangedCallback();
    } catch (error) {
        console.error("Falha ao salvar cadastro", error);
        showToast(`Nao foi possivel salvar: ${getErrorMessage(error)}`, "error");
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

function prepareRecordData(data, storeKey, store, existingRecord) {
    if (storeKey !== "appointments") return data;

    const service = store.services.find((item) => item.id === data.servicoId);
    const keepsSameService = existingRecord?.servicoId === data.servicoId;
    const savedTotal = keepsSameService ? Number(existingRecord.valor) : Number(service?.valor || 0);

    return {
        ...data,
        valorTotal: savedTotal
    };
}

const tableByStoreKey = {
    clients: "cliente",
    appointments: "agendamento",
    services: "servico",
    team: "funcionario",
    products: "produto",
    expenses: "despesa",
    paymentMethods: "forma_pagamento"
};

async function persistRecord(storeKey, data, id = null) {
    const table = tableByStoreKey[storeKey];
    if (!table) throw new Error("Modulo sem tabela configurada.");

    const payload = toDatabasePayload(storeKey, data);
    let query = id
        ? supabase.from(table).update(payload).eq("id", Number(id))
        : supabase.from(table).insert(payload);

    const { data: saved, error } = await query.select("id").single();
    if (error) throw error;
    return String(saved.id);
}

function toDatabasePayload(storeKey, data) {
    const nullableText = (value) => String(value || "").trim() || null;
    const nullableId = (value) => value ? Number(value) : null;

    const payloads = {
        clients: {
            nome: data.nome,
            cpf: nullableText(data.cpf),
            telefone: nullableText(formatPhone(data.telefone)),
            email: nullableText(data.email)
        },
        appointments: {
            cliente_id: Number(data.clienteId),
            forma_pag_id: nullableId(data.formaPagamentoId),
            situacao: data.situacao,
            data_hora: `${data.data}T${data.hora || "00:00"}:00`,
            observacoes: nullableText(data.observacoes),
            servico_id: Number(data.servicoId),
            valor_total: Number(data.valorTotal || 0)
        },
        services: {
            nome: data.nome,
            duracao: Number(data.duracaoMin),
            categoria: data.categoria,
            valor: Number(data.valor),
            funcionario_id: Number(data.profissionalId),
            percentual_comissao: Number(data.comissaoPct)
        },
        team: {
            nome: data.nome,
            cpf: nullableText(data.cpf),
            telefone: nullableText(formatPhone(data.telefone)),
            cargo: nullableText(data.cargo),
            tipo_pagamento: nullableText(data.tipoPagamento),
            salario: Number(data.salario || 0)
        },
        products: {
            nome: data.nome,
            qtd_estoque: Number(data.quantidade || 0),
            categoria: nullableText(data.categoria)
        },
        expenses: {
            nome: data.nome,
            data: data.data,
            valor: Number(data.valor || 0)
        },
        paymentMethods: {
            nome: data.nome
        }
    };

    return payloads[storeKey];
}

function normalizeFormData(data, module) {
    const normalized = { ...data };
    module.fields.forEach((field) => {
        if (field.type === "number") {
            normalized[field.name] = Number(normalized[field.name] || 0);
        }
    });
    return normalized;
}

function applyAccessRulesToData(data, storeKey, store) {
    if (!isProfessionalUser()) return data;

    const profissionalId = getCurrentProfessionalId();
    const normalized = { ...data };

    if (storeKey === "services") {
        normalized.profissionalId = profissionalId;
        return normalized;
    }

    if (storeKey === "appointments") {
        const service = store.services.find((item) => item.id === normalized.servicoId);
        if (!service || service.profissionalId !== profissionalId) {
            showToast("Este servico nao esta atribuido ao profissional logado.", "error");
            return null;
        }
        normalized.profissionalId = profissionalId;
        return normalized;
    }

    if (storeKey === "products") {
        showToast("Profissionais podem consultar produtos, mas nao altera-los.", "error");
        return null;
    }

    showToast("Seu perfil nao pode alterar este modulo.", "error");
    return null;
}

async function afterRecordMutation(storeKey) {
    if (["appointments", "services", "team"].includes(storeKey)) {
        await syncAllCommissionsDb();
    }
}

function editAdminRecord(id) {
    const module = adminModules[currentAdminModule];
    const record = getAdminRecords().find((item) => item.id === id);
    if (!canAccessModule(currentAdminModule) || !record || record.origem === "comissao") return;

    editingRecordId = id;
    renderAdminModule();

    module.fields.forEach((field) => {
        const input = $(`#admin-${field.name}`);
        if (input) input.value = record[field.name] ?? "";
    });

    $("#adminSubmitBtn").textContent = "Salvar alteracoes";
    $("#adminCancelEditBtn").hidden = false;
    $("#adminEntityForm").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function deleteAdminRecord(id) {
    const module = adminModules[currentAdminModule];
    const store = getStore();
    const record = (store[module.storeKey] || []).find((item) => item.id === id);
    if (!canAccessModule(currentAdminModule) || !canAccessRecord(module.storeKey, record)) {
        showToast("Seu perfil nao pode excluir este cadastro.", "error");
        return;
    }

    if (record?.origem === "comissao") {
        showToast("Comissoes automaticas sao removidas ao alterar o agendamento.", "error");
        return;
    }

    const table = tableByStoreKey[module.storeKey];
    if (!table) return;

    try {
        const { error } = await supabase.from(table).delete().eq("id", Number(id));
        if (error) throw error;

        await loadStoreFromSupabase();
        if (["appointments", "services", "team"].includes(module.storeKey)) {
            await syncAllCommissionsDb();
            await loadStoreFromSupabase();
        }
        cancelAdminEdit();
        _onStoreChangedCallback();
        showToast("Cadastro excluido.");
    } catch (error) {
        console.error("Falha ao excluir cadastro", error);
        showToast(`Nao foi possivel excluir: ${getErrorMessage(error)}`, "error");
    }
}

export function cancelAdminEdit() {
    editingRecordId = null;
    $("#adminEntityForm")?.reset();
    renderAdminModule();
}

function getAdminRecords() {
    const module = adminModules[currentAdminModule];
    if (module.readonly) return [];
    return getVisibleRecords(module.storeKey);
}

function getRecordCountLabel(records, module) {
    if (module.readonly) return "Relatorio";
    return `${records.length} ${records.length === 1 ? "registro" : "registros"}`;
}
