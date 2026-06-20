import type { FastifyInstance } from "fastify";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import { standardsFiles } from "../db/schema";

const MAX_CONTENT_BYTES = 256 * 1024;

const skillBody = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  content: z.string().min(1).max(MAX_CONTENT_BYTES),
  enabled: z.boolean().optional(),
});

const docBody = z.object({
  content: z.string().max(MAX_CONTENT_BYTES),
});

// The three well-known stage documents. Each is a singleton keyed by kind.
const STAGE_DOCS = [
  { kind: "agents" as const, file: "agents", name: "AGENTS.md" },
  { kind: "review" as const, file: "review", name: "review.md" },
  { kind: "publish" as const, file: "publish", name: "publish.md" },
];

export async function registerStandardsRoutes(app: FastifyInstance, deps: { db: Db }) {
  app.get("/api/standards", async () => {
    const rows = await deps.db.select().from(standardsFiles).orderBy(asc(standardsFiles.name));
    const content = (kind: (typeof STAGE_DOCS)[number]["kind"]) =>
      rows.find((row) => row.kind === kind)?.content ?? "";
    return {
      agentsMd: content("agents"),
      reviewMd: content("review"),
      publishMd: content("publish"),
      skills: rows
        .filter((row) => row.kind === "skill")
        .map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          content: row.content,
          enabled: row.enabled,
          updatedAt: row.updatedAt,
        })),
    };
  });

  for (const doc of STAGE_DOCS) {
    app.put(`/api/standards/${doc.file}`, async (request, reply) => {
      const parsed = docBody.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid body" });

      const existing = await deps.db.query.standardsFiles.findFirst({ where: eq(standardsFiles.kind, doc.kind) });
      if (existing) {
        await deps.db
          .update(standardsFiles)
          .set({ content: parsed.data.content, updatedAt: new Date() })
          .where(eq(standardsFiles.id, existing.id));
      } else {
        await deps.db.insert(standardsFiles).values({ kind: doc.kind, name: doc.name, content: parsed.data.content });
      }
      return { ok: true };
    });
  }

  app.post("/api/standards/skills", async (request, reply) => {
    const parsed = skillBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid body" });

    const [row] = await deps.db
      .insert(standardsFiles)
      .values({
        kind: "skill",
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        content: parsed.data.content,
        enabled: parsed.data.enabled ?? true,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) return reply.code(409).send({ error: `A skill named "${parsed.data.name}" already exists` });
    return reply.code(201).send({ id: row.id });
  });

  app.put<{ Params: { id: string } }>("/api/standards/skills/:id", async (request, reply) => {
    const parsed = skillBody.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid body" });

    const [row] = await deps.db
      .update(standardsFiles)
      .set({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.content !== undefined ? { content: parsed.data.content } : {}),
        ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
        updatedAt: new Date(),
      })
      .where(eq(standardsFiles.id, request.params.id))
      .returning();
    if (!row) return reply.code(404).send({ error: "Skill not found" });
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/api/standards/skills/:id", async (request, reply) => {
    const [row] = await deps.db
      .delete(standardsFiles)
      .where(eq(standardsFiles.id, request.params.id))
      .returning();
    if (!row) return reply.code(404).send({ error: "Skill not found" });
    return { ok: true };
  });
}
