"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

type InteriorReferenceChoice = { id: string; project_name: string; imageUrl: string | null };
type Props = { references: InteriorReferenceChoice[]; initialReferenceId: string };

const rooms = [
  ["living_room", "Living room"], ["master_bedroom", "Master bedroom"], ["guest_bedroom", "Guest bedroom"],
  ["kids_room", "Kids room"], ["kitchen", "Kitchen"], ["washroom", "Washroom"],
  ["dining_room", "Dining room"], ["balcony", "Balcony"], ["office", "Office space"],
] as const;
const styles = [["modern", "Modern"], ["minimalist", "Minimalist"], ["royal", "Royal"], ["classic", "Classic"], ["contemporary", "Contemporary"]] as const;
const materials = [["solid_wood", "Solid wood"], ["engineered_wood", "Engineered wood"], ["stone", "Stone"], ["glass", "Glass"], ["metal", "Metal"], ["fabric", "Fabric"], ["other", "Other"]] as const;
const scope = [["complete_interior", "Complete interior"], ["furniture_only", "Furniture only"], ["wall_decoration", "Wall decoration"], ["ceiling_lighting", "Ceiling & lighting"], ["kitchen_interior", "Kitchen interior"], ["bedroom_interior", "Bedroom interior"], ["partial_renovation", "Partial renovation"], ["full_renovation", "Full renovation"]] as const;

type Success = { reference: string };

