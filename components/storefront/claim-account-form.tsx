"use client";

import { useState } from "react";

export function ClaimAccountForm({ result }: { result: string }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const callbackResult = result;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/customer/claim/start", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "We could not send the verification link.");
      setMessage(body.message || "Check your inbox for a secure verification link.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not send the verification link.");
    } finally { setPending(false); }
  }

  return <div className="account-card">
    {callbackResult === "complete" && <p className="account-notice is-success" role="status">Your email is verified. Your matching guest records are now linked to this account.</p>}
    {callbackResult === "verification-failed" && <p className="account-notice is-error" role="alert">That verification link could not be confirmed. Request a new one to continue.</p>}
    {callbackResult === "link-failed" && <p className="account-notice is-error" role="alert">Your email was verified, but records could not be linked. Please try again.</p>}
    <form className="account-form" onSubmit={submit}>
      <label htmlFor="claim-email">Email used for your order or quote</label>
      <input id="claim-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
      <button className="button button-dark" type="submit" disabled={pending}>{pending ? "Sending…" : "Send secure link"}</button>
      {message && <p className="account-notice is-success" role="status">{message}</p>}
      {error && <p className="account-notice is-error" role="alert">{error}</p>}
    </form>
    <p className="account-small-print">If this email belongs to an existing Furni X account, use its verification link to sign in. We never link records based on an unverified email address.</p>
  </div>;
}
