import { createClient } from "@libsql/client";

if (!process.env.CTM_TURSO_DATABASE_URL) {
  console.warn("[CTM DB] CTM_TURSO_DATABASE_URL not set — deadlines will be unavailable");
}

const ctmDb = process.env.CTM_TURSO_DATABASE_URL
  ? createClient({
      url: process.env.CTM_TURSO_DATABASE_URL,
      authToken: process.env.CTM_TURSO_AUTH_TOKEN,
    })
  : null;

export default ctmDb;
