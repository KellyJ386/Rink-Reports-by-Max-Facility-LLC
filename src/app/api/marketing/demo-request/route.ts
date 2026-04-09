import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { Resend } from "resend";

const DemoRequestSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  facilityName: z.string().min(1).max(200),
  facilityType: z.enum(["municipal", "university", "private_club", "other"]),
  staffCount: z.enum(["1-10", "11-25", "26-50", "51-100", "100+"]),
  message: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    const parsed = DemoRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid form" }, { status: 400 });
    }
    const data = parsed.data;

    // HubSpot sync (fire-and-forget).
    // src/lib/hubspot.ts exports createOrUpdateContact but not upsertHubSpotContact.
    // TODO: add upsertHubSpotContact to src/lib/hubspot.ts with the additional
    //       marketing fields (facilityType, staffCount, dealStage).
    //       For now we call createOrUpdateContact with the fields it accepts.
    try {
      const { createOrUpdateContact } = await import("@/lib/hubspot");
      await createOrUpdateContact({
        email: data.email,
        facility_name: data.facilityName,
        // facility_id is not known at demo-request time — left undefined
      });
    } catch (err) {
      Sentry.captureException(err, {
        tags: { context: "demo-request-hubspot" },
      });
      // Never block the demo request on HubSpot failure
    }

    // Confirmation email via Resend
    try {
      if (process.env.RESEND_API_KEY) {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from:
            process.env.RESEND_FROM_EMAIL ?? "hello@rinkreports.app",
          to: data.email,
          subject: "Thanks for requesting a RinkReports demo",
          html: `<h2>Thanks, ${data.firstName}!</h2><p>We received your demo request for ${data.facilityName}. Our team will be in touch within 1 business day.</p><p>— RinkReports</p>`,
        });
      }
    } catch (err) {
      Sentry.captureException(err, {
        tags: { context: "demo-request-email" },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
