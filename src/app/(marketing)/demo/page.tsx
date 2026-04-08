"use client";

import { useState } from "react";

// Note: page-level metadata can't be exported from a "use client" component.
// SEO is handled by the marketing layout's default metadata.

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  facilityName: string;
  facilityType: string;
  staffCount: string;
  message: string;
}

const initialForm: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  facilityName: "",
  facilityType: "",
  staffCount: "",
  message: "",
};

export default function DemoPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (error) setError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    try {
      const res = await fetch("/api/marketing/demo-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setSuccess(true);
        setForm(initialForm);
      } else {
        const json = (await res.json()) as { error?: string };
        setError(
          json.error === "Invalid form"
            ? "Please check your entries and try again."
            : "Something went wrong. Please try again or email hello@rinkreports.app.",
        );
      }
    } catch {
      setError(
        "Could not reach the server. Please try again or email hello@rinkreports.app.",
      );
    } finally {
      setPending(false);
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green/20">
          <span className="text-3xl" aria-hidden="true">
            ✓
          </span>
        </div>
        <h1 className="text-2xl font-bold text-white">Request received</h1>
        <p className="mt-3 text-grey">
          Thanks, {form.firstName || "there"}! We received your demo request.
          Our team will be in touch within 1 business day.
        </p>
        <p className="mt-2 text-sm text-grey">
          Questions in the meantime?{" "}
          <a href="mailto:hello@rinkreports.app" className="text-green hover:underline">
            hello@rinkreports.app
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 md:py-24">
      {/* Header */}
      <div className="mb-10">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-green">
          Request a demo
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight text-white">
          See RinkReports in action.
        </h1>
        <p className="mt-4 text-grey">
          Fill out the form and we&apos;ll schedule a 30-minute walkthrough
          tailored to your facility type and team size. No sales pressure.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 rounded-lg border border-red/40 bg-red/10 px-5 py-4 text-sm text-red">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {/* Name row */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label
              htmlFor="firstName"
              className="mb-1.5 block text-sm font-medium text-grey"
            >
              First name <span className="text-red">*</span>
            </label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              required
              maxLength={100}
              value={form.firstName}
              onChange={handleChange}
              disabled={pending}
              className="w-full rounded-lg border border-white/10 bg-navy/20 px-4 py-2.5 text-sm text-white placeholder-grey focus:border-navy focus:outline-none disabled:opacity-50"
              placeholder="Jane"
            />
          </div>
          <div>
            <label
              htmlFor="lastName"
              className="mb-1.5 block text-sm font-medium text-grey"
            >
              Last name <span className="text-red">*</span>
            </label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              required
              maxLength={100}
              value={form.lastName}
              onChange={handleChange}
              disabled={pending}
              className="w-full rounded-lg border border-white/10 bg-navy/20 px-4 py-2.5 text-sm text-white placeholder-grey focus:border-navy focus:outline-none disabled:opacity-50"
              placeholder="Smith"
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label
            htmlFor="email"
            className="mb-1.5 block text-sm font-medium text-grey"
          >
            Work email <span className="text-red">*</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={form.email}
            onChange={handleChange}
            disabled={pending}
            className="w-full rounded-lg border border-white/10 bg-navy/20 px-4 py-2.5 text-sm text-white placeholder-grey focus:border-navy focus:outline-none disabled:opacity-50"
            placeholder="jane@yourfacility.com"
          />
        </div>

        {/* Facility name */}
        <div>
          <label
            htmlFor="facilityName"
            className="mb-1.5 block text-sm font-medium text-grey"
          >
            Facility name <span className="text-red">*</span>
          </label>
          <input
            id="facilityName"
            name="facilityName"
            type="text"
            required
            maxLength={200}
            value={form.facilityName}
            onChange={handleChange}
            disabled={pending}
            className="w-full rounded-lg border border-white/10 bg-navy/20 px-4 py-2.5 text-sm text-white placeholder-grey focus:border-navy focus:outline-none disabled:opacity-50"
            placeholder="Riverside Ice Arena"
          />
        </div>

        {/* Facility type */}
        <div>
          <label
            htmlFor="facilityType"
            className="mb-1.5 block text-sm font-medium text-grey"
          >
            Facility type <span className="text-red">*</span>
          </label>
          <select
            id="facilityType"
            name="facilityType"
            required
            value={form.facilityType}
            onChange={handleChange}
            disabled={pending}
            className="w-full rounded-lg border border-white/10 bg-navy/20 px-4 py-2.5 text-sm text-white focus:border-navy focus:outline-none disabled:opacity-50"
          >
            <option value="" disabled>
              Select type...
            </option>
            <option value="municipal">Municipal</option>
            <option value="university">University</option>
            <option value="private_club">Private Club</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Staff count */}
        <div>
          <label
            htmlFor="staffCount"
            className="mb-1.5 block text-sm font-medium text-grey"
          >
            Number of staff <span className="text-red">*</span>
          </label>
          <select
            id="staffCount"
            name="staffCount"
            required
            value={form.staffCount}
            onChange={handleChange}
            disabled={pending}
            className="w-full rounded-lg border border-white/10 bg-navy/20 px-4 py-2.5 text-sm text-white focus:border-navy focus:outline-none disabled:opacity-50"
          >
            <option value="" disabled>
              Select range...
            </option>
            <option value="1-10">1–10</option>
            <option value="11-25">11–25</option>
            <option value="26-50">26–50</option>
            <option value="51-100">51–100</option>
            <option value="100+">100+</option>
          </select>
        </div>

        {/* Message */}
        <div>
          <label
            htmlFor="message"
            className="mb-1.5 block text-sm font-medium text-grey"
          >
            Anything you&apos;d like us to know? (optional)
          </label>
          <textarea
            id="message"
            name="message"
            rows={4}
            maxLength={2000}
            value={form.message}
            onChange={handleChange}
            disabled={pending}
            className="w-full rounded-lg border border-white/10 bg-navy/20 px-4 py-2.5 text-sm text-white placeholder-grey focus:border-navy focus:outline-none disabled:opacity-50 resize-none"
            placeholder="Specific modules you're most interested in, current pain points, timing, etc."
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-green py-3 text-base font-semibold text-darkbg shadow hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {pending ? "Sending..." : "Request a Demo"}
        </button>

        <p className="text-center text-xs text-grey">
          We respond within 1 business day.
        </p>
      </form>
    </div>
  );
}
