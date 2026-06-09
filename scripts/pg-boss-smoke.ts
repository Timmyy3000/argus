import { createBoss } from "../src/queue/boss";

const queueName = `argus.pg-boss.smoke.${Date.now()}`;
const boss = createBoss();

await boss.start();
try {
  await boss.createQueue(queueName);
  const id = await boss.send(queueName, { ok: true }, { expireInSeconds: 30 });
  if (!id) {
    throw new Error("pg-boss did not return a job id");
  }

  const jobs = await boss.fetch(queueName, { batchSize: 1 });
  if (!jobs?.[0]) {
    throw new Error("pg-boss smoke job was not fetchable");
  }

  const fetched = jobs[0];
  const fetchedId = "id" in fetched ? fetched.id : undefined;
  if (!fetchedId) {
    throw new Error(`pg-boss smoke job had unexpected shape: ${JSON.stringify(fetched)}`);
  }

  await boss.complete(queueName, fetchedId);
  console.log(`pg-boss smoke passed: ${id}`);
} finally {
  await boss.stop();
}
