import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express, { type Request, type Response } from "express";
import { AppModule } from "./app.module.js";
import { configureOnyxApp } from "./bootstrap.js";

/**
 * Vercel Functions entrypoint.
 *
 * Nest is initialized once per warm function instance and mounted on an Express
 * application. Local development and container deployments continue to use
 * `main.ts`; both entrypoints receive the same prefix and exception contract.
 */
const server = express();
let initialization: Promise<void> | undefined;

async function initialize(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    bufferLogs: false,
  });
  configureOnyxApp(app);
  await app.init();
}

async function ensureInitialized(): Promise<void> {
  initialization ??= initialize();
  try {
    await initialization;
  } catch (error) {
    // A transient boot failure must not poison every later invocation placed on
    // the same warm instance.
    initialization = undefined;
    throw error;
  }
}

export default async function handler(req: Request, res: Response): Promise<void> {
  await ensureInitialized();
  server(req, res);
}
