export const $ = (selector) => document.querySelector(selector);

export function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

export function monthStartISO() {
    return `${todayISO().slice(0, 7)}-01`;
}

export function formatCurrency(value) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    }).format(Number(value || 0));
}

export function formatDate(value) {
    if (!value) return "Nao informado";
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
}

export function formatCpf(value) {
    const digits = normalizeCpf(value);
    return digits
        .replace(/^(\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function normalizeCpf(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 11);
}

export function formatPhone(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
    if (!digits) return "";
    if (digits.length <= 2) return `(${digits}`;

    const areaCode = digits.slice(0, 2);
    const number = digits.slice(2);
    if (number.length <= 4) return `(${areaCode}) ${number}`;
    if (digits.length <= 10) return `(${areaCode}) ${number.slice(0, 4)}-${number.slice(4)}`;
    return `(${areaCode}) ${number.slice(0, 5)}-${number.slice(5)}`;
}

export function formatCategory(value) {
    const labels = {
        Estetica: "Estética"
    };
    return labels[value] || value || "Nao informado";
}

export function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export function getErrorMessage(error) {
    if (!error) return "erro desconhecido";
    if (error.code === "23503") return "o registro ainda esta vinculado a outro cadastro";
    if (error.code === "23505") return "ja existe um registro com estes dados";
    return error.message || String(error);
}

export function createId(prefix = "id") {
    if (window.crypto?.randomUUID) {
        return `${prefix}-${window.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildStars(rating) {
    const value = Math.max(0, Math.min(5, Number(rating) || 0));
    return "*".repeat(value) + "-".repeat(5 - value);
}

export function showToast(message, type = "") {
    const region = document.querySelector("#toastRegion");
    if (!region) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`.trim();
    toast.textContent = message;
    region.append(toast);

    window.setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(8px)";
        window.setTimeout(() => toast.remove(), 180);
    }, 2800);
}
