import pg from "pg";
import "dotenv/config";

const { Client } = pg;

async function fixTableName() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    await client.query(`ALTER TABLE IF EXISTS "Notification" RENAME TO "notification";`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "notification" (
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
        CONSTRAINT fk_notification_user FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      );
    `);
    console.log("Renamed table to 'notification'");
  } catch (err) {
    console.error("Fix error:", err);
  } finally {
    await client.end();
  }
}

fixTableName();
