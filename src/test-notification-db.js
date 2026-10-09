import { db } from "./prisma/db.js";

async function test() {
  try {
    const notifications = await db.orm.public.Notification.all();
    console.log("Fetched notifications:", notifications);
  } catch (err) {
    console.error("Test notification error:", err);
  }
}

test();
