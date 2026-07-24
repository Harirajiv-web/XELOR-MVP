// @ind-core/platform — the bootstrap primitives every module inherits.
// These make the DECISIONS-V2 §5 conventions executable rather than aspirational.
export * from "./ids/uuidv7.js";
export * from "./errors/error-envelope.js";
export * from "./events/event-name.js";
export * from "./events/outbox.js";
export * from "./tenancy/tenant-context.js";
export * from "./audit/hash-chain.js";
export * from "./api/pagination.js";
export * from "./ai/index.js";
export * from "./masterdata/dedup.js";
