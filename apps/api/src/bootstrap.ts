import type { INestApplication } from "@nestjs/common";
import { ErrorEnvelopeFilter } from "./common/error.filter.js";

/** Apply the HTTP contract shared by the container and Vercel entrypoints. */
export function configureOnyxApp(app: INestApplication): void {
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new ErrorEnvelopeFilter());
}
