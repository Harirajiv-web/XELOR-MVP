import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ErrorEnvelopeFilter } from "./common/error.filter.js";

/** Apply the HTTP contract shared by the container and Vercel entrypoints. */
export function configureXelorApp(app: INestApplication): void {
  // Normalized connector imports allow 1 MB of text plus the enclosing JSON envelope.
  // Both supported entrypoints use Express; register before Nest's default 100 kB parser.
  (app as NestExpressApplication).useBodyParser("json", { limit: "2mb" });
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new ErrorEnvelopeFilter());
}
