"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Row = Record<string, unknown>;
type Props = {
  customer: { full_name: string; email: string; phone: string };
  orders: Row[]; addresses: Row[]; furnitureRequests: Row[]; interiorRequests: Row[];
  quotations: Row[]; revisions: Row[]; quotationItems: Row[];
};

const date = (value: unknown) => typeof value === "string" ? new Date(value).toLocaleDateString("en-BD", { year: "numeric", month: "short", day: "numeric" }) : "";
const money = (value: unknown, currency: unknown = "BDT") => new Intl.NumberFormat("en-BD", { style: "currency", currency: typeof currency === "string" ? currency.trim() : "BDT", maximumFractionDigits: 2 }).format(Number(value || 0));
const label = (value: unknown) => typeof value === "string" ? value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()) : "";

export function AccountDashboard(props: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState(props.customer);
  const [newAddress, setNewAddress] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const requests = [
    ...props.furnitureRequests.map((row) => ({ row, kind: "Furniture" })),
    ...props.interiorRequests.map((row) => ({ row, kind: "Interior" })),
  ].sort((a, b) => String(b.row.created_at).localeCompare(String(a.row.created_at)));

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(""); setNotice("");
    const supabase = createClient();
    const { error: saveError } = await supabase.rpc("update_own_customer_profile", { p_full_name: profile.full_name, p_phone: profile.phone });
    setPending(false);
    if (saveError) { setError("We couldn’t update your profile. Check your details and try again."); return; }
    setNotice("Your profile has been updated."); router.refresh();
  }

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { data: link } = await supabase.from("customer_auth_links").select("customer_id").maybeSingle();
    if (!link?.customer_id) { setPending(false); setError("Verify your account before saving an address."); return; }
    const { error: saveError } = await supabase.from("customer_addresses").insert({
      customer_id: link.customer_id,
      label: String(form.get("label") || "") || null,
      recipient_name: String(form.get("recipient_name") || ""),
      phone: String(form.get("phone") || ""),
      address_line1: String(form.get("address_line1") || ""),
      address_line2: String(form.get("address_line2") || "") || null,
      locality: String(form.get("locality") || ""), district: String(form.get("district") || ""),
      postal_code: String(form.get("postal_code") || "") || null,
      delivery_notes: String(form.get("delivery_notes") || "") || null,
    });
    setPending(false);
    if (saveError) { setError("We couldn’t save this address. Check the details and try again."); return; }
    setNotice("Delivery address saved."); setNewAddress(false); router.refresh();
  }

  async function deleteAddress(id: string) {
    const supabase = createClient(); setPending(true); setError("");
    const { error: deleteError } = await supabase.from("customer_addresses").delete().eq("id", id);
    setPending(false);
    if (deleteError) { setError("We couldn’t remove that address."); return; }
    router.refresh();
  }

  async function respond(quotationId: string, revisionNumber: number, response: "accepted" | "rejected") {
    setPending(true); setError(""); setNotice("");
    const supabase = createClient();
    const { error: responseError } = await supabase.rpc("respond_to_quotation", { p_quotation_id: quotationId, p_revision_number: revisionNumber, p_response: response });
    setPending(false);
    if (responseError) { setError("This quotation can no longer be updated. Refresh to check its latest status."); return; }
    setNotice(`Quotation ${response}.`); router.refresh();
  }

  async function signOut() {
    await createClient().auth.signOut(); router.replace("/"); router.refresh();
  }

  return <div className="account-dashboard">
    {(notice || error) && <p className={`account-notice ${error ? "is-error" : "is-success"}`} role={error ? "alert" : "status"}>{error || notice}</p>}
    <section className="account-section"><div className="account-section-title"><div><p className="eyebrow">Purchases</p><h2>Orders</h2></div></div>
      {props.orders.length ? <div className="account-record-list">{props.orders.map((order) => <article className="account-record" key={String(order.id)}><div className="account-record-top"><div><span className="account-reference">{String(order.public_reference)}</span><span className="account-muted"> · {date(order.created_at)}</span></div><span className="account-status">{label(order.status)}</span></div><div className="account-record-items">{((order.order_items as Row[]) || []).map((item, index) => <span key={`${String(order.id)}-${index}`}>{String(item.product_name_snapshot)} × {String(item.quantity)}</span>)}</div><div className="account-record-bottom"><span>{label(order.payment_status)}</span><strong>{money(order.total, order.currency)}</strong></div></article>)}</div> : <p className="account-empty">Orders placed with this verified email will appear here.</p>}
    </section>

    <section className="account-section"><div className="account-section-title"><div><p className="eyebrow">Made for you</p><h2>Design requests</h2></div><Link className="text-link" href="/custom-furniture">Start a furniture request</Link></div>
      {requests.length ? <div className="account-record-list">{requests.map(({ row, kind }) => <article className="account-record" key={String(row.id)}><div className="account-record-top"><div><span className="account-reference">{String(row.public_reference)}</span><span className="account-muted"> · {kind} · {date(row.created_at)}</span></div><span className="account-status">{label(row.status)}</span></div><p className="account-record-description">{String(row.description)}</p>{row.property_type ? <p className="account-muted">{label(row.property_type)} · {Number(row.total_square_feet).toLocaleString()} sq ft</p> : null}</article>)}</div> : <p className="account-empty">Your furniture and interior design requests will appear here.</p>}
    </section>

    <section className="account-section"><div className="account-section-title"><div><p className="eyebrow">Pricing and scope</p><h2>Quotations</h2></div></div>
      {props.quotations.length ? <div className="account-record-list">{props.quotations.map((quotation) => {
        const quoteRevisions = props.revisions.filter((revision) => revision.quotation_id === quotation.id);
        const active = quoteRevisions.find((revision) => Number(revision.revision_number) === Number(quotation.current_revision));
        const items = active ? props.quotationItems.filter((item) => item.revision_id === active.id) : [];
        const open = quotation.status === "sent" && active?.status === "sent";
        return <article className="account-record" key={String(quotation.id)}><div className="account-record-top"><div><span className="account-reference">{String(quotation.public_reference)}</span><span className="account-muted"> · {date(quotation.created_at)} · Revision {String(quotation.current_revision)}</span></div><span className="account-status">{label(active?.status ?? quotation.status)}</span></div>{active ? <><p className="account-record-description">{String(active.terms || "Quotation details")}{active.valid_until ? ` · Valid until ${date(active.valid_until)}` : ""}</p>{items.map((item, index) => <div className="account-quote-item" key={`${String(active.id)}-${index}`}><span>{String(item.description)} × {String(item.quantity)}</span><span>{money(item.line_total, active.currency)}</span></div>)}<div className="account-record-bottom"><span>Quotation total</span><strong>{money(active.total, active.currency)}</strong></div>{open && <div className="account-response-actions"><button type="button" disabled={pending} onClick={() => respond(String(quotation.id), Number(active.revision_number), "accepted")}>Accept quotation</button><button type="button" disabled={pending} onClick={() => respond(String(quotation.id), Number(active.revision_number), "rejected")}>Decline</button></div>}</> : <p className="account-muted">A quotation is being prepared for this request.</p>}</article>;
      })}</div> : <p className="account-empty">Quotations will appear here when they’re ready.</p>}
    </section>

    <section className="account-section"><div className="account-section-title"><div><p className="eyebrow">Your details</p><h2>Profile and delivery</h2></div></div><div className="account-columns">
      <form className="account-card account-form" onSubmit={saveProfile}><h3>Profile</h3><label htmlFor="profile-name">Full name</label><input id="profile-name" required minLength={2} maxLength={120} value={profile.full_name} onChange={(event) => setProfile({ ...profile, full_name: event.target.value })} /><label htmlFor="profile-email">Verified email</label><input id="profile-email" type="email" value={profile.email} disabled /><label htmlFor="profile-phone">Phone</label><input id="profile-phone" type="tel" required minLength={6} maxLength={40} value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /><button className="button button-dark" disabled={pending}>{pending ? "Saving…" : "Save profile"}</button></form>
      <div className="account-addresses"><div className="account-address-heading"><h3>Delivery addresses</h3><button className="account-inline-button" onClick={() => setNewAddress((value) => !value)} type="button">{newAddress ? "Cancel" : "Add address"}</button></div>
        {props.addresses.length ? props.addresses.map((address) => <article className="account-address" key={String(address.id)}><div><strong>{String(address.label || "Delivery address")}</strong><p>{String(address.recipient_name)} · {String(address.phone)}<br />{String(address.address_line1)}{address.address_line2 ? `, ${String(address.address_line2)}` : ""}<br />{String(address.locality)}, {String(address.district)} {String(address.postal_code || "")}</p></div><button type="button" disabled={pending} onClick={() => deleteAddress(String(address.id))}>Remove</button></article>) : <p className="account-empty">No saved delivery addresses yet.</p>}
        {newAddress && <form className="account-card account-form account-address-form" onSubmit={saveAddress}><label>Label<input name="label" maxLength={60} placeholder="Home" /></label><label>Recipient name<input name="recipient_name" required maxLength={120} /></label><label>Phone<input name="phone" type="tel" required maxLength={40} /></label><label>Address line 1<input name="address_line1" required maxLength={250} /></label><label>Address line 2<input name="address_line2" maxLength={250} /></label><div className="account-input-row"><label>Locality<input name="locality" required maxLength={100} /></label><label>District<input name="district" required maxLength={100} /></label></div><label>Postal code<input name="postal_code" maxLength={20} /></label><label>Delivery notes<input name="delivery_notes" maxLength={500} /></label><button className="button button-dark" disabled={pending}>Save address</button></form>}
      </div></div>
    </section>
    <div className="account-signout"><span>Signed in as {props.customer.email}</span><button type="button" onClick={signOut}>Sign out</button></div>
  </div>;
}
