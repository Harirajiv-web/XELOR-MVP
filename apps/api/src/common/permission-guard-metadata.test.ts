import { strict as assert } from "node:assert";
import test from "node:test";
import "reflect-metadata";
import { PERMISSION_KEY, RequirePermission } from "./permission.guard.js";

/**
 * A ROUTE THAT NEEDS TWO PERMISSIONS MUST ENFORCE BOTH.
 *
 * This exists because the obvious way to write that is wrong and fails silently. Stacking
 * decorators —
 *
 *     @RequirePermission("sales.order.create")
 *     @RequirePermission("agentos.run.operate")
 *
 * — reads as "both", and is not: `SetMetadata` writes ONE metadata key, so the second
 * decorator overwrites the first and the route enforces whichever one happened to win. The
 * route works, every test passes, and the permission nobody checked is precisely the one
 * that was supposed to stop somebody. `POST /fulfilment/orders` writes a sales order AND
 * starts an agent mission, so it is exactly the shape that gets this wrong.
 *
 * The tests below pin the two halves that make the variadic form safe: the metadata is an
 * array of everything declared, and the guard's own normalisation still guards a route
 * whose metadata was written in the older single-string shape.
 */

/** Reads the metadata exactly as the guard's reflector does. */
function declaredOn(target: object, propertyKey: string): unknown {
  return Reflect.getMetadata(PERMISSION_KEY, (target as Record<string, { value?: unknown }>)[propertyKey] as object);
}

test("one permission is recorded as a single-entry list, not a bare string", () => {
  class Routes {
    @RequirePermission("sales.order.read")
    read(): void {}
  }
  assert.deepEqual(declaredOn(Routes.prototype, "read"), ["sales.order.read"]);
});

test("two permissions are BOTH recorded — the failure this file exists for", () => {
  class Routes {
    @RequirePermission("sales.order.create", "agentos.run.operate")
    createAndRun(): void {}
  }
  const declared = declaredOn(Routes.prototype, "createAndRun") as string[];
  assert.deepEqual(declared, ["sales.order.create", "agentos.run.operate"]);
  assert.equal(declared.length, 2, "a route needing two permissions must not silently keep one");
});

test("stacking the decorator still only keeps one — which is why the variadic form exists", () => {
  // Not an endorsement: a demonstration, so the next person who reaches for the stacked
  // form finds out here rather than in production. If a future NestJS makes stacking
  // additive this test fails, and the comment above should be revisited rather than the
  // assertion loosened.
  class Routes {
    @RequirePermission("sales.order.create")
    @RequirePermission("agentos.run.operate")
    stacked(): void {}
  }
  const declared = declaredOn(Routes.prototype, "stacked") as string[];
  assert.equal(declared.length, 1, "stacking is NOT additive — use RequirePermission(a, b)");
});

test("the guard's normalisation accepts the older bare-string metadata shape", () => {
  // Mirrors the line in `canActivate`. A stale compiled route carrying the pre-variadic
  // shape must stay GUARDED rather than fall through the `length === 0` unguarded branch.
  const normalise = (declared: string | string[] | undefined): string[] =>
    declared === undefined ? [] : Array.isArray(declared) ? declared : [declared];

  assert.deepEqual(normalise("sales.order.read"), ["sales.order.read"]);
  assert.deepEqual(normalise(["a", "b"]), ["a", "b"]);
  assert.deepEqual(normalise(undefined), [], "no declaration is the only unguarded case");
});
