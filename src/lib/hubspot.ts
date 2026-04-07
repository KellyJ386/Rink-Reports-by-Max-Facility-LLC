import "server-only";

/**
 * Best-effort HubSpot CRM client.
 *
 * RinkReports uses HubSpot to keep marketing + customer success in
 * sync with the production database. The integration is one-way and
 * non-blocking: every call here logs but never throws if the
 * HubSpot API is down or HUBSPOT_ACCESS_TOKEN is missing, so a
 * HubSpot outage cannot break facility creation or billing webhooks.
 *
 * What we sync:
 *   * createOrUpdateContact — on facility creation, the new admin's
 *     email becomes a HubSpot Contact with custom properties
 *     `facility_name`, `facility_id`, `subscription_status`, `plan`.
 *     Subsequent webhook events update the same Contact.
 */

interface HubSpotContactProperties {
  email: string;
  facility_name?: string;
  facility_id?: string;
  subscription_status?: string;
  plan?: string;
}

const HUBSPOT_API = "https://api.hubapi.com";

function token(): string | null {
  return process.env.HUBSPOT_ACCESS_TOKEN ?? null;
}

/**
 * Find a HubSpot Contact by email. Returns the contact id if found,
 * null if not found, undefined on hard failure (so the caller can
 * tell "not found" from "API down" if it cares — most callers don't).
 */
async function findContactByEmail(
  email: string,
): Promise<string | null | undefined> {
  const t = token();
  if (!t) return undefined;
  try {
    const res = await fetch(
      `${HUBSPOT_API}/crm/v3/objects/contacts/search`,
      {
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
      },
    );
    if (!res.ok) {
      console.warn("[hubspot] contact search failed:", res.status);
      return undefined;
    }
    const json = (await res.json()) as { results?: Array<{ id: string }> };
    return json.results?.[0]?.id ?? null;
  } catch (err) {
    console.warn("[hubspot] contact search threw:", err);
    return undefined;
  }
}

/**
 * Upsert a HubSpot Contact by email. Creates if missing, otherwise
 * patches the existing record. Best-effort, never throws.
 */
export async function createOrUpdateContact(
  props: HubSpotContactProperties,
): Promise<void> {
  const t = token();
  if (!t) {
    // Token not configured — silent no-op so dev environments work
    // without needing a HubSpot account.
    return;
  }
  if (!props.email || props.email.trim().length === 0) return;

  try {
    const existingId = await findContactByEmail(props.email);
    if (existingId === undefined) return; // search failed, give up

    const properties: Record<string, string> = { email: props.email };
    if (props.facility_name) properties.facility_name = props.facility_name;
    if (props.facility_id) properties.facility_id = props.facility_id;
    if (props.subscription_status)
      properties.subscription_status = props.subscription_status;
    if (props.plan) properties.plan = props.plan;

    if (existingId === null) {
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
      }
    } else {
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
      }
    }
  } catch (err) {
    console.warn("[hubspot] createOrUpdateContact threw:", err);
  }
}
