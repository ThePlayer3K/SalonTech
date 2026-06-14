import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://dormwwurzutrnlvkxhxp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JVAgjidjoSnlhTx4UDBtIQ_fEl5cUjO";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});
