import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadConfig } from "../config";
import type { Db } from "../db/client";
import { getGates, setGates } from "../settings/settings";

const gatesBody = z.object({
  gates: z.object({
    triage: z.boolean().optional(),
    codex: z.boolean().optional(),
    llmReview: z.boolean().optional(),
    gitPush: z.boolean().optional(),
  }),
});

export async function registerSettingsRoutes(app: FastifyInstance, deps: { db: Db }) {
  app.get("/api/settings", async () => ({ gates: await getGates(deps.db, loadConfig()) }));

  app.put("/api/settings", async (request, reply) => {
    const parsed = gatesBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    await setGates(deps.db, parsed.data.gates);
    return { gates: await getGates(deps.db, loadConfig()) };
  });
}
