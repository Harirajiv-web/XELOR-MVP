"use client";

import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { api } from "@spine/api/client";
import { Modal } from "@spine/ui/modal";
import { useCursorList } from "@spine/data/use-query";

export function NewSupplier({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }): React.JSX.Element {
  const vendors = useCursorList<{ id: string; name: string }>("/purchase/vendors", { limit: 100 });
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); const values = new FormData(event.currentTarget); const field = (key: string): string | undefined => String(values.get(key) ?? "").trim() || undefined;
    setError(null); if (!field("email") && !field("whatsappE164")) { setError("Add an email address or international phone number so this supplier can be reached."); return; } setBusy(true);
    try { await api.post("/purchase/network/suppliers", { supplierCode: field("supplierCode"), name: field("name"), categories: (field("categories") ?? "").split(",").map((value) => value.trim()).filter(Boolean), city: field("city"), contactName: field("contactName"), email: field("email"), whatsappE164: field("whatsappE164"), vendorId: field("vendorId"), notes: field("notes") }); onSaved(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not add this supplier."); } finally { setBusy(false); }
  }
  return <Modal title="Add a supplier" subtitle="Keep their capabilities and contact details together." onClose={onClose} locked={busy}><form className="space-y-5" onSubmit={(event) => void submit(event)}><div className="x-form-grid"><label className="x-field">Supplier name<input name="name" required maxLength={200} data-autofocus /></label><label className="x-field">Supplier code<input name="supplierCode" required maxLength={40} /></label><label className="x-field">City<input name="city" maxLength={80} /></label><label className="x-field">Contact person<input name="contactName" maxLength={120} /></label><label className="x-field">Email<input type="email" name="email" /></label><label className="x-field">WhatsApp / phone<input type="tel" name="whatsappE164" placeholder="+91…" /></label><label className="x-field sm:col-span-2">Capabilities<input name="categories" placeholder="Machining, castings, fabrication" /><small>Separate capabilities with commas.</small></label><label className="x-field sm:col-span-2">Approved vendor link<select name="vendorId"><option value="">Not an approved vendor yet</option>{vendors.rows.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select><small>Link an existing approved vendor to enable purchase-order awards.</small></label></div>{vendors.hasMore ? <button type="button" className="btn btn-secondary btn-sm" onClick={vendors.loadMore}>Load more vendors</button> : null}<label className="x-field">Notes<textarea name="notes" maxLength={1000} rows={2} /></label>{error ? <div role="alert" className="x-notice" data-tone="error">{error}</div> : null}<div className="flex justify-end gap-2"><button className="btn btn-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="btn btn-primary" disabled={busy}><Plus className="h-4 w-4" aria-hidden />{busy ? "Saving…" : "Add supplier"}</button></div></form></Modal>;
}
