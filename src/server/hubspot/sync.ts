import "server-only";

import * as Sentry from "@sentry/nextjs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const HUBSPOT_API = "https://api.hubapi.com";

interface HubSpotCompanyProperties {
  name?: string;
  address?: string;
  rr_plan_status?: string;
  rr_plan_tier?: string;
  rr_stripe_customer_id?: string;
}

interface HubSpotContactProperties {
  email?: string;
  firstname?: string;
  lastname?: string;
  company?: string;
  rr_plan_status?: string;
  rr_plan_tier?: string;
  rr_trial_ends_at?: string;
  rr_seat_count?: string;
  rr_signup_date?: string;
}

interface HubSpotDealProperties {
  dealname?: string;
  dealstage?: string;
  amount?: string;
}

function token(): string | null {
  return process.env.HUBSPOT_API_KEY ?? null;
}

/**
 * Search for a HubSpot company by custom property rr_stripe_customer_id.
 * Returns the company id if found, null if not found, undefined on hard failure.
 */
async function findCompanyByStripeId(
  stripeCustomerId: string,
): Promise<string | null | undefined> {
  const t = token();
  if (!t) return undefined;

  try {
    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/companies/search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${t}`,
      },
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: "rr_stripe_customer_id",
                operator: "EQ",
                value: stripeCustomerId,
              },
            ],
          },
        ],
        properties: ["name"],
        limit: 1,
      }),
    });

    if (!res.ok) {
      console.warn(
        "[hubspot] company search by stripe_id failed:",
        res.status,
      );
      return undefined;
    }

    const json = (await res.json()) as { results?: Array<{ id: string }> };
    return json.results?.[0]?.id ?? null;
  } catch (err) {
    console.warn("[hubspot] company search by stripe_id threw:", err);
    return undefined;
  }
}

/**
 * Search for a HubSpot contact by email.
 * Returns the contact id if found, null if not found, undefined on hard failure.
 */
async function findContactByEmail(
  email: string,
): Promise<string | null | undefined> {
  const t = token();
  if (!t) return undefined;

  try {
    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts/search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${t}`,
      },
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              { propertyName: "email", operator: "EQ", value: email },
            ],
          },
        ],
        properties: ["email"],
        limit: 1,
      }),
    });

    if (!res.ok) {
      console.warn("[hubspot] contact search by email failed:", res.status);
      return undefined;
    }

    const json = (await res.json()) as { results?: Array<{ id: string }> };
    return json.results?.[0]?.id ?? null;
  } catch (err) {
    console.warn("[hubspot] contact search by email threw:", err);
    return undefined;
  }
}

/**
 * Search for a HubSpot deal by company id.
 * Returns the deal id if found, null if not found, undefined on hard failure.
 */
async function findDealByCompanyId(
  companyId: string,
): Promise<string | null | undefined> {
  const t = token();
  if (!t) return undefined;

  try {
    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${t}`,
      },
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: "associated_company",
                operator: "EQ",
                value: companyId,
              },
            ],
          },
        ],
        properties: ["dealstage"],
        limit: 1,
      }),
    });

    if (!res.ok) {
      console.warn(
        "[hubspot] deal search by company_id failed:",
        res.status,
      );
      return undefined;
    }

    const json = (await res.json()) as { results?: Array<{ id: string }> };
    return json.results?.[0]?.id ?? null;
  } catch (err) {
    console.warn("[hubspot] deal search by company_id threw:", err);
    return undefined;
  }
}

/**
 * Upsert a HubSpot company. Creates if missing (searched by stripe_customer_id),
 * otherwise patches the existing record. Best-effort, never throws.
 */
async function upsertCompany(
  stripeCustomerId: string,
  properties: HubSpotCompanyProperties,
): Promise<string | null> {
  const t = token();
  if (!t) return null;

  try {
    const existingId = await findCompanyByStripeId(stripeCustomerId);
    if (existingId === undefined) return null; // search failed, give up

    const props: HubSpotCompanyProperties = { ...properties };

    if (existingId === null) {
      // Create new company
      const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/companies`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({ properties: props }),
      });

      if (!res.ok) {
        console.warn("[hubspot] company create failed:", res.status);
        return null;
      }

      const json = (await res.json()) as { id?: string };
      return json.id ?? null;
    } else {
      // Update existing company
      const res = await fetch(
        `${HUBSPOT_API}/crm/v3/objects/companies/${existingId}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${t}`,
          },
          body: JSON.stringify({ properties: props }),
        },
      );

      if (!res.ok) {
        console.warn("[hubspot] company patch failed:", res.status);
        return null;
      }

      return existingId;
    }
  } catch (err) {
    console.warn("[hubspot] upsertCompany threw:", err);
    return null;
  }
}

