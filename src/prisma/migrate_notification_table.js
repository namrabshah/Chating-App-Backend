import pg from "pg";
import "dotenv/config";

const { Client } = pg;

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema='public';
    `);
    const tableNames = res.rows.map(r => r.table_name);
    console.log("Existing tables in public schema:", tableNames);

    const userTable = tableNames.find(t => t.toLowerCase() === "user") || "User";
    const notificationTable = tableNames.find(t => t.toLowerCase() === "notification") || "Notification";

    console.log(`Using user table: ${userTable}, notification table: ${notificationTable}`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${notificationTable}" (
        "id" SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        "type" VARCHAR(255) NOT NULL DEFAULT 'MESSAGE',
        "title" VARCHAR(255) NOT NULL,
        "message" TEXT NOT NULL,
        "conversationId" INTEGER,
        "messageId" INTEGER,
        "actorId" INTEGER,
        "isRead" BOOLEAN NOT NULL DEFAULT FALSE,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_notification_user FOREIGN KEY ("userId") REFERENCES "${userTable}"("id") ON DELETE CASCADE
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notification_user_created ON "${notificationTable}"("userId", "createdAt" DESC);
    `);

    console.log("Notification migration executed successfully!");
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await client.end();
  }
}

migrate();
