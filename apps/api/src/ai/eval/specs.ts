/**
 * Side-effect barrel: importing this file registers every feature's eval spec into the
 * registry. The `eval` CLI imports this so all gates are discoverable.
 */
import "./specs/general-master-dedup.spec.js";
import "./specs/csp-ticket-triage.spec.js";
