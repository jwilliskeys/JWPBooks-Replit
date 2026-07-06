/**
 * email.ts — Transactional email for the booking system.
 *
 * Uses the Resend HTTP API via plain fetch (no npm dependency, so nothing
 * breaks in sandboxed/cross-platform sessions). To activate, add to .env:
 *
 *   RESEND_API_KEY=re_xxxxxxxx        (from https://resend.com — free tier is fine)
 *   BOOKING_EMAIL_FROM="John Willis Piano <booking@johnwillispiano.com>"
 *
 * BOOKING_EMAIL_FROM must be a Resend-verified sender/domain. If the key is
 * unset, sends are skipped with a log line — the booking flow still works.
 */

import type { BookingRequest } from "@shared/schema";

const RESEND_URL = "https://api.resend.com/emails";

function fromAddress(): string {
  return process.env.BOOKING_EMAIL_FROM || "John Willis Piano <onboarding@resend.dev>";
}

function ownerAddress(): string {
  return process.env.BOOKING_NOTIFY_EMAIL || process.env.OWNER_EMAIL || "j.willis.keys@gmail.com";
}

export async function sendEmail(opts: { to: string; subject: string; html: string; replyTo?: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email] RESEND_API_KEY not set — skipped "${opts.subject}" to ${opts.to}`);
    return false;
  }
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddress(),
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      console.error(`[email] send failed (${res.status}): ${await res.text().catch(() => "")}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error(`[email] send error: ${err?.message ?? err}`);
    return false;
  }
}

// ── Templates ────────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function prettyDate(ymd: string | null | undefined): string {
  if (!ymd) return "";
  const d = new Date(ymd + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function detailsTable(req: BookingRequest): string {
  const rows: Array<[string, string]> = [];
  if (req.requestedDate) rows.push(["Date", prettyDate(req.requestedDate)]);
  if (req.requestedTime) rows.push(["Time", req.requestedTime]);
  if (req.serviceRequested) rows.push(["Service", req.serviceRequested]);
  if (req.streetAddress || req.cityNeighborhood) rows.push(["Location", req.streetAddress || req.cityNeighborhood || ""]);
  if (req.pianoType) rows.push(["Piano", req.pianoType]);
  return rows
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:14px;">${esc(k)}</td><td style="padding:4px 0;font-size:14px;"><strong>${esc(v)}</strong></td></tr>`)
    .join("");
}

function wrap(body: string): string {
  return `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;color:#1e293b;">
    <h2 style="font-weight:bold;">John Willis Piano</h2>
    ${body}
    <p style="color:#64748b;font-size:13px;margin-top:24px;">John Willis · Registered Piano Technician · johnwillispiano.com</p>
  </div>`;
}

/** Client email when a booking is instantly confirmed (auto-approve mode). */
export function clientConfirmedEmail(req: BookingRequest): { subject: string; html: string } {
  return {
    subject: `Confirmed: piano appointment ${prettyDate(req.requestedDate)}${req.requestedTime ? ` at ${req.requestedTime}` : ""}`,
    html: wrap(`
      <p>Hi ${esc(req.firstName)},</p>
      <p>Your appointment is <strong>confirmed</strong>. Here are the details:</p>
      <table>${detailsTable(req)}</table>
      <p>If you need to change or cancel, just reply to this email or call John.</p>
      <p>See you soon!</p>`),
  };
}

/** Client email when a request is received but pending approval (manual mode). */
export function clientReceivedEmail(req: BookingRequest): { subject: string; html: string } {
  return {
    subject: "We received your piano appointment request",
    html: wrap(`
      <p>Hi ${esc(req.firstName)},</p>
      <p>Thanks for your request! Here's what you asked for:</p>
      <table>${detailsTable(req)}</table>
      <p>John will review it (usually within one business day) and you'll get a confirmation email once it's on his calendar.</p>`),
  };
}

/** Client email when John approves a pending request. */
export function clientApprovedEmail(req: BookingRequest, date: string, time: string): { subject: string; html: string } {
  return {
    subject: `Confirmed: piano appointment ${prettyDate(date)} at ${time}`,
    html: wrap(`
      <p>Hi ${esc(req.firstName)},</p>
      <p>Good news — your appointment is <strong>confirmed</strong> for <strong>${prettyDate(date)} at ${esc(time)}</strong>.</p>
      <table>${detailsTable({ ...req, requestedDate: date, requestedTime: time })}</table>
      <p>If you need to change or cancel, just reply to this email.</p>`),
  };
}

/** Owner notification for any new booking. */
export function ownerNotificationEmail(
  req: BookingRequest,
  mode: "auto" | "manual",
  approveUrl?: string,
): { to: string; subject: string; html: string } {
  const who = `${req.firstName} ${req.lastName}`;
  const when = `${prettyDate(req.requestedDate)}${req.requestedTime ? ` at ${req.requestedTime}` : ""}`;
  const contact = `<p style="font-size:14px;">Contact: ${esc(req.email)}${req.phone ? ` · ${esc(req.phone)}` : ""}</p>`;
  const extras = req.preferredTimes ? `<p style="font-size:13px;color:#64748b;">Notes: ${esc(req.preferredTimes)}</p>` : "";
  if (mode === "auto") {
    return {
      to: ownerAddress(),
      subject: `New booking (auto-confirmed): ${who} — ${when}`,
      html: wrap(`
        <p><strong>${esc(who)}</strong> booked <strong>${when}</strong> and it's already on your calendar.</p>
        <table>${detailsTable(req)}</table>
        ${contact}${extras}`),
    };
  }
  return {
    to: ownerAddress(),
    subject: `New booking request: ${who} — ${when}`,
    html: wrap(`
      <p><strong>${esc(who)}</strong> requested <strong>${when}</strong>.</p>
      <table>${detailsTable(req)}</table>
      ${contact}${extras}
      ${approveUrl ? `<p style="margin-top:20px;"><a href="${approveUrl}" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:15px;">Approve this booking</a></p>
      <p style="font-size:12px;color:#94a3b8;">One tap creates the client + appointment and emails them a confirmation. Or review it on your dashboard.</p>` : ""}`),
  };
}
