/**
 * Organisation's own slice of the API. Nothing outside this folder imports it, and it
 * imports nothing from another module — which is what makes the folder deletable.
 */

/**
 * A registered place of business.
 *
 * There is no separate plant or branch record, and none is needed: in India the registered
 * place of business IS the operating site, because a GSTIN is issued per state and every
 * invoice, e-way bill and return is filed against one. `placeName` is the site —
 * "Pune-Chakan", "Coimbatore" — and `stateCode` is the two digits the GSTIN starts with.
 */
export interface GstRegistrationRow {
  id: string;
  gstin: string;
  stateCode: string;
  placeName: string;
}

/** What `GET /general/companies` returns per row, registrations included. */
export interface CompanyRow {
  id: string;
  legalName: string;
  cin: string | null;
  createdAt: string;
  registrations: GstRegistrationRow[];
}

export const generalApi = {
  companiesPath: "/general/companies",
} as const;

/**
 * The GST state codes that appear in the demo universe, spelled out.
 *
 * The two digits are what the portal uses and what an accounts clerk recognises on sight,
 * but they are not what a plant manager reads — and this screen is for both. A code this map
 * has never seen falls through to the bare number rather than guessing, because a wrong
 * state against a GSTIN is a return filed in the wrong place.
 */
const STATE_NAMES: Readonly<Record<string, string>> = {
  "24": "Gujarat",
  "27": "Maharashtra",
  "29": "Karnataka",
  "33": "Tamil Nadu",
};

export function stateName(code: string): string {
  return STATE_NAMES[code] ?? `State ${code}`;
}
