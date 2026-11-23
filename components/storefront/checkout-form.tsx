"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Method = { id: string; name: string; charge: number };
type Summary = { items: { id: string; productName: string; quantity: number; price: { lineTotal: number; currency: string } | null }[]; subtotal: number; currency: string };
function money(value: number, currency: string) { return new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 0 }).format(value); }

export function CheckoutForm({ shippingMethods }: { shippingMethods: Method[] }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [methodId, setMethodId] = useState(shippingMethods[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { fetch("/api/cart", { cache: "no-store" }).then(async (r) => { const data = await r.json(); if (!r.ok) throw Error(); setSummary(data); }).catch(() => setError("Could not load your cart.")); }, []);

  async function submit(formData: FormData) {
    setBusy(true); setError("");
    const payload = {
      customer: { fullName: formData.get("fullName"), email: formData.get("email"), phone: formData.get("phone") },
      delivery: { addressLine1: formData.get("addressLine1"), addressLine2: formData.get("addressLine2"), locality: formData.get("locality"), district: formData.get("district"), postalCode: formData.get("postalCode"), deliveryNotes: formData.get("deliveryNotes"), installationNotes: formData.get("installationNotes") },
      shippingMethodId: methodId,
    };
    try {
      const response = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Checkout could not be completed.");
      window.location.assign(`/checkout/complete?reference=${encodeURIComponent(data.orderReference)}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Checkout could not be completed."); setBusy(false); }
  }

  const selectedMethod = shippingMethods.find((method) => method.id === methodId);
  return <div className="checkout-layout"><form className="checkout-form" action={submit}><h2>Contact details</h2><div className="checkout-fields"><label>Full name<input name="fullName" autoComplete="name" required minLength={2} maxLength={120} /></label><label>Email<input name="email" type="email" autoComplete="email" required /></label><label>Phone<input name="phone" type="tel" autoComplete="tel" required /></label><h2>Delivery details</h2><label className="field-wide">Address line 1<input name="addressLine1" autoComplete="address-line1" required /></label><label className="field-wide">Address line 2<input name="addressLine2" autoComplete="address-line2" /></label><label>Area / locality<input name="locality" autoComplete="address-level3" required /></label><label>District<input name="district" autoComplete="address-level2" required /></label><label>Postal code<input name="postalCode" autoComplete="postal-code" /></label><label>Delivery notes<textarea name="deliveryNotes" rows={3} maxLength={1000} /></label><label>Installation notes<textarea name="installationNotes" rows={3} maxLength={1000} /></label><label className="field-wide">Delivery method<select value={methodId} onChange={(event) => setMethodId(event.target.value)} required>{shippingMethods.map((method) => <option key={method.id} value={method.id}>{method.name} — {money(method.charge, "BDT")}</option>)}</select></label></div>{!shippingMethods.length && <p role="alert">Delivery options are not available yet. Please try again later.</p>}{error && <p className="cart-error" role="alert">{error}</p>}<button className="button button-dark" disabled={busy || !shippingMethods.length || !summary?.items.length}>{busy ? "Placing order…" : "Place order"}</button><p className="checkout-privacy">Guest checkout; no account is required. Prices and availability are revalidated when you place the order.</p></form><aside className="cart-summary checkout-summary"><p className="eyebrow"><span className="eyebrow-line" />Order summary</p>{summary?.items.map((item) => <div className="checkout-summary-item" key={item.id}><span>{item.productName} × {item.quantity}</span><strong>{item.price ? money(item.price.lineTotal, item.price.currency) : "To be confirmed"}</strong></div>)}<div><span>Subtotal</span><strong>{money(summary?.subtotal ?? 0, summary?.currency ?? "BDT")}</strong></div><div><span>Delivery</span><strong>{money(selectedMethod?.charge ?? 0, "BDT")}</strong></div><small>Final charges are recalculated securely by the server.</small><Link href="/cart">Edit cart</Link></aside></div>;
}
