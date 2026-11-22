import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

const ownerId = () =>
  text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

export const paperSourceType = pgEnum("paper_source_type", [
  "manual",
  "pdf",
  "doi",
  "arxiv",
  "url",
]);

export const processingStatus = pgEnum("processing_status", [
  "pending",
  "processing",
  "ready",
  "failed",
]);

export type PaperAuthor = { name: string; orcid?: string };

/** Deleting a folder deletes its subfolders and moves its papers to the root. */
export const folder = pgTable(
  "folder",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: ownerId(),
    parentId: uuid().references((): AnyPgColumn => folder.id, { onDelete: "cascade" }),
    name: text().notNull(),
    ...timestamps,
  },
  (t) => [
    index().on(t.userId),
    index().on(t.parentId),
    unique("folder_user_parent_name_unique").on(t.userId, t.parentId, t.name).nullsNotDistinct(),
  ],
);

export const paper = pgTable(
  "paper",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: ownerId(),
    title: text().notNull(),
    abstract: text(),
    authors: jsonb().$type<PaperAuthor[]>().notNull().default([]),
    year: integer(),
    venue: text(),
    doi: text(),
    arxivId: text(),
    url: text(),
    folderId: uuid().references(() => folder.id, { onDelete: "set null" }),
    sourceType: paperSourceType().notNull().default("manual"),
    status: processingStatus().notNull().default("pending"),
    error: text(),
    /** Also used for cache busting. */
    thumbnailAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.userId, t.createdAt),
    index().on(t.folderId),
    uniqueIndex("paper_user_doi_unique").on(t.userId, t.doi).where(sql`${t.doi} is not null`),
    uniqueIndex("paper_user_arxiv_unique")
      .on(t.userId, t.arxivId)
      .where(sql`${t.arxivId} is not null`),
  ],
);

export const file = pgTable(
  "file",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: ownerId(),
    paperId: uuid().references(() => paper.id, { onDelete: "cascade" }),
    storageKey: text().notNull().unique(),
    fileName: text().notNull(),
    mimeType: text().notNull(),
    size: bigint({ mode: "number" }).notNull(),
    sha256: text(),
    ...timestamps,
  },
  (t) => [index().on(t.paperId), index().on(t.userId)],
);

export const paperContent = pgTable(
  "paper_content",
  {
    paperId: uuid()
      .primaryKey()
      .references(() => paper.id, { onDelete: "cascade" }),
    content: text().notNull(),
    searchVector: tsvector().generatedAlwaysAs(sql`to_tsvector('simple', coalesce(content, ''))`),
    html: text(),
    imageUrl: text(),
    /** Whether the page allows being framed (live preview). */
    embeddable: boolean(),
    ...timestamps,
  },
  (t) => [index("paper_content_search_idx").using("gin", t.searchVector)],
);

export const tag = pgTable(
  "tag",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: ownerId(),
    name: text().notNull(),
    color: text(),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.userId, t.name)],
);

export const paperTag = pgTable(
  "paper_tag",
  {
    paperId: uuid()
      .notNull()
      .references(() => paper.id, { onDelete: "cascade" }),
    tagId: uuid()
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.paperId, t.tagId] }), index().on(t.tagId)],
);

/** Relative to the page, 0..1. */
export type NoteRect = { x: number; y: number; w: number; h: number };

/** `quote` keeps the note meaningful if the anchor can't be located anymore. */
export type NoteAnchor =
  | { type: "pdf"; fileId: string; page: number; rects: NoteRect[]; quote: string }
  | { type: "text"; start: number; end: number; quote: string };

export const note = pgTable(
  "note",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: ownerId(),
    paperId: uuid().references(() => paper.id, { onDelete: "set null" }),
    title: text().notNull().default(""),
    body: text().notNull().default(""),
    anchor: jsonb().$type<NoteAnchor>(),
    ...timestamps,
  },
  (t) => [index().on(t.userId, t.updatedAt), index().on(t.paperId)],
);
