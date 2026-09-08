# XELOR Factory Edge

Provider-neutral boundary for OPC UA, MQTT, ROS 2 and certified vendor adapters. The
repository currently ships only `FactorySimulatorAdapter`; it never opens a controller
socket or claims a physical action completed.

The runtime accepts only the closed capability catalogue and strict per-capability parameter
schemas from `@ind-core/platform`, rejects invalid or expired requests, enforces an asset's
capability map, single-flights concurrent command keys and requires the local adapter to
return its own safety/readiness verdict. Emergency stops, guard bypasses, raw motion,
safety-PLC changes and unverified program uploads are not capabilities.

Replay protection is process-local only. It makes the standalone simulator deterministic;
it is not an exactly-once claim. A physical deployment still requires a durable command
journal plus mutually authenticated claim/ack transport before any controller adapter is
enabled.

```bash
pnpm --filter @ind-core/edge build
pnpm --filter @ind-core/edge start:simulator
```

A real deployment belongs inside the plant OT network/DMZ with mutual authentication,
offline buffering, signed events, certificate rotation and one certified adapter/version
combination per declared robot, PLC or AMR controller.
