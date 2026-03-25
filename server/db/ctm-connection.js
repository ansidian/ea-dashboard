import { createClient } from "@libsql/client";

let ctmDb = null;
let initialized = false;

function getCtmDb() {
  if (initialized) return ctmDb;
  initialized = true;

  if (!process.env.CTM_TURSO_DATABASE_URL) {
    console.warn("[CTM DB] CTM_TURSO_DATABASE_URL not set — deadlines will be unavailable");
    return null;
  }

  ctmDb = createClient({
    url: process.env.CTM_TURSO_DATABASE_URL,
    authToken: process.env.CTM_TURSO_AUTH_TOKEN,
  });
  return ctmDb;
}

export default getCtmDb;
