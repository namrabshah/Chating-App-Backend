import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

try {
  await client.connect();

  const result = await client.query("SELECT current_database(), NOW()");

  console.log("✅ PostgreSQL Connected!");
  console.log(result.rows[0]);

  await client.end();
} catch (error) {
  console.error("❌ Database connection failed:");
  console.error(error.message);
}