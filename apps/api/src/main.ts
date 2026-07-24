import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { ErrorEnvelopeFilter } from "./common/error.filter.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  // All modules serve under /api/v1 (§5.3 OpenAPI-per-module convention).
  app.setGlobalPrefix("api/v1");
  // Every error leaves as the ONE canonical envelope (§5.3).
  app.useGlobalFilters(new ErrorEnvelopeFilter());
  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
  console.log(`IND-CORE API on :${port} (prefix /api/v1)`);
}

void bootstrap();
