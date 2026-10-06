import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const workspaces = sqliteTable("workspaces", {
  ownerId: text("owner_id").primaryKey(),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull().default(0),
  updatedAt: text("updated_at").notNull()
});
export const businessBranches = sqliteTable('business_branches', {
 id: text('id').primaryKey(),
 ownerId: text('owner_id').notNull(),
 category: text('category').notNull(),
 name: text('name').notNull(),
 city: text('city').notNull(),
 listed: integer('listed').notNull().default(0),
 createdAt: text('created_at').notNull()
});
