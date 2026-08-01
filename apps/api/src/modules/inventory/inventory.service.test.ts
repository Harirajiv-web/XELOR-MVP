import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "@ind-core/platform";
import { allocateFifoBatches } from "./inventory.service.js";

test("an unnamed issue consumes the oldest batch first", () => {
  assert.deepEqual(
    allocateFifoBatches(
      [
        { batch: "HEAT-OLD", qty: 12 },
        { batch: "HEAT-NEW", qty: 20 },
      ],
      10,
    ),
    [{ batch: "HEAT-OLD", qty: 10 }],
  );
});

test("an unnamed issue records an explicit split across batches", () => {
  assert.deepEqual(
    allocateFifoBatches(
      [
        { batch: "RM-316L-2407", qty: 8.125 },
        { batch: "RM-316L-2411", qty: 20 },
      ],
      10.5,
    ),
    [
      { batch: "RM-316L-2407", qty: 8.125 },
      { batch: "RM-316L-2411", qty: 2.375 },
    ],
  );
});

test("zero balances are ignored during allocation", () => {
  assert.deepEqual(
    allocateFifoBatches(
      [
        { batch: "EMPTY", qty: 0 },
        { batch: "LIVE", qty: 5 },
      ],
      2,
    ),
    [{ batch: "LIVE", qty: 2 }],
  );
});

test("allocation fails before posting when total batch stock is insufficient", () => {
  assert.throws(
    () => allocateFifoBatches([{ batch: "ONLY", qty: 2 }], 3),
    (error: unknown) => error instanceof AppError && error.code === "INSUFFICIENT_STOCK" && error.httpStatus === 409,
  );
});
