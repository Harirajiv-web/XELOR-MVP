const TITLE_REPLACEMENTS: Readonly<Record<string, string>> = {
  "MRP run": "Material plan",
  "Planning exceptions": "Planning issues",
  "Planning policies": "Planning rules",
  "Bill of material": "Product materials",
  "Customer satisfaction": "Customer feedback",
  "Reliability KPIs": "Maintenance performance",
  "Statutory placement": "Job details",
  "Statutory rates": "Workplace rates",
  "Segregation of duties": "Conflicting access",
  "Security posture": "Security overview",
  "Cost & budget": "AI costs",
  Evaluations: "AI checks",
  "Feature registry": "AI features",
  Connectors: "AI connections",
  "Dead letters": "Failed messages",
};

export function plainTitle(title: string): string {
  return TITLE_REPLACEMENTS[title] ?? title;
}

export function pageSummary(title: string): string {
  const shown = plainTitle(title);
  if (/^new /i.test(shown)) return `Add ${shown.slice(4).toLowerCase()}.`;
  if (/^(ask|why)\b/i.test(shown)) return shown;
  return `View ${shown.toLowerCase()} and the latest information.`;
}

const DEPARTMENT_NAMES: Readonly<Record<string, string>> = {
  ONYX: "Assistant & Automation",
  HEXA: "Company Setup",
  AXLE: "Products & Planning",
  SPAR: "Purchasing & Stock",
  KILN: "Factory Operations",
  MICA: "Sales & Product Care",
  RASP: "People & Accounts",
  RELAY: "Managed Services",
  ACHILES: "Private Platform Health",
};

export function plainDepartmentName(code: string, fallback: string): string {
  return DEPARTMENT_NAMES[code] ?? fallback;
}

const DEPARTMENT_SUMMARIES: Readonly<Record<string, string>> = {
  ONYX: "Helps you find answers and coordinate work across the business.",
  HEXA: "Keeps company settings, user access and connections organised.",
  AXLE: "Manages product designs and plans what needs to be made.",
  SPAR: "Manages suppliers, purchases and available stock.",
  KILN: "Tracks production, quality, equipment and daily factory work.",
  MICA: "Manages customers, sales, deliveries, product warranty and after-sales care.",
  RASP: "Manages employees, spending and accounts.",
  RELAY: "Coordinates the service around ONYX, including incidents, changes and customer updates.",
  ACHILES: "Privately checks whether ONYX is working and records the evidence for authorised internal operators.",
};

export function plainDepartmentSummary(code: string, fallback: string): string {
  return DEPARTMENT_SUMMARIES[code] ?? fallback;
}
