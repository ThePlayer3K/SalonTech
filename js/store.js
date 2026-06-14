import { supabase } from "./supabase.js";
import {
    STORAGE_KEY,
    AUTH_MARKER_PREFIX,
    ROLE_PROFESSIONAL,
    moduleOrder,
    professionalModuleOrder
} from "./config.js";
import { formatPhone, normalizeCpf } from "./utils.js";

export const storage = {
    get(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : fallback;
        } catch (error) {
            console.warn(`Falha ao ler ${key}`, error);
            return fallback;
        }
    },
    set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }
};

let appStore = {
    users: [],
    clients: [],
    team: [],
    products: [],
    paymentMethods: [],
    services: [],
    appointments: [],
    expenses: [],
    reviews: storage.get(STORAGE_KEY, {})?.reviews || [],
    contactRequests: storage.get(STORAGE_KEY, {})?.contactRequests || []
};

export function getStore() {
    return appStore;
}

export function saveStore(store) {
    appStore = store;
    storage.set(STORAGE_KEY, {
        reviews: store.reviews || [],
        contactRequests: store.contactRequests || []
    });
}

export function getRecords(storeKey) {
    return getStore()[storeKey] || [];
}

export function setRecords(storeKey, records) {
    const store = getStore();
    store[storeKey] = records;
    saveStore(store);
}

export function findRecord(storeKey, id) {
    return getRecords(storeKey).find((record) => record.id === id);
}

export function displayValue(storeKey, id) {
    const record = findRecord(storeKey, id);
    return record?.nome || "Nao informado";
}

export function getServices() {
    return getRecords("services");
}

export function getVisibleRecords(storeKey) {
    const records = getRecords(storeKey);
    if (!isProfessionalUser()) return records;

    const profissionalId = getCurrentProfessionalId();
    if (storeKey === "products") return records;
    if (storeKey === "services") return records.filter((record) => record.profissionalId === profissionalId);
    if (storeKey === "appointments") return records.filter((record) => record.profissionalId === profissionalId);
    if (storeKey === "team") return records.filter((record) => record.id === profissionalId);
    return [];
}

export function getVisibleServices() {
    return getVisibleRecords("services");
}

export function canAccessRecord(storeKey, record) {
    if (!isProfessionalUser()) return true;
    if (!record) return false;

    const profissionalId = getCurrentProfessionalId();
    if (storeKey === "products") return false;
    if (storeKey === "services") return record.profissionalId === profissionalId;
    if (storeKey === "appointments") return record.profissionalId === profissionalId;
    return false;
}

export function getCurrentSession() {
    return storage.get("salonTechSession", null);
}

export function getCurrentUser() {
    const session = getCurrentSession();
    if (!session) return null;
    return getStore().users.find((user) => user.id === session.userId) || null;
}

export function isProfessionalUser() {
    return getCurrentUser()?.role === ROLE_PROFESSIONAL;
}

export function getCurrentProfessionalId() {
    return getCurrentUser()?.profissionalId || "";
}

export function getVisibleModuleOrder() {
    return isProfessionalUser() ? professionalModuleOrder : moduleOrder;
}

export function canAccessModule(moduleKey) {
    return getVisibleModuleOrder().includes(moduleKey);
}

export function normalizeRole(role) {
    const value = String(role || "").toLowerCase();
    return ["f", "p", ROLE_PROFESSIONAL, "profissional", "funcionario", "funcionário"].includes(value)
        ? ROLE_PROFESSIONAL
        : "admin";
}

export function encodeRole(role) {
    return role === ROLE_PROFESSIONAL ? "F" : "A";
}

export function authMarker(authUserId) {
    return `${AUTH_MARKER_PREFIX}${authUserId}`;
}

export function parseAuthMarker(value) {
    const marker = String(value || "");
    return marker.startsWith(AUTH_MARKER_PREFIX) ? marker.slice(AUTH_MARKER_PREFIX.length) : "";
}

export async function loadStoreFromSupabase() {
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

    const failed = results.find((result) => result.error);
    if (failed) throw failed.error;

    const [users, clients, team, products, paymentMethods, services, appointments, expenses] = results.map((result) => result.data || []);
    const mappedServices = services.map(mapServiceRow);
    await backfillMissingAppointmentTotals(appointments, mappedServices);

    appStore = {
        ...appStore,
        users: users.map((row) => ({
            id: String(row.id),
            name: row.nome || "",
            authId: parseAuthMarker(row.senha),
            role: normalizeRole(row.tipo),
            profissionalId: row.funcionario_id == null ? "" : String(row.funcionario_id)
        })),
        clients: clients.map((row) => ({
            id: String(row.id),
            nome: row.nome || "",
            cpf: row.cpf || "",
            telefone: formatPhone(row.telefone),
            email: row.email || ""
        })),
        team: team.map((row) => ({
            id: String(row.id),
            nome: row.nome || "",
            cpf: row.cpf || "",
            telefone: formatPhone(row.telefone),
            cargo: row.cargo || "",
            tipoPagamento: row.tipo_pagamento || "",
            salario: Number(row.salario || 0)
        })),
        products: products.map((row) => ({
            id: String(row.id),
            nome: row.nome || "",
            quantidade: Number(row.qtd_estoque || 0),
            categoria: row.categoria || ""
        })),
        paymentMethods: paymentMethods.map((row) => ({ id: String(row.id), nome: row.nome || "" })),
        services: mappedServices,
        appointments: appointments.map((row) => mapAppointmentRow(row, mappedServices)),
        expenses: expenses.map((row) => ({
            id: String(row.id),
            nome: row.nome || "",
            data: row.data || "",
            valor: Number(row.valor || 0),
            origem: isCommissionExpenseName(row.nome) ? "comissao" : "manual"
        }))
    };
}

export function mapServiceRow(row) {
    return {
        id: String(row.id),
        nome: row.nome || "",
        duracaoMin: Number(row.duracao || 0),
        categoria: row.categoria || "",
        valor: Number(row.valor || 0),
        profissionalId: row.funcionario_id == null ? "" : String(row.funcionario_id),
        comissaoPct: Number(row.percentual_comissao || 0)
    };
}

export function mapAppointmentRow(row, services = appStore.services) {
    const service = services.find((item) => item.id === String(row.servico_id));
    const dateTime = String(row.data_hora || "").replace(" ", "T");
    return {
        id: String(row.id),
        clienteId: row.cliente_id == null ? "" : String(row.cliente_id),
        servicoId: row.servico_id == null ? "" : String(row.servico_id),
        profissionalId: service?.profissionalId || "",
        valor: Number(row.valor_total ?? 0),
        data: dateTime.slice(0, 10),
        hora: dateTime.slice(11, 16),
        formaPagamentoId: row.forma_pag_id == null ? "" : String(row.forma_pag_id),
        situacao: row.situacao || "Agendado",
        observacoes: row.observacoes || ""
    };
}

export async function backfillMissingAppointmentTotals(appointments, services) {
    const missingTotals = appointments.filter((row) => row.valor_total == null);
    if (!missingTotals.length) return;

    await Promise.all(missingTotals.map(async (row) => {
        const service = services.find((item) => item.id === String(row.servico_id));
        if (!service) return;

        const { error } = await supabase
            .from("agendamento")
            .update({ valor_total: Number(service.valor || 0) })
            .eq("id", row.id);
        if (error) throw error;
        row.valor_total = Number(service.valor || 0);
    }));
}

function isCommissionExpenseName(name) {
    const value = String(name || "");
    return /^Comissão de .+/.test(value) || /^Comissao agendamento #\d+$/.test(value);
}
