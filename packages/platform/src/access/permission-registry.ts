/**
 * THE PERMISSION REGISTRY — the one place a permission is declared (§1.5, §5).
 *
 * Before this file the system had three registries that drifted apart independently:
 * the `@RequirePermission` strings the guard actually enforces (133), the
 * `permission_catalogue` rows the access console can describe (21), and the
 * `role_permission` grants that were seeded module by module (79). The consequence was
 * not theoretical — 59 of 87 read endpoints answered 403 to *every* user in the system,
 * including the administrator, because nobody held permissions the routes demanded. And
 * six permissions were granted to roles while no line of code ever checked them: access
 * the console displayed and the runtime did not honour, which is the worse direction to
 * drift in.
 *
 * Migration 0039 already stated the intent — "a permission nobody registered cannot be
 * granted, whatever it is spelt like" — but nothing enforced it. This file is that
 * registry, and three things now hold it to the system:
 *
 *   1. `PermissionKey` is a union of exactly these strings, so `@RequirePermission`
 *      cannot compile with a permission that is not declared here.
 *   2. The catalogue seed (migration 0045) is generated from this list, and a database
 *      trigger refuses a grant whose permission is not catalogued.
 *   3. `pnpm perm-check` fails CI when the routes and this list disagree in either
 *      direction — a demanded permission missing here, or a declared permission no route
 *      enforces (a grant that controls nothing).
 *
 * `docType` is the noun the permission governs; the ACTION is not stored, it is the
 * string's last segment (the database asserts exactly that, migration 0038). The 13
 * DOCUMENT_ACTIONS remain the recommended vocabulary — operational verbs like `run`,
 * `post`, `confirm` and `decide` are permitted where they say what they guard, per 0039.
 *
 * `privileged` marks the permissions an access review must look at every time: the ones
 * that move money, change who can do what, reveal personal data, or override a control.
 */

export interface PermissionSpec {
  /** `module.entity.action` — the exact string the guard compares. */
  readonly permission: string;
  /** The noun this governs; becomes `permission_catalogue.doc_type`. */
  readonly docType: string;
  /** What holding it lets a person do, in words an access reviewer can act on. */
  readonly description: string;
  /** Moves money, changes access, reveals PII, or overrides a control. */
  readonly privileged: boolean;
}

