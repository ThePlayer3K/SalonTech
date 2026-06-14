import { getStore, loadStoreFromSupabase, getVisibleServices } from "./store.js";
import { $, getErrorMessage, showToast } from "./utils.js";
import {
    setAuthStatus,
    setupSplash,
    setupTheme,
    setupNavigation,
    setupOfflineHandler,
    updateScrollProgress,
    renderModuleNavigation,
    setupPasswordToggle
} from "./ui.js";
import { setupAuth, setOnUnlockCallback } from "./auth.js";
import {
    setupAdmin,
    renderAdminTabs,
    renderAdminModule,
    openAdminModule,
    getCurrentAdminModule,
    ensureCurrentModuleAccess,
    setOnStoreChangedCallback,
    fillAppointmentFromService
} from "./admin.js";
import { isLegacyCommissionExpenseName, syncAllCommissionsDb } from "./finances.js";
import {
    setupServices,
    renderServices,
    renderServiceOptions,
    setServiceInterestCallback
} from "./services-section.js";
import { setupReviews } from "./reviews.js";
import { setupContact } from "./contact.js";

function applyAccessProfile() {
    ensureCurrentModuleAccess();
    renderModuleNavigation(getCurrentAdminModule());

    if ($("#adminTabs") && $("#adminEntityForm")) {
        renderAdminTabs();
        renderAdminModule();
    }

    if ($("#servicesGrid")) {
        renderServices(getVisibleServices());
    }
}

// Wire: after admin store mutations, refresh public views
setOnStoreChangedCallback(() => {
    renderServices(getVisibleServices());
    renderServiceOptions();
});

// Wire: "Usar na agenda" button in services catalog → open appointments module
setServiceInterestCallback((selected) => {
    openAdminModule("appointments");

    const serviceInput = $("#admin-servicoId");
    if (serviceInput) {
        serviceInput.value = selected.id;
        fillAppointmentFromService(selected.id);
    }
    $("#admin-clienteId")?.focus();
    document.querySelector("#painel")?.scrollIntoView({ behavior: "smooth" });
    showToast(`${selected.nome} enviado para a agenda.`, "success");
});

// Wire: after login/register, apply access profile
setOnUnlockCallback(applyAccessProfile);

setupPasswordToggle();

document.addEventListener("DOMContentLoaded", async () => {
    setupSplash();
    setupTheme();
    setupNavigation(openAdminModule);
    setupOfflineHandler();
    updateScrollProgress();

    try {
        await loadStoreFromSupabase();
        if (getStore().expenses.some((expense) => isLegacyCommissionExpenseName(expense.nome))) {
            await syncAllCommissionsDb();
            await loadStoreFromSupabase();
        }
        await setupAuth();
        setupServices();
        setupAdmin();
        setupContact();
        setupReviews();
    } catch (error) {
        console.error("Falha ao carregar o Supabase", error);
        setAuthStatus(`Nao foi possivel conectar ao banco: ${getErrorMessage(error)}`, "error");
    }
});
