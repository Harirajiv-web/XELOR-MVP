import { EdgeRuntime, FactorySimulatorAdapter } from "./runtime.js";

const mode = process.env.XELOR_EDGE_MODE ?? "simulator";
if (mode !== "simulator") {
  throw new Error(
    "Only the simulator adapter ships in this repository. Install and certify a plant-specific adapter before selecting another edge mode.",
  );
}

const runtime = new EdgeRuntime(new FactorySimulatorAdapter());
const states = await runtime.readState();
process.stdout.write(
  `${JSON.stringify({ mode, connectedToPhysicalController: false, states }, null, 2)}\n`,
);