/**
 * Upsert a HubSpot contact. Creates if missing (searched by email),
 * otherwise patches the existing record. Best-effort, never throws.
 */
async function upsertContact(
  properties: HubSpotContactProperties,
): Promise<string | null> {
  const t = token();
  if (!t) return null;

  if (!properties.email || properties.email.trim().length === 0) {
    return null;
  }

  try {
    const existingId = await findContactByEmail(properties.email);
    if (existingId === undefined) return null; // search failed, give up

    if (existingId === null) {
      // Create new contact
      const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({ properties }),
      });

      if (!res.ok) {
        console.warn("[hubspot] contact create failed:", res.status);
        return null;
      }

      const json = (await res.json()) as { id?: string };
      return json.id ?? null;
    } else {
      // Update existing contact
      const res = await fetch(
        `${HUBSPOT_API}/crm/v3/objects/contacts/${existingId}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${t}`,
          },
          body: JSON.stringify({ properties }),
        },
      );

      if (!res.ok) {
        console.warn("[hubspot] contact patch failed:", res.status);
        return null;
      }

      return existingId;
    }
  } catch (err) {
    console.warn("[hubspot] upsertContact threw:", err);
    return null;
  }
}

/**
 * Associate a contact with a company in HubSpot.
 */
async function associateContactToCompany(
  contactId: string,
  companyId: string,
): Promise<void> {
  const t = token();
  if (!t) return;

  try {
    const res = await fetch(
      `${HUBSPOT_API}/crm/v3/objects/contacts/${contactId}/associations/companies/${companyId}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({
          associationCategory: "HUBSPOT_DEFINED",
          associationType: "contact_to_company",
        }),
      },
    );

    if (!res.ok) {
      console.warn("[hubspot] contact-company association failed:", res.status);
    }
  } catch (err) {
    console.warn("[hubspot] associateContactToCompany threw:", err);
  }
}

/**
 * Map our internal plan_status to HubSpot deal stage.
 */
function mapPlanStatusToStage(
  planStatus: string,
): string {
  switch (planStatus) {
    case "trial":
      return "Trial Started";
    case "active":
      return "Active Customer";
    case "past_due":
      return "Payment Issue";
    case "locked":
      return "Payment Issue";
    case "cancelled":
      return "Churned";
    default:
      return "Active Customer";
  }
}

/**
 * Create or update a deal for a company based on plan_status.
 */
async function upsertDeal(
  companyId: string,
  dealProperties: HubSpotDealProperties,
): Promise<string | null> {
  const t = token();
  if (!t) return null;

  try {
    const existingId = await findDealByCompanyId(companyId);
    if (existingId === undefined) return null; // search failed, give up

    if (existingId === null) {
      // Create new deal in the Onboarding pipeline
      const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({ properties: dealProperties }),
      });

      if (!res.ok) {
        console.warn("[hubspot] deal create failed:", res.status);
        return null;
      }

      const json = (await res.json()) as { id?: string };
      return json.id ?? null;
    } else {
      // Update existing deal
      const res = await fetch(
        `${HUBSPOT_API}/crm/v3/objects/deals/${existingId}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${t}`,
          },
          body: JSON.stringify({ properties: dealProperties }),
        },
      );

      if (!res.ok) {
        console.warn("[hubspot] deal patch failed:", res.status);
        return null;
      }

      return existingId;
    }
  } catch (err) {
    console.warn("[hubspot] upsertDeal threw:", err);
    return null;
  }
}

/**
 * Sync a facility to HubSpot as a Company, Contact, and Deal.
 *
 * This is a best-effort, fire-and-forget operation. All API calls
 * are wrapped in try/catch and logged to Sentry if they fail.
 * A failure in any step does not prevent subsequent steps from running.
 */
export async function syncFacilityToHubSpot(facilityId: string): Promise<void> {
  const t = token();
  if (!t) {
    // Token not configured — silent no-op so dev environments work
    // without needing a HubSpot account.
    return;
  }

  try {
    // Create service-role Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.warn(
        "[hubspot] Supabase credentials not configured, skipping sync",
      );
      return;
    }

    const supabase = createClient<Database>(supabaseUrl, serviceRoleKey);

    // 1. Fetch facility + facility_config
    const { data: facility, error: facilityError } = await supabase
      .from("facilities")
      .select("id, name, address_line1, created_at")
      .eq("id", facilityId)
      .maybeSingle();

    if (facilityError || !facility) {
      console.warn(
        "[hubspot] failed to fetch facility:",
        facilityError?.message,
      );
      return;
    }

    const { data: config, error: configError } = await supabase
      .from("facility_config")
      .select("stripe_customer_id, plan_status, plan_tier, trial_ends_at, seat_count")
      .eq("facility_id", facilityId)
      .maybeSingle();

    if (configError) {
      console.warn("[hubspot] failed to fetch facility_config:", configError.message);
    }

    // 2. Fetch owner user_profile (admin role)
    const { data: adminProfile, error: adminProfileError } = await supabase
      .from("user_profiles")
      .select("user_id")
      .eq("facility_id", facilityId)
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();

    if (adminProfileError) {
      console.warn("[hubspot] failed to fetch admin profile:", adminProfileError.message);
    }

    let adminEmail = "";
    if (adminProfile?.user_id) {
      try {
        const { data: adminUser } = await supabase.auth.admin.getUserById(
          adminProfile.user_id,
        );
        adminEmail = adminUser.user?.email ?? "";
      } catch (err) {
        console.warn("[hubspot] failed to fetch admin user:", err);
        // TODO: email from auth.users is unreachable in this context;
        // consider using a user_profiles.email column or a separate lookup.
      }
    }

    const stripeCustomerId = config?.stripe_customer_id;
    const planStatus = config?.plan_status ?? "trial";
    const planTier = config?.plan_tier ?? "single_facility";
    const trialEndsAt = config?.trial_ends_at;
    const seatCount = config?.seat_count ?? 1;

    // 3. Build and upsert Company
    let companyId: string | null = null;
    if (stripeCustomerId) {
      const companyProps: HubSpotCompanyProperties = {
        name: facility.name,
        address: facility.address_line1 || undefined,
        rr_plan_status: planStatus,
        rr_plan_tier: planTier,
        rr_stripe_customer_id: stripeCustomerId,
      };

      companyId = await upsertCompany(stripeCustomerId, companyProps);
    }

    // 4. Build and upsert Contact
    let contactId: string | null = null;
    if (adminEmail) {
      const nameParts = adminProfile?.user_id ? [adminEmail.split("@")[0]] : [];
      const contactProps: HubSpotContactProperties = {
        email: adminEmail,
        firstname: nameParts[0] ?? adminEmail,
        lastname: "", // TODO: split from full_name if available
        company: facility.name,
        rr_plan_status: planStatus,
        rr_plan_tier: planTier,
        rr_trial_ends_at: trialEndsAt ?? undefined,
        rr_seat_count: String(seatCount),
        rr_signup_date: facility.created_at ?? undefined,
      };

      contactId = await upsertContact(contactProps);

      // 5. Associate Contact → Company
      if (contactId && companyId) {
        await associateContactToCompany(contactId, companyId);
      }
    }

    // 6. Create or update Deal
    if (companyId) {
      const stage = mapPlanStatusToStage(planStatus);
      const dealProps: HubSpotDealProperties = {
        dealname: `${facility.name} - Onboarding`,
        dealstage: stage,
      };

      await upsertDeal(companyId, dealProps);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[hubspot] syncFacilityToHubSpot threw:", message);
    Sentry.captureException(err, { tags: { context: "hubspot-sync" } });
  }
}
