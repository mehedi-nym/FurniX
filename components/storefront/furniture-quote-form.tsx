"use client";

import { useState } from "react";
import Link from "next/link";

type QuoteSuccess = { reference: string };
type Props = {
  productId: string;
  productName: string;
  initialDimensions: Record<string, number>;
  initialUnit: string;
  initialQuantity: number;
  initialRequirements: string;
};

const materialOptions = [
  ["solid_wood", "Solid wood"],
  ["engineered_wood", "Engineered wood"],
  ["metal", "Metal"],
  ["glass", "Glass"],
  ["fabric", "Fabric / upholstery"],
  ["other", "Other"],
] as const;

export function FurnitureQuoteForm({ productId, productName, initialDimensions, initialUnit, initialQuantity, initialRequirements }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<QuoteSuccess | null>(null);
  const [fileMessage, setFileMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/quotations/furniture", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "We could not submit your request.");
      setSuccess(data as QuoteSuccess);
      setFileMessage("");
      form.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not submit your request.");
    } finally {
      setBusy(false);
    }
  }

  function updateFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (files.length > 5) setFileMessage("Choose up to five files.");
    else if (files.some((file) => file.size > 5 * 1024 * 1024)) setFileMessage("Each file must be 5 MB or smaller.");
    else if (total > 9 * 1024 * 1024) setFileMessage("Your total attachment size must be 9 MB or smaller.");
    else setFileMessage(files.length ? `${files.length} file${files.length === 1 ? "" : "s"} selected.` : "");
  }

  if (success) {
    return (
      <section className="quote-success" aria-live="polite">
        <span className="quote-success-mark" aria-hidden="true">✓</span>
        <p className="eyebrow"><span className="eyebrow-line" />Request submitted</p>
        <h2>We have your idea.</h2>
        <p>Your reference is <strong>{success.reference}</strong>. Keep it for your records. Our team will contact you using the details you provided.</p>
        <p>For your privacy, request details are only shown after you claim your customer records through verified sign-in.</p>
        <div className="quote-success-actions"><Link className="button button-dark" href="/products">Explore furniture</Link><button className="text-link" type="button" onClick={() => setSuccess(null)}>Submit another idea</button></div>
      </section>
    );
  }

  return (
    <form className="furniture-quote-form" onSubmit={submit}>
      <div className="quote-form-section">
        <div className="quote-form-heading"><span>01</span><div><h2>Your contact details</h2><p>We’ll use these details to follow up about your request.</p></div></div>
        <div className="quote-form-grid">
          <label>Full name<input name="fullName" autoComplete="name" required minLength={2} maxLength={120} /></label>
          <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label>Phone number<input name="phone" type="tel" autoComplete="tel" required maxLength={24} /></label>
          {productId && <input type="hidden" name="sourceProductId" value={productId} />}
          <label className="quote-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
        </div>
      </div>

      <div className="quote-form-section">
        <div className="quote-form-heading"><span>02</span><div><h2>Tell us about the piece</h2><p>Share the core idea, then add any measurements you already know.</p></div></div>
        {productId && <p className="quote-product-context">Based on: <strong>{productName || "a selected Furni X product"}</strong></p>}
        <div className="quote-form-grid">
          <label className="quote-field-wide">Furniture type<input name="furnitureType" placeholder="For example: dining table, wardrobe, bed" required minLength={2} maxLength={120} defaultValue={productName} /></label>
          <fieldset className="quote-dimensions quote-field-wide">
            <legend>Approximate dimensions <span>Optional</span></legend>
            <div className="quote-dimension-row">
              {(["width", "depth", "height"] as const).map((key) => <label key={key}>{key}<input name={key} type="number" min="0.1" max="10000" step="0.1" defaultValue={initialDimensions[key] ?? ""} /></label>)}
              <label>Unit<select name="dimensionUnit" defaultValue={initialUnit}><option value="ft">Feet</option><option value="in">Inches</option><option value="cm">Centimetres</option><option value="mm">Millimetres</option></select></label>
            </div>
          </fieldset>
          <fieldset className="quote-materials quote-field-wide">
            <legend>Material preferences <span>Choose any that fit</span></legend>
            <div>{materialOptions.map(([value, label]) => <label key={value}><input type="checkbox" name="materialPreferences" value={value} /><span>{label}</span></label>)}</div>
          </fieldset>
          <label className="quote-field-wide">Other material details<input name="materialNotes" placeholder="Materials, hardware, or special sourcing preferences" maxLength={300} /></label>
          <label>Wood type<input name="woodType" placeholder="e.g. teak, oak, mahogany" maxLength={100} /></label>
          <label>Preferred colour<input name="color" placeholder="Colour or reference" maxLength={100} /></label>
          <label>Finishing<input name="finishing" placeholder="e.g. matte, natural, glossy" maxLength={100} /></label>
          <label>Quantity<input name="quantity" type="number" min="1" max="100" defaultValue={initialQuantity} required /></label>
          <label className="quote-field-wide">Describe your idea<textarea name="description" rows={5} minLength={10} maxLength={5000} placeholder="What should this piece look like? How will it be used?" required /></label>
          <label className="quote-field-wide">Additional requirements<textarea name="requirements" rows={4} maxLength={3000} placeholder="Anything else we should consider?" defaultValue={initialRequirements} /></label>
        </div>
      </div>

      <div className="quote-form-section">
        <div className="quote-form-heading"><span>03</span><div><h2>Reference files</h2><p>Add sketches, room photos, inspiration images, or a short reference video.</p></div></div>
        <label className="quote-upload"><span>Choose reference files</span><input name="attachments" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf" multiple onChange={updateFiles} /><small>JPEG, PNG, WebP, MP4, WebM, or PDF · up to 5 files · 5 MB each · 9 MB total</small></label>
        {fileMessage && <p className="quote-file-message" aria-live="polite">{fileMessage}</p>}
      </div>

      {error && <p className="cart-error" role="alert">{error}</p>}
      <div className="quote-submit-row"><button className="button button-dark" type="submit" disabled={busy}>{busy ? "Sending your request…" : "Send quotation request"}</button><p>No account required. Your contact details are not treated as proof of account ownership.</p></div>
    </form>
  );
}