export const PERMISSION_REGISTRY = [
  // ---- GENERAL ------------------------------------------------------------------
  {
    permission: "general.company.read",
    docType: "company",
    description: "Read company, plant and branch masters.",
    privileged: false,
  },
  {
    permission: "general.company.create",
    docType: "company",
    description: "Create a company, plant or branch.",
    privileged: true,
  },

  // ---- ADMINISTRATION -----------------------------------------------------------
  {
    permission: "admin.access.read",
    docType: "role",
    description: "Read roles, grants, scopes and the access simulator.",
    privileged: true,
  },
  {
    permission: "admin.access.write",
    docType: "role",
    description: "Grant and revoke access, and change what a role may do.",
    privileged: true,
  },
  {
    permission: "admin.audit.read",
    docType: "audit_log",
    description: "Read the audit trail and verify its hash chain.",
    privileged: true,
  },
  {
    permission: "admin.audit.export",
    docType: "audit_log",
    description: "Export the Rule 11(g) auditor pack.",
    privileged: true,
  },
  {
    permission: "admin.incident.write",
    docType: "security_incident",
    description:
      "Record security incidents and drive the CERT-In / DPDP clocks.",
    privileged: true,
  },
  {
    permission: "admin.dsr.write",
    docType: "dsr_request",
    description:
      "Handle data-principal requests (access, correction, erasure).",
    privileged: true,
  },
  {
    permission: "admin.apikey.write",
    docType: "api_key",
    description: "Issue and revoke machine keys.",
    privileged: true,
  },
  {
    permission: "admin.settings.write",
    docType: "system_setting",
    description:
      "Change platform settings, feature flags, licence and backups.",
    privileged: true,
  },

  // ---- ENGINEERING --------------------------------------------------------------
  {
    permission: "engineering.item.read",
    docType: "item",
    description: "Read the item master.",
    privileged: false,
  },
  {
    permission: "engineering.item.create",
    docType: "item",
    description: "Create an item.",
    privileged: false,
  },
  {
    permission: "engineering.bom.read",
    docType: "bom",
    description: "Read bills of material.",
    privileged: false,
  },
  {
    permission: "engineering.bom.create",
    docType: "bom",
    description: "Create a bill of material.",
    privileged: false,
  },

  // ---- INVENTORY ----------------------------------------------------------------
  {
    permission: "inventory.stock.read",
    docType: "stock",
    description: "Read stock balances and the stock ledger.",
    privileged: false,
  },
  {
    permission: "inventory.stock.post",
    docType: "stock_entry",
    description: "Post a stock movement through the single write path.",
    privileged: false,
  },
  {
    permission: "inventory.warehouse.read",
    docType: "warehouse",
    description: "Read warehouses and storage locations.",
    privileged: false,
  },

  // ---- PURCHASE -----------------------------------------------------------------
  {
    permission: "purchase.vendor.read",
    docType: "vendor",
    description: "Read the vendor master.",
    privileged: false,
  },
  {
    permission: "purchase.vendor.create",
    docType: "vendor",
    description: "Create a vendor.",
    privileged: true,
  },
  {
    permission: "purchase.po.read",
    docType: "purchase_order",
    description: "Read purchase orders.",
    privileged: false,
  },
  {
    permission: "purchase.po.create",
    docType: "purchase_order",
    description: "Raise a purchase order.",
    privileged: false,
  },
  {
    permission: "purchase.po.submit",
    docType: "purchase_order",
    description: "Submit a purchase order into the approval workflow.",
    privileged: false,
  },
  {
    permission: "purchase.grn.read",
    docType: "goods_receipt",
    description: "Read goods receipts.",
    privileged: false,
  },
  {
    permission: "purchase.grn.create",
    docType: "goods_receipt",
    description: "Record what physically arrived, posting stock.",
    privileged: false,
  },

  // ---- PRODUCTION ---------------------------------------------------------------
  {
    permission: "production.order.read",
    docType: "production_order",
    description: "Read production orders.",
    privileged: false,
  },
  {
    permission: "production.order.create",
    docType: "production_order",
    description: "Create a production order.",
    privileged: false,
  },
  {
    permission: "production.order.execute",
    docType: "production_order",
    description:
      "Issue components to, and receive output from, a production order.",
    privileged: false,
  },

  // ---- QUALITY / INSPECTION -----------------------------------------------------
  {
    permission: "quality.inspection.read",
    docType: "inspection",
    description: "Read inspections and their results.",
    privileged: false,
  },
  {
    permission: "quality.inspection.execute",
    docType: "inspection",
    description: "Open an inspection and record measured results.",
    privileged: false,
  },
  {
    permission: "quality.disposition.decide",
    docType: "inspection",
    description:
      "Decide the disposition of rejected material (accept, rework, scrap, return).",
    privileged: true,
  },

  // ---- SALES / SMBD -------------------------------------------------------------
  {
    permission: "sales.customer.read",
    docType: "customer",
    description: "Read the customer master.",
    privileged: false,
  },
  {
    permission: "sales.customer.create",
    docType: "customer",
    description: "Create a customer.",
    privileged: false,
  },
  {
    permission: "sales.order.read",
    docType: "sales_order",
    description: "Read sales orders.",
    privileged: false,
  },
  {
    permission: "sales.order.create",
    docType: "sales_order",
    description: "Create a sales order.",
    privileged: false,
  },
  {
    permission: "sales.order.confirm",
    docType: "sales_order",
    description: "Confirm a sales order, passing the credit gate.",
    privileged: true,
  },
  {
    permission: "sales.dispatch.execute",
    docType: "sales_order",
    description:
      "Dispatch against a sales order, reducing stock and raising the invoice.",
    privileged: true,
  },

  // ---- ACCOUNTS -----------------------------------------------------------------
  {
    permission: "accounts.ledger.read",
    docType: "voucher",
    description: "Read the general ledger, vouchers and the AR subledger.",
    privileged: true,
  },
  {
    permission: "accounts.journal.post",
    docType: "journal",
    description: "Post a journal entry to the append-only ledger.",
    privileged: true,
  },
  {
    permission: "accounts.voucher.reverse",
    docType: "voucher",
    description:
      "Reverse a posted voucher (a new contra entry; nothing is erased).",
    privileged: true,
  },
  {
    permission: "accounts.receipt.record",
    docType: "receipt",
    description: "Record a customer receipt and allocate it.",
    privileged: true,
  },

  // ---- PLANNING / MRP -----------------------------------------------------------
  {
    permission: "planning.policy.read",
    docType: "item_planning_policy",
    description: "Read item planning policies, lot rules and safety stock.",
    privileged: false,
  },
  {
    permission: "planning.policy.manage",
    docType: "item_planning_policy",
    description: "Change planning policies and recompute low-level codes.",
    privileged: false,
  },
  {
    permission: "planning.demand.read",
    docType: "demand",
    description: "Read the demand grid and forecast consumption.",
    privileged: false,
  },
  {
    permission: "planning.demand.manage",
    docType: "demand",
    description: "Set and revise the forecast.",
    privileged: false,
  },
  {
    permission: "planning.mps.read",
    docType: "mps",
    description: "Read the master production schedule.",
    privileged: false,
  },
  {
    permission: "planning.mps.manage",
    docType: "mps",
    description: "Set the master production schedule.",
    privileged: false,
  },
  {
    permission: "planning.mrp.read",
    docType: "mrp_run",
    description: "Read MRP runs, planned orders and pegging.",
    privileged: false,
  },
  {
    permission: "planning.mrp.run",
    docType: "mrp_run",
    description: "Run material requirements planning.",
    privileged: false,
  },
  {
    permission: "planning.order.manage",
    docType: "planned_order",
    description: "Firm and reschedule planned orders.",
    privileged: false,
  },
  {
    permission: "planning.order.convert",
    docType: "planned_order",
    description:
      "Convert a planned order into a real purchase requisition or production order.",
    privileged: true,
  },
  {
    permission: "planning.exception.action",
    docType: "planning_exception",
    description: "Accept, defer or dismiss planning exceptions.",
    privileged: false,
  },
  {
    permission: "planning.capacity.read",
    docType: "capacity_load",
    description: "Read the capacity load profile against a plan.",
    privileged: false,
  },
  {
    permission: "planning.schedule.read",
    docType: "dispatch_schedule",
    description: "Read the shop-floor dispatch schedule.",
    privileged: false,
  },
  {
    permission: "planning.schedule.manage",
    docType: "dispatch_schedule",
    description: "Propose a dispatch schedule.",
    privileged: false,
  },
  {
    permission: "planning.schedule.publish",
    docType: "dispatch_schedule",
    description: "Publish a dispatch schedule to the shop floor.",
    privileged: true,
  },

  // ---- HRM & ATTENDANCE ---------------------------------------------------------
  {
    permission: "hrm.employee.read",
    docType: "employee",
    description: "Read employee records (personal identifiers stay masked).",
    privileged: false,
  },
  {
    permission: "hrm.employee.write",
    docType: "employee",
    description: "Create and amend employee records.",
    privileged: true,
  },
  {
    permission: "hrm.employee.pii_reveal",
    docType: "employee",
    description:
      "Reveal a masked personal identifier. Every reveal is logged with a reason.",
    privileged: true,
  },
  {
    permission: "hrm.roster.write",
    docType: "roster",
    description: "Assign shift rosters.",
    privileged: false,
  },
  {
    permission: "hrm.attendance.read",
    docType: "attendance",
    description: "Read the attendance muster.",
    privileged: false,
  },
  {
    permission: "hrm.attendance.ingest",
    docType: "attendance",
    description: "Ingest punches from biometric devices or a file.",
    privileged: false,
  },
  {
    permission: "hrm.attendance.process",
    docType: "attendance",
    description: "Run the deterministic attendance computation for a day.",
    privileged: false,
  },
  {
    permission: "hrm.attendance.regularise",
    docType: "attendance_regularisation",
    description: "Raise a regularisation for a missed or wrong punch.",
    privileged: false,
  },
  {
    permission: "hrm.attendance.approve",
    docType: "attendance_regularisation",
    description: "Approve or reject an attendance regularisation.",
    privileged: true,
  },
  {
    permission: "hrm.attendance.lock",
    docType: "attendance",
    description: "Lock an attendance period so payroll can rely on it.",
    privileged: true,
  },
  {
    permission: "hrm.leave.read",
    docType: "leave_balance",
    description: "Read leave balances.",
    privileged: false,
  },
  {
    permission: "hrm.leave.apply",
    docType: "leave_application",
    description: "Apply for leave.",
    privileged: false,
  },
  {
    permission: "hrm.leave.approve",
    docType: "leave_application",
    description: "Approve or reject a leave application.",
    privileged: false,
  },
  {
    permission: "hrm.leave.accrue",
    docType: "leave_balance",
    description: "Run the leave accrual for a period.",
    privileged: true,
  },
  {
    permission: "hrm.payroll.read",
    docType: "payroll_run",
    description: "Read payroll runs, payslips and variance.",
    privileged: true,
  },
  {
    permission: "hrm.payroll.prepare",
    docType: "payroll_run",
    description: "Prepare and recompute a payroll run.",
    privileged: true,
  },
  {
    permission: "hrm.payroll.approve",
    docType: "payroll_run",
    description: "Approve and release a payroll run.",
    privileged: true,
  },
  {
    permission: "hrm.payroll.post",
    docType: "payroll_run",
    description: "Post the payroll journal to the ledger.",
    privileged: true,
  },
  {
    permission: "hrm.statutory.read",
    docType: "statutory_config",
    description: "Read the effective-dated statutory rate configuration.",
    privileged: false,
  },

  // ---- MAINTENANCE / CMMS -------------------------------------------------------
  {
    permission: "mnt.asset.read",
    docType: "asset",
    description: "Read the asset register.",
    privileged: false,
  },
  {
    permission: "mnt.asset.write",
    docType: "asset",
    description: "Create and amend assets.",
    privileged: false,
  },
  {
    permission: "mnt.meter.write",
    docType: "asset_meter",
    description: "Record a meter reading against an asset.",
    privileged: false,
  },
  {
    permission: "mnt.request.read",
    docType: "maintenance_request",
    description: "Read the maintenance request queue.",
    privileged: false,
  },
  {
    permission: "mnt.request.create",
    docType: "maintenance_request",
    description: "Raise a maintenance request.",
    privileged: false,
  },
  {
    permission: "mnt.request.triage",
    docType: "maintenance_request",
    description: "Acknowledge and triage maintenance requests.",
    privileged: false,
  },
  {
    permission: "mnt.mwo.read",
    docType: "maintenance_work_order",
    description: "Read maintenance work orders and the board.",
    privileged: false,
  },
  {
    permission: "mnt.mwo.write",
    docType: "maintenance_work_order",
    description: "Create, assign and amend maintenance work orders.",
    privileged: false,
  },
  {
    permission: "mnt.mwo.execute",
    docType: "maintenance_work_order",
    description: "Start, pause and record work on a maintenance work order.",
    privileged: false,
  },
  {
    permission: "mnt.mwo.prioritise",
    docType: "maintenance_work_order",
    description: "Change the priority of a maintenance work order.",
    privileged: false,
  },
  {
    permission: "mnt.mwo.close",
    docType: "maintenance_work_order",
    description: "Close a maintenance work order.",
    privileged: true,
  },
  {
    permission: "mnt.labour.write",
    docType: "maintenance_labour",
    description: "Book labour time against a maintenance work order.",
    privileged: false,
  },
  {
    permission: "mnt.spare.read",
    docType: "maintenance_spare",
    description: "Plan and read spares on a work order.",
    privileged: false,
  },
  {
    permission: "mnt.spare.issue",
    docType: "maintenance_spare",
    description: "Issue a spare from stores to a work order.",
    privileged: false,
  },
  {
    permission: "mnt.downtime.read",
    docType: "downtime",
    description: "Read the downtime log.",
    privileged: false,
  },
  {
    permission: "mnt.downtime.adjust",
    docType: "downtime",
    description:
      "Start, stop and adjust downtime — the clock availability is computed from.",
    privileged: true,
  },
  {
    permission: "mnt.pm.read",
    docType: "pm_schedule",
    description: "Read preventive maintenance schedules and forecasts.",
    privileged: false,
  },
  {
    permission: "mnt.pm.write",
    docType: "pm_schedule",
    description: "Define and generate preventive maintenance schedules.",
    privileged: false,
  },
  {
    permission: "mnt.external.request",
    docType: "maintenance_work_order",
    description: "Send maintenance work to an external contractor.",
    privileged: true,
  },
  {
    permission: "mnt.report.read",
    docType: "maintenance_report",
    description: "Read maintenance KPIs and Pareto reports.",
    privileged: false,
  },
  {
    permission: "mnt.statutory.read",
    docType: "maintenance_report",
    description: "Read the statutory equipment register.",
    privileged: false,
  },

  // ---- CSP (customer service portal) --------------------------------------------
  {
    permission: "csp.ticket.read",
    docType: "ticket",
    description: "Read the manufactured-product case queue.",
    privileged: false,
  },
  {
    permission: "csp.ticket.create",
    docType: "ticket",
    description: "Open a manufactured-product support case.",
    privileged: false,
  },
  {
    permission: "csp.ticket.update",
    docType: "ticket",
    description: "Work a ticket: transition, assign, reply, resolve.",
    privileged: false,
  },
  {
    permission: "csp.complaint.create",
    docType: "complaint",
    description: "Raise a formal complaint from a ticket.",
    privileged: false,
  },
  {
    permission: "csp.complaint.update",
    docType: "complaint",
    description: "Investigate and close a complaint.",
    privileged: false,
  },
  {
    permission: "csp.contract.update",
    docType: "service_contract",
    description: "Maintain AMC and warranty contracts, and scan renewals.",
    privileged: true,
  },
  {
    permission: "csp.dashboard.read",
    docType: "service_dashboard",
    description: "Read service dashboards, SLA health and CSAT.",
    privileged: false,
  },
  {
    permission: "csp.portal_user.manage",
    docType: "portal_user",
    description: "Invite and disable customer portal users.",
    privileged: true,
  },

  // ---- EXPENDITURE --------------------------------------------------------------
  {
    permission: "expenditure.budget.read",
    docType: "budget",
    description: "Read budgets, consumption and the budget check.",
    privileged: false,
  },
  {
    permission: "expenditure.budget.manage",
    docType: "budget",
    description: "Set and revise budgets.",
    privileged: true,
  },
  {
    permission: "expenditure.claim.read",
    docType: "expense_claim",
    description: "Read expense claims.",
    privileged: false,
  },
  {
    permission: "expenditure.claim.create",
    docType: "expense_claim",
    description: "Submit an expense claim and its receipts.",
    privileged: false,
  },
  {
    permission: "expenditure.claim.approve",
    docType: "expense_claim",
    description: "Approve or reject an expense claim.",
    privileged: true,
  },
  {
    permission: "expenditure.indirect.create",
    docType: "purchase_expense",
    description: "Record an indirect (non-PO) expense invoice.",
    privileged: false,
  },
  {
    permission: "expenditure.indirect.approve",
    docType: "purchase_expense",
    description: "Approve an indirect expense invoice for payment.",
    privileged: true,
  },
  {
    permission: "expenditure.posting.manage",
    docType: "posting_instruction",
    description:
      "Acknowledge and retry posting instructions handed to Accounts.",
    privileged: true,
  },

  // ---- INTEGRATION --------------------------------------------------------------
  {
    permission: "integration.connector.read",
    docType: "connector",
    description: "Read available connectors and configured connections.",
    privileged: false,
  },
  {
    permission: "integration.flow.read",
    docType: "integration_flow",
    description: "Read integration flows and their health.",
    privileged: false,
  },
  {
    permission: "integration.flow.manage",
    docType: "integration_flow",
    description:
      "Configure flows, mappings and the connection circuit breaker.",
    privileged: true,
  },
  {
    permission: "integration.message.read",
    docType: "integration_message",
    description: "Trace a message end to end across systems.",
    privileged: false,
  },
  {
    permission: "integration.message.send",
    docType: "integration_message",
    description: "Dispatch a message to an external system.",
    privileged: true,
  },
  {
    permission: "integration.dlq.replay",
    docType: "dead_letter",
    description: "Triage and replay dead-lettered messages.",
    privileged: true,
  },
  {
    permission: "integration.statutory.read",
    docType: "statutory_filing",
    description:
      "Read e-invoice and e-way-bill status and the reporting window watch.",
    privileged: false,
  },
  {
    permission: "integration.statutory.submit",
    docType: "statutory_filing",
    description: "Submit an e-invoice or e-way bill to the government portal.",
    privileged: true,
  },
  {
    permission: "integration.webhook.manage",
    docType: "webhook_subscription",
    description: "Manage webhook subscriptions and rotate signing secrets.",
    privileged: true,
  },

  // ---- FACTORY CONNECT ---------------------------------------------------------
  {
    permission: "integration.factory-connect.read",
    docType: "integration_factory_connect_view",
    description:
      "Open the Integration Factory Connect view for governed connector evidence.",
    privileged: false,
  },
  {
    permission: "production.factory-connect.read",
    docType: "production_factory_connect_view",
    description:
      "Open the Production robot-cell view backed by Factory Connect evidence.",
    privileged: false,
  },
  {
    permission: "planning.factory-flow.read",
    docType: "planning_factory_flow_view",
    description:
      "Open the Planning factory-flow view backed by dwell and asset evidence.",
    privileged: false,
  },
  {
    permission: "factory.connect.read",
    docType: "industrial_asset_binding",
    description:
      "Read factory gateways, robot cells, dwell intervals and command evidence.",
    privileged: false,
  },
  {
    permission: "factory.telemetry.ingest",
    docType: "asset_state_event",
    description:
      "Ingest idempotent operational events through reserved factory edge gateway authority.",
    privileged: true,
  },
  {
    permission: "factory.command.execute",
    docType: "machine_command",
    description:
      "Request an approval-bound allowlisted simulator command evaluation; physical edge execution is disabled.",
    privileged: true,
  },

  // ---- COPILOT ------------------------------------------------------------------
  // Holding this lets a person ASK. It does not let them see anything: every question in
  // the catalogue declares its own module permission on top, so the copilot can only
  // retrieve what the asker could already open a screen for. Two gates, deliberately —
  // revoking `copilot.ask` turns the assistant off for someone without touching what they
  // can otherwise do, and granting it widens nothing.
  {
    permission: "copilot.question.ask",
    docType: "copilot_question",
    description:
      "Ask the read-only copilot a question. Answers are still limited to what the asker's other permissions allow.",
    privileged: false,
  },
  {
    permission: "copilot.log.read",
    docType: "copilot_question",
    description:
      "Read the log of questions asked of the copilot, and what each answer was drawn from.",
    privileged: true,
  },

  // ---- AI: the shared spine's governance switch ---------------------------------
  {
    permission: "ai.governance.manage",
    docType: "ai_governance",
    description:
      "Operate the shared AI kill switch, release, training opt-out and budget.",
    privileged: true,
  },

  // ---- AI OPERATIONS ------------------------------------------------------------
  {
    permission: "aiops.registry.read",
    docType: "ai_registry",
    description:
      "Read the AI feature registry, providers, models and rollout stages.",
    privileged: false,
  },
  {
    permission: "aiops.rollout.manage",
    docType: "ai_feature_rollout",
    description: "Move a feature between rollout stages.",
    privileged: true,
  },
  {
    permission: "aiops.route.manage",
    docType: "ai_route_policy",
    description: "Define and activate routing chains.",
    privileged: true,
  },
  {
    permission: "aiops.prompt.read",
    docType: "ai_prompt_version",
    description: "Read prompt versions and diffs.",
    privileged: false,
  },
  {
    permission: "aiops.prompt.author",
    docType: "ai_prompt_version",
    description: "Author a new prompt version.",
    privileged: false,
  },
  {
    permission: "aiops.prompt.approve",
    docType: "ai_prompt_version",
    description:
      "Promote a prompt to production, or roll one back. Never the author's own.",
    privileged: true,
  },
  {
    permission: "aiops.eval.run",
    docType: "ai_eval_run",
    description: "Record an evaluation run against a golden set.",
    privileged: false,
  },
  {
    permission: "aiops.guardrail.run",
    docType: "ai_guardrail_event",
    description: "Run the pre-call and post-call guardrails.",
    privileged: false,
  },
  {
    permission: "aiops.hitl.review",
    docType: "ai_hitl_item",
    description:
      "Review the human-in-the-loop queue and accept or reject drafts.",
    privileged: true,
  },
  {
    permission: "aiops.cost.read",
    docType: "ai_call_metric",
    description: "Read AI cost, metering and budget status.",
    privileged: false,
  },
  {
    permission: "aiops.killswitch.operate",
    docType: "ai_kill_switch",
    description: "Engage, release and probe the AI kill switch.",
    privileged: true,
  },
  {
    permission: "aiops.audit.read",
    docType: "ai_action_log",
    description: "Explain a single AI call and export the AI evidence pack.",
    privileged: true,
  },

  // ---- AGENT OS -----------------------------------------------------------------
  {
    permission: "agentos.run.read",
    docType: "agent_run",
    description:
      "Read Agent OS graphs, agents, capabilities, runs and their evidence.",
    privileged: false,
  },
  {
    permission: "agentos.run.operate",
    docType: "agent_run",
    description: "Start, resume and cancel bounded Agent OS missions.",
    privileged: true,
  },
  {
    permission: "agentos.approval.decide",
    docType: "agent_approval",
    description:
      "Approve or reject a consequential action proposed by an agent mission.",
    privileged: true,
  },

  // ---- MANAGED SERVICES ---------------------------------------------------------
  {
    permission: "managed_services.overview.read",
    docType: "managed_service",
    description:
      "Read the managed-service command centre, service catalogue, incidents, changes, reviews and responsibility map.",
    privileged: false,
  },

  // ---- PRIVATE PLATFORM ASSURANCE ---------------------------------------------
  {
    permission: "platform_health.overview.read",
    docType: "platform_health_run",
    description: "Read private ACHILES platform-health status and check history.",
    privileged: false,
  },
  {
    permission: "platform_health.run.execute",
    docType: "platform_health_run",
    description: "Run a private, read-only ACHILES platform-health check.",
    privileged: true,
  },
] as const satisfies readonly PermissionSpec[];

/**
 * Every permission this system enforces. `@RequirePermission` accepts nothing else, so a
 * typo is a compile error rather than a route only the 403 page can reach.
 */
export type PermissionKey = (typeof PERMISSION_REGISTRY)[number]["permission"];

const BY_KEY: ReadonlyMap<string, PermissionSpec> = new Map(
  PERMISSION_REGISTRY.map((p) => [p.permission, p]),
);

export function permissionSpec(permission: string): PermissionSpec | undefined {
  return BY_KEY.get(permission);
}

export function isRegisteredPermission(
  permission: string,
): permission is PermissionKey {
  return BY_KEY.has(permission);
}

/** The action is the string's last segment — the database asserts exactly this (0038). */
export function permissionAction(permission: string): string {
  const parts = permission.split(".");
  return parts[parts.length - 1] ?? "";
}

/** The permissions an access review must look at every time. */
export function privilegedPermissions(): readonly PermissionSpec[] {
  return PERMISSION_REGISTRY.filter((p) => p.privileged);
}
