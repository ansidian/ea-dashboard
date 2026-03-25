import { createClient } from "@libsql/client";

const isProd = process.env.NODE_ENV === "production";

const db = createClient(
  isProd
    ? { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: "file:server/db/ea.db" },
);

export default db;
