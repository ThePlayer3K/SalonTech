import { $, escapeHtml, formatCurrency, showToast } from "./utils.js";
import { getVisibleServices, findRecord } from "./store.js";
import { formatCategory } from "./utils.js";

let _onServiceInterestCallback = () => {};

export function setServiceInterestCallback(fn) {
    _onServiceInterestCallback = fn;
}

export function setupServices() {
    renderServiceOptions();
    renderServices(getVisibleServices());

    $("#filtersForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        applyServiceFilters();
    });

    $("#searchInput")?.addEventListener("input", applyServiceFilters);
    $("#categoryFilter")?.addEventListener("change", applyServiceFilters);
    $("#priceFilter")?.addEventListener("change", applyServiceFilters);

    $("#clearFiltersBtn")?.addEventListener("click", () => {
        $("#filtersForm").reset();
        renderServices(getVisibleServices());
    });
}

export function renderServices(items) {
    const grid = $("#servicesGrid");
    const count = $("#resultsCount");
    if (!grid || !count) return;

    count.textContent = `${items.length} ${items.length === 1 ? "servico" : "servicos"}`;

    if (!items.length) {
        grid.innerHTML = `<p class="empty-state">Nenhum servico encontrado com estes filtros.</p>`;
        return;
    }

    grid.innerHTML = items.map((service) => {
        const professional = findRecord("team", service.profissionalId);
        return `
            <article class="service-card">
                <div class="service-card-body">
                    <div class="service-meta">
                        <span class="badge">${escapeHtml(formatCategory(service.categoria))}</span>
                        <span class="price">${formatCurrency(Number(service.valor))}</span>
                    </div>
                    <h3>${escapeHtml(service.nome)}</h3>
                    <small>${Number(service.duracaoMin)} min com ${escapeHtml(professional?.nome || "Equipe")}</small>
                    <button class="btn btn-primary" type="button" data-service-interest="${service.id}">Usar na agenda</button>
                </div>
            </article>
        `;
    }).join("");

    grid.querySelectorAll("[data-service-interest]").forEach((button) => {
        button.addEventListener("click", () => {
            const selected = getVisibleServices().find((service) => service.id === button.dataset.serviceInterest);
            if (!selected) return;
            _onServiceInterestCallback(selected);
        });
    });
}

export function applyServiceFilters() {
    const search = $("#searchInput").value.trim().toLowerCase();
    const category = $("#categoryFilter").value;
    const price = $("#priceFilter").value;

    const filtered = getVisibleServices().filter((service) => {
        const professional = findRecord("team", service.profissionalId);
        const matchesSearch = [service.nome, service.categoria, professional?.nome]
            .join(" ")
            .toLowerCase()
            .includes(search);
        const matchesCategory = category === "todos" || service.categoria === category;
        const matchesPrice =
            price === "todos" ||
            (price === "ate40" && Number(service.valor) <= 40) ||
            (price === "41a80" && Number(service.valor) >= 41 && Number(service.valor) <= 80) ||
            (price === "acima80" && Number(service.valor) > 80);

        return matchesSearch && matchesCategory && matchesPrice;
    });

    renderServices(filtered);
}

export function renderServiceOptions() {
    const options = `<option value="">Selecione</option>${getVisibleServices()
        .map((service) => `<option value="${escapeHtml(service.nome)}">${escapeHtml(service.nome)}</option>`)
        .join("")}`;

    const contactService = $("#contactService");
    const reviewService = $("#reviewService");
    if (contactService) contactService.innerHTML = options;
    if (reviewService) reviewService.innerHTML = options;
}
