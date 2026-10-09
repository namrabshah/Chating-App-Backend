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
    console.log("Existing tables in public schema:", res.rows.map(r => r.table_name));

    // Determine casing for tables
    const tableNames = res.rows.map(r => r.table_name);
    const convTable = tableNames.find(t => t.toLowerCase() === "conversation") || "Conversation";
    const memberTable = tableNames.find(t => t.toLowerCase() === "conversationmember") || "ConversationMember";
    const msgTable = tableNames.find(t => t.toLowerCase() === "message") || "Message";

    console.log(`Using tables: ${convTable}, ${memberTable}, ${msgTable}`);

    await client.query(`
      ALTER TABLE "${convTable}"
      ADD COLUMN IF NOT EXISTS "type" VARCHAR(255) DEFAULT 'DIRECT',
      ADD COLUMN IF NOT EXISTS "name" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "avatar" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "createdBy" INTEGER;
    `);

    await client.query(`
      ALTER TABLE "${memberTable}"
      ADD COLUMN IF NOT EXISTS "role" VARCHAR(255) DEFAULT 'MEMBER',
      ADD COLUMN IF NOT EXISTS "joinedAt" TIMESTAMPTZ DEFAULT NOW();
    `);

    await client.query(`
      ALTER TABLE "${msgTable}"
      ADD COLUMN IF NOT EXISTS "type" VARCHAR(255) DEFAULT 'TEXT';
    `);

    console.log("Migration executed successfully!");
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await client.end();
  }
}

migrate();