export function InteriorQuoteForm({ references, initialReferenceId }: Props) {
  const [selectedRooms, setSelectedRooms] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileMessage, setFileMessage] = useState("");
  const [success, setSuccess] = useState<Success | null>(null);

  function toggleRoom(roomType: string) {
    setSelectedRooms((current) => current.includes(roomType) ? current.filter((value) => value !== roomType) : [...current, roomType]);
  }

  function updateFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (files.length > 5) setFileMessage("Choose up to five files.");
    else if (files.some((file) => file.size > 5 * 1024 * 1024)) setFileMessage("Each file must be 5 MB or smaller.");
    else if (total > 9 * 1024 * 1024) setFileMessage("Your total attachment size must be 9 MB or smaller.");
    else setFileMessage(files.length ? `${files.length} file${files.length === 1 ? "" : "s"} selected.` : "");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/quotations/interior", { method: "POST", body: new FormData(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "We could not submit your request.");
      setSuccess(data as Success);
      setFileMessage("");
      form.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not submit your request.");
    } finally { setBusy(false); }
  }

  if (success) return (
    <section className="quote-success" aria-live="polite">
      <span className="quote-success-mark" aria-hidden="true">✓</span>
      <p className="eyebrow"><span className="eyebrow-line" />Interior request submitted</p>
      <h2>Thanks for sharing your space.</h2>
      <p>Your reference is <strong>{success.reference}</strong>. Keep it for your records. Our team will contact you using the details you provided.</p>
      <p>Request details are only available after you claim your customer records through verified sign-in.</p>
      <div className="quote-success-actions"><Link className="button button-dark" href="/interior-design">Back to the gallery</Link><button className="text-link" type="button" onClick={() => setSuccess(null)}>Submit another request</button></div>
    </section>
  );

  return (
    <form className="interior-quote-form" onSubmit={submit}>
      <section className="interior-form-section">
        <div className="interior-form-heading"><span>01</span><div><h2>Your contact details</h2><p>No account required to request an interior quote.</p></div></div>
        <div className="interior-form-grid">
          <label>Full name<input name="fullName" autoComplete="name" required minLength={2} maxLength={120} /></label>
          <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label>Phone number<input name="phone" type="tel" autoComplete="tel" required maxLength={24} /></label>
          <label className="interior-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
        </div>
      </section>

      <section className="interior-form-section">
        <div className="interior-form-heading"><span>02</span><div><h2>Property details</h2><p>Approximate details are fine; we’ll clarify them during follow-up.</p></div></div>
        <div className="interior-form-grid">
          <label>Property type<select name="propertyType" required defaultValue=""><option value="" disabled>Select type</option><option value="residential">Residential</option><option value="commercial">Commercial</option><option value="office">Office</option><option value="other">Other</option></select></label>
          <label>Total area (sq ft)<input name="totalSquareFeet" type="number" min="1" max="1000000" step="1" required /></label>
          <label>Number of floors<input name="floorCount" type="number" min="1" max="100" step="1" defaultValue="1" required /></label>
          <label>Construction status<select name="readinessStatus" required defaultValue=""><option value="" disabled>Select status</option><option value="planning">Planning</option><option value="under_construction">Under construction</option><option value="ready">Ready for work</option><option value="occupied">Occupied</option><option value="renovation">Renovation</option></select></label>
          <label className="interior-field-wide">Address or area<input name="addressLine1" autoComplete="street-address" required minLength={3} maxLength={240} /></label>
          <label>Locality / area<input name="locality" autoComplete="address-level3" required maxLength={120} /></label>
          <label>District / city<input name="district" autoComplete="address-level2" required maxLength={120} /></label>
        </div>
      </section>

      <section className="interior-form-section">
        <div className="interior-form-heading"><span>03</span><div><h2>Rooms in scope</h2><p>Select the rooms and add an approximate count and area.</p></div></div>
        <div className="interior-room-grid">{rooms.map(([value, label]) => {
          const selected = selectedRooms.includes(value);
          return <div className={selected ? "interior-room-card is-selected" : "interior-room-card"} key={value}>
            <label className="interior-room-toggle"><input type="checkbox" name="roomTypes" value={value} checked={selected} onChange={() => toggleRoom(value)} /><span>{label}</span></label>
            {selected && <div className="interior-room-fields"><label>Count<input name={`room_quantity_${value}`} type="number" min="1" max="30" defaultValue="1" /></label><label>Approx. sq ft<input name={`room_area_${value}`} type="number" min="1" max="100000" /></label><label className="interior-field-wide">Notes<input name={`room_notes_${value}`} maxLength={500} placeholder="Optional room details" /></label></div>}
          </div>;
        })}</div>
      </section>

      <section className="interior-form-section">
        <div className="interior-form-heading"><span>04</span><div><h2>Design preferences</h2><p>Choose a direction and tell us what matters in the details.</p></div></div>
        <fieldset className="interior-choice-group"><legend>Design style</legend><div>{styles.map(([value, label]) => <label key={value}><input type="checkbox" name="designStyles" value={value} /><span>{label}</span></label>)}</div></fieldset>
        <fieldset className="interior-choice-group"><legend>Preferred materials</legend><div>{materials.map(([value, label]) => <label key={value}><input type="checkbox" name="preferredMaterials" value={value} /><span>{label}</span></label>)}</div></fieldset>
        <div className="interior-form-grid interior-preference-fields">
          <label>Preferred colours<input name="preferredColors" maxLength={500} placeholder="Colours or palette" /></label>
          <label>Furniture preferences<input name="furniturePreferences" maxLength={1000} placeholder="Pieces, storage, or layout needs" /></label>
          <label>Lighting preferences<input name="lightingPreferences" maxLength={1000} placeholder="Natural, ambient, task lighting…" /></label>
          <label>Wall design<input name="wallDesignPreferences" maxLength={1000} placeholder="Panelling, paint, texture…" /></label>
          <label className="interior-field-wide">Ceiling design<input name="ceilingDesignPreferences" maxLength={1000} placeholder="Ceiling style or lighting details" /></label>
        </div>
      </section>

      <section className="interior-form-section">
        <div className="interior-form-heading"><span>05</span><div><h2>Scope of work</h2><p>Select the areas you’d like us to consider.</p></div></div>
        <fieldset className="interior-choice-group"><legend>Choose one or more</legend><div className="interior-scope-grid">{scope.map(([value, label]) => <label key={value}><input type="checkbox" name="scopeOfWork" value={value} /><span>{label}</span></label>)}</div></fieldset>
      </section>

      <section className="interior-form-section">
        <div className="interior-form-heading"><span>06</span><div><h2>References and description</h2><p>Save gallery ideas, attach your own files, or describe the feeling you want.</p></div></div>
        {references.length > 0 && <fieldset className="interior-reference-choices"><legend>Gallery references <span>Optional</span></legend><div>{references.map((reference) => <label className="interior-reference-choice" key={reference.id}><input type="checkbox" name="referenceIds" value={reference.id} defaultChecked={reference.id === initialReferenceId} />{reference.imageUrl ? <Image src={reference.imageUrl} alt="" width={88} height={88} unoptimized /> : <span className="reference-choice-placeholder">F—X</span>}<span>{reference.project_name}</span></label>)}</div></fieldset>}
        <label className="interior-upload"><span>Attach room photos, inspiration, or plans</span><input type="file" name="attachments" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf" multiple onChange={updateFiles} /><small>JPEG, PNG, WebP, MP4, WebM, or PDF · up to 5 files · 5 MB each · 9 MB total</small></label>
        {fileMessage && <p className="quote-file-message" aria-live="polite">{fileMessage}</p>}
        <label className="interior-description">Describe your project<textarea name="description" rows={5} minLength={10} maxLength={5000} placeholder="What should this space feel like? What would you like to improve?" required /></label>
      </section>

      {error && <p className="cart-error" role="alert">{error}</p>}
      <div className="interior-submit-row"><button className="button button-dark" type="submit" disabled={busy}>{busy ? "Sending your request…" : "Request an interior quote"} <ArrowRight size={16} aria-hidden="true" /></button><p>Guest request details remain private until you verify your account.</p></div>
    </form>
  );
}
