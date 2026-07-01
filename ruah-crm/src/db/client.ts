import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { limparTokenDb } from "./env";
import * as schema from "./schema";

const client = createClient({
  url: (process.env.DATABASE_URL || "file:./ruah-crm.db").trim(),
  authToken: limparTokenDb(process.env.DATABASE_AUTH_TOKEN),
});

export const db = drizzle(client, { schema });
