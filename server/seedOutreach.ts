import { db } from "./db";
import { outreachLeads, users } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import seedLeads from "./seed-outreach.json";

/**
 * Seeds the outreach_leads table once, the first time it is empty.
 * Mirrors seedDatabaseIfEmpty(): safe to call on every startup.
 *
 * Leads are assigned to the owner account (looked up by OWNER_EMAIL, or the
 * sole user if there is exactly one). If no owner can be resolved yet, the
 * seed is skipped and retried on a later startup.
 */
export async function seedOutreachIfEmpty() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(outreachLeads);

  if (Number(count) > 0) {
    console.log("Outreach leads already present, skipping outreach seed.");
    return;
  }

  // Resolve the owner user id
  const ownerEmail = process.env.OWNER_EMAIL;
  let ownerId: string | undefined;

  if (ownerEmail) {
    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, ownerEmail))
      .limit(1);
    ownerId = owner?.id;
  }

  if (!ownerId) {
    const allUsers = await db.select({ id: users.id }).from(users);
    if (allUsers.length === 1) ownerId = allUsers[0].id;
  }

  if (!ownerId) {
    console.log(
      "Outreach seed: no owner user resolved yet — will retry on next startup."
    );
    return;
  }

  console.log(`Seeding ${seedLeads.length} outreach leads for owner ${ownerId}...`);

  for (const lead of seedLeads as any[]) {
    await db.insert(outreachLeads).values({ ...lead, userId: ownerId });
  }

  console.log(`Seeded ${seedLeads.length} outreach leads.`);
}
