# Factory Connect and robotics

Factory Connect is an additive MVP extension. It does not replace or alter the existing Sales, Planning, Purchase, Inventory, Production, Quality, Maintenance, Accounts or Agent OS workflows.

## What is implemented

- Tenant-scoped gateways, industrial asset bindings, append-only asset-state and location events, material dwell intervals and machine-command evidence.
- New read views in Integration, Production and Planning for gateway health, robot cells, AMRs, location context and dwell exceptions.
- A `factory.flow-recovery` Agent OS mission. KILN reads stored factory evidence; MICA, SPAR, AXLE and RASP assess business consequences; HEXA checks the declared command boundary; and a production supervisor reviews the proposed simulator request. The mission does not command equipment or prove that local safety accepted anything.
- A closed command catalogue for named jobs, routes, quarantine and inspection requests. When the mission carries a valid typed command intent, the API requires a completed approved gate, matches the later request to the approved intent hash, checks stored state/policy/expiry and permits that approval to be consumed once. The current result is a **simulated policy evaluation**: no edge dispatch is attempted and no controller acknowledgement is recorded. Arbitrary motion and arbitrary program upload are not representable.
- An `apps/edge` adapter contract with expiry checks, an adapter safety interface and duplicate suppression held only in the running process. Its simulator contacts no physical equipment, and it is not wired to the Factory Connect API command path. Durable edge journalling, claim delivery and acknowledgement transport are not implemented.
- Catalogue/reserved connector definitions for OPC UA robotics, MQTT factory telemetry, ROS 2 AMRs, Cisco Spaces and Splunk OT. There is no live protocol client, subscription, vendor SDK or site adapter behind those entries in this MVP.

## Control boundary

XELOR is currently a coordination, stored-evidence and simulator-policy layer. A robot controller, PLC, safety PLC, interlock and emergency stop remain locally authoritative. A future production deployment would require a certified site adapter, mutual authentication, network segmentation, signed command envelopes, durable idempotency/replay protection, controller-side allow-lists, safety revalidation and an attributable claim/acknowledgement protocol. None of that physical transport is claimed by this MVP.

The ERP stores the operational event records submitted to its API and the result of its own checks; those rows are not cryptographic proof that a sensor or controller originated an event. In a production design, high-frequency telemetry would remain in the plant historian, broker or observability platform. Cisco Spaces could contribute physical location/density context and Splunk could contribute detection/analytics, but both are future integration targets rather than simulated or completed external connections.

## MVP demo data

The Trishul tenant contains one simulator gateway, robot cell `ROBOT-CELL-03`, AMR `AMR-07`, pallet `PALLET-204` and an exceeded dwell interval. Kaveri remains empty so tenant-isolation checks continue to prove that the extension does not leak cross-company evidence.

## Relevant code

- `packages/db/src/schema/factory-connect.ts`
- `packages/platform/src/factory-connect/contracts.ts`
- `apps/api/src/modules/integration/factory-connect.service.ts`
- `apps/edge/src/runtime.ts`
- `apps/web/src/modules/integration/screens/factory-connect.tsx`
- `apps/web/src/modules/production/screens/robot-cells.tsx`
- `apps/web/src/modules/planning/screens/factory-flow.tsx`
