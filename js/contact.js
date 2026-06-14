import { $, createId, showToast } from "./utils.js";
import { getStore, saveStore } from "./store.js";

export function setupContact() {
    $("#contactForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        const store = getStore();
        const request = {
            id: createId("contact"),
            ...Object.fromEntries(new FormData(event.target).entries()),
            createdAt: new Date().toISOString()
        };
        store.contactRequests.unshift(request);
        saveStore(store);
        event.target.reset();
        showToast("Solicitacao enviada para o atendente.", "success");
    });
}
