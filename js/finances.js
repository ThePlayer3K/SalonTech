import { supabase } from "./supabase.js";
import { $, formatCurrency, escapeHtml, todayISO, monthStartISO } from "./utils.js";
import { getStore, displayValue } from "./store.js";

export function commissionExpenseName(professionalName) {
    return `Comissão de ${professionalName || "profissional"}`.slice(0, 50);
}

export function isCommissionExpenseName(name) {
    const value = String(name || "");
    return /^Comissão de .+/.test(value) || isLegacyCommissionExpenseName(value);
}

export function isLegacyCommissionExpenseName(name) {
    return /^Comissao agendamento #\d+$/.test(String(name || ""));
}

export function getPaidAppointments(store) {
    return store.appointments.filter(isPaidAppointment);
}

function isPaidAppointment(appointment) {
    return appointment.situacao === "Pago";
}

export function isDateInRange(date, start, end) {
    if (!date) return false;
    return (!start || date >= start) && (!end || date <= end);
}

export function calculatePaymentTotals() {
    const store = getStore();
    const paid = getPaidAppointments(store).filter((appointment) =>
        isDateInRange(appointment.data, monthStartISO(), todayISO())
    );
    return paid.reduce((map, appointment) => {
        const key = appointment.formaPagamentoId || "none";
        map[key] = (map[key] || 0) + Number(appointment.valor || 0);
        return map;
    }, {});
}

export async function syncAllCommissionsDb() {
    const store = getStore();
    const commissionRows = getPaidAppointments(store).map((appointment) => {
        const service = store.services.find((item) => item.id === appointment.servicoId);
        const professional = store.team.find((item) => item.id === service?.profissionalId);
        const commission = Number((Number(appointment.valor || 0) * (Number(service?.comissaoPct || 0) / 100)).toFixed(2));
        if (!commission) return null;

        return {
            nome: commissionExpenseName(professional?.nome),
            data: appointment.data,
            valor: commission
        };
    }).filter(Boolean);

    const pendingRows = [...commissionRows];
    const expenseIdsToDelete = store.expenses
        .filter((expense) => expense.origem === "comissao")
        .filter((expense) => {
            const matchIndex = pendingRows.findIndex((row) => commissionRowsMatch(row, expense));
            if (matchIndex === -1) return true;
            pendingRows.splice(matchIndex, 1);
            return false;
        })
        .map((expense) => Number(expense.id));

    if (expenseIdsToDelete.length) {
        const { error } = await supabase.from("despesa").delete().in("id", expenseIdsToDelete);
        if (error) throw error;
    }

    if (pendingRows.length) {
        const { error } = await supabase.from("despesa").insert(pendingRows);
        if (error) throw error;
    }
}

function commissionRowsMatch(expected, current) {
    return expected.nome === current.nome
        && expected.data === current.data
        && Number(expected.valor).toFixed(2) === Number(current.valor).toFixed(2);
}

export function renderFinanceReport() {
    const list = $("#adminRecordsList");
    const store = getStore();
    const inicio = $("#admin-inicio")?.value || monthStartISO();
    const fim = $("#admin-fim")?.value || todayISO();
    const paid = getPaidAppointments(store).filter((appointment) => isDateInRange(appointment.data, inicio, fim));
    const expenses = store.expenses.filter((expense) => isDateInRange(expense.data, inicio, fim));

    const entries = groupByLabel(paid, (appointment) => displayValue("services", appointment.servicoId), (appointment) => Number(appointment.valor || 0));
    const exits = groupByLabel(expenses, (expense) => expense.nome, (expense) => Number(expense.valor || 0));
    const paymentTotals = groupByLabel(paid, (appointment) => displayValue("paymentMethods", appointment.formaPagamentoId), (appointment) => Number(appointment.valor || 0));
    const totalEntries = entries.reduce((sum, item) => sum + item.total, 0);
    const totalExits = exits.reduce((sum, item) => sum + item.total, 0);
    const net = totalEntries - totalExits;

    $("#adminRecordCount").textContent = `${paid.length} atendimento${paid.length === 1 ? "" : "s"} pago${paid.length === 1 ? "" : "s"}`;

    list.innerHTML = `
        <div class="finance-summary">
            <article>
                <span>Entradas</span>
                <strong>${formatCurrency(totalEntries)}</strong>
            </article>
            <article>
                <span>Despesas</span>
                <strong>${formatCurrency(totalExits)}</strong>
            </article>
            <article class="${net < 0 ? "negative" : "positive"}">
                <span>Liquido</span>
                <strong>${formatCurrency(net)}</strong>
            </article>
        </div>
        <div class="finance-grid">
            ${renderFinanceSection("Entradas por servico", entries, "Nenhuma entrada no periodo.")}
            ${renderFinanceSection("Despesas cadastradas", exits, "Nenhuma despesa no periodo.")}
            ${renderFinanceSection("Vendas por pagamento", paymentTotals, "Nenhuma venda paga no periodo.")}
        </div>
    `;
}

function renderFinanceSection(title, items, emptyText) {
    return `
        <section class="finance-section">
            <h4>${title}</h4>
            ${items.length ? items.map((item) => `
                <div class="finance-row">
                    <span>${escapeHtml(item.label)}</span>
                    <strong>${formatCurrency(item.total)}</strong>
                </div>
            `).join("") : `<p class="empty-state">${emptyText}</p>`}
        </section>
    `;
}

function groupByLabel(items, labelGetter, valueGetter) {
    const map = new Map();
    items.forEach((item) => {
        const label = labelGetter(item) || "Nao informado";
        const value = valueGetter(item);
        map.set(label, (map.get(label) || 0) + value);
    });
    return Array.from(map.entries())
        .map(([label, total]) => ({ label, total }))
        .sort((a, b) => b.total - a.total);
}
