import type { FastifyInstance } from "fastify";
import type PgBoss from "pg-boss";
import type { Db } from "../db/client";
import { getGitHubAppCredentials } from "../github/credentials";
import { handleGitHubWebhook, verifyWebhookSignature } from "../github/webhook";

export async function registerGitHubRoutes(app: FastifyInstance, deps: { db: Db; boss?: PgBoss }) {
  app.post("/webhooks/github", async (request, reply) => {
    const credentials = await getGitHubAppCredentials(deps.db);
    if (!credentials) {
      return reply.code(500).send({ error: "GitHub App is not configured" });
    }

    const deliveryId = headerValue(request.headers["x-github-delivery"]);
    const eventName = headerValue(request.headers["x-github-event"]);
    const signature = headerValue(request.headers["x-hub-signature-256"]);

    if (!deliveryId || !eventName || !signature) {
      return reply.code(400).send({ error: "Missing GitHub webhook headers" });
    }

    const rawBody = request.rawBody;
    if (!rawBody) {
      return reply.code(400).send({ error: "Missing raw request body" });
    }

    const valid = await verifyWebhookSignature({
      secret: credentials.webhookSecret,
      body: rawBody.toString("utf8"),
      signature,
    });

    if (!valid) {
      return reply.code(401).send({ error: "Invalid GitHub webhook signature" });
    }

    const webhookInput: Parameters<typeof handleGitHubWebhook>[0] = {
      db: deps.db,
      deliveryId,
      eventName,
      payload: request.body,
    };
    if (deps.boss) webhookInput.boss = deps.boss;

    const result = await handleGitHubWebhook(webhookInput);

    return reply.code(result.status === "rejected" ? 202 : 200).send(result);
  });
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
