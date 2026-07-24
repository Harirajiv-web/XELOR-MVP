/**
 * Side-effect barrel: importing this file registers every feature's eval spec into the
 * registry. The `eval` CLI imports this so all gates are discoverable. Each feature adds
 * its `registerEvalSpec(...)` here (general.master_dedup lands with the GENERAL brain).
 */
export {};
