// Entry customizado do Worker (receita OpenNext "custom worker"): reexporta o
// fetch gerado pelo OpenNext e adiciona o handler `scheduled` dos Cron
// Triggers (wrangler.jsonc → triggers.crons). O cron NÃO contém lógica: monta
// uma Request interna autenticada por CRON_SECRET e delega à rota Next
// /api/cron/gcal-pull — a lógica vive no app, testável como qualquer rota.

import handler from "./.open-next/worker.js";

interface EnvCron {
  CRON_SECRET?: string;
}

export default {
  fetch: handler.fetch,

  async scheduled(
    _controller: ScheduledController,
    env: EnvCron,
    ctx: ExecutionContext,
  ): Promise<void> {
    const req = new Request("https://cron.internal/api/cron/gcal-pull", {
      method: "POST",
      headers: { authorization: `Bearer ${env.CRON_SECRET ?? ""}` },
    });
    // waitUntil: o runtime mantém a execução até o sync terminar
    ctx.waitUntil(
      (handler.fetch as (r: Request, e: unknown, c: ExecutionContext) => Promise<Response>)(
        req,
        env,
        ctx,
      ),
    );
  },
} satisfies ExportedHandler<EnvCron>;

// Duráveis/cache do OpenNext continuam expostos (exigência do runtime)
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
