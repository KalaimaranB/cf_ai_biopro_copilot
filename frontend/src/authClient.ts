import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
    baseURL: "https://backend.biopro.workers.dev" 
});