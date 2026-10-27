import {
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const editorialRecords = mysqlTable(
  "editorial_records",
  {
    id: varchar("id", { length: 100 }).primaryKey(),
    kind: mysqlEnum("kind", [
      "article",
      "event",
      "source",
      "bias",
      "analysis",
    ]).notNull(),
    sourceSlug: varchar("source_slug", { length: 100 }),
    urlHash: varchar("url_hash", { length: 64 }).unique(),
    title: varchar("title", { length: 1000 }).notNull(),
    payload: json("payload").$type<Record<string, unknown>>().notNull(),
    status: mysqlEnum("status", ["draft", "published", "archived"])
      .default("draft")
      .notNull(),
    verificationStatus: mysqlEnum("verification_status", [
      "provided",
      "verified",
      "demo",
      "needs_review",
    ])
      .default("needs_review")
      .notNull(),
    provenanceNote: text("provenance_note").notNull(),
    methodology: text("methodology").notNull(),
    editorialDisclosure: text("editorial_disclosure").notNull(),
    evidenceUrl: varchar("evidence_url", { length: 2048 }),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("public_kind_status").on(table.kind, table.status),
    index("source_records").on(table.sourceSlug),
  ]
);
export type EditorialRecord = typeof editorialRecords.$inferSelect;

export const datasetManifests = mysqlTable("dataset_manifests", {
  id: varchar("id", { length: 100 }).primaryKey(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  supportingData: json("supporting_data")
    .$type<Record<string, unknown>>()
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const recordVersions = mysqlTable(
  "record_versions",
  {
    id: int("id").autoincrement().primaryKey(),
    recordId: varchar("record_id", { length: 100 }).notNull(),
    version: int("version").notNull(),
    snapshot: json("snapshot").$type<Record<string, unknown>>().notNull(),
    actorId: int("actor_id"),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("record_version_unique").on(table.recordId, table.version),
  ]
);
export const auditEvents = mysqlTable("audit_events", {
  id: int("id").autoincrement().primaryKey(),
  entityId: varchar("entity_id", { length: 100 }).notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  actorId: int("actor_id"),
  reason: text("reason").notNull(),
  beforeStatus: varchar("before_status", { length: 30 }),
  afterStatus: varchar("after_status", { length: 30 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const importTokens = mysqlTable("import_tokens", {
  id: varchar("id", { length: 40 }).primaryKey(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  actorId: int("actor_id").notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const correctionIntakes = mysqlTable(
  "correction_intakes",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    entityId: varchar("entity_id", { length: 100 }).notNull(),
    entityKind: varchar("entity_kind", { length: 20 }).notNull(),
    claim: text("claim").notNull(),
    message: text("message").notNull(),
    evidenceUrl: varchar("evidence_url", { length: 2048 }),
    status: mysqlEnum("status", ["submitted", "triaged", "closed"])
      .default("submitted")
      .notNull(),
    consentVersion: varchar("consent_version", { length: 20 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [index("intake_target").on(table.entityId)]
);
