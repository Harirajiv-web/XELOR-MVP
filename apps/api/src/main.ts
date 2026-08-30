import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { configureOnyxApp } from "./bootstrap.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  configureOnyxApp(app);
  // Railway and most container platforms provide PORT. API_PORT remains the
  // convenient local override used by the existing development setup.
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
  await app.listen(port);
  console.log(`ONYX API on :${port} (prefix /api/v1)`);
}

void bootstrap();
