/**
 * DI tokens for the shared AI spine. Modules inject the ROUTER (never a concrete
 * provider), exactly as they inject WORKFLOW_EXECUTOR — so the model backend or the
 * governance implementation can be swapped without touching a business module.
 */
export const AI_ROUTER = Symbol("AI_ROUTER");
export const AI_PROVIDER = Symbol("AI_PROVIDER");
export const AI_GOVERNANCE = Symbol("AI_GOVERNANCE");
