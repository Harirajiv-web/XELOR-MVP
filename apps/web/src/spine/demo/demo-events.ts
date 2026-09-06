export const DEMO_RECORD_CREATED_EVENT = "xelor:demo-record-created";

/**
 * The document kinds a guided demo can pause on. Each one is a form a PERSON fills in during
 * the walkthrough — the guide never writes anything itself, it only unlocks Next once the
 * real document exists.
 */
export type DemoRecordKind = "sales-order" | "purchase-order" | "quotation" | "rfq";

export interface DemoRecordCreatedDetail {
  kind: DemoRecordKind;
  id: string;
  reference: string;
}

/**
 * Tell the presenter guide that a person has completed a real document-entry step.
 * The event never advances the guide: it only unlocks the explicit Next button so the
 * presenter has time to open the saved document and explain it first.
 */
export function announceDemoRecordCreated(detail: DemoRecordCreatedDetail): void {
  window.dispatchEvent(
    new CustomEvent<DemoRecordCreatedDetail>(DEMO_RECORD_CREATED_EVENT, { detail }),
  );
}
