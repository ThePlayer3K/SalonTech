import { supabase } from "./supabase.js";

document.addEventListener("DOMContentLoaded", async () => {
    console.log("SalonTech carregado.");

    const { data, error } = await supabase.from("servico").select("id, nome, valor").order("id");
    if (error) {
        console.error("Erro ao buscar serviços:", error);
        return;
    }

    console.log("Serviços encontrados:", data.length);
});
