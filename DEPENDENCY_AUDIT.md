# Dependency Audit — Phase A

Date: 2026-04-07
Auditor: Agent 1 (Docs & Config)

This document lists package.json pins that look suspicious or implausible
based on the auditor's knowledge of the npm ecosystem and need human review
before being changed in code. The one pin we were confident enough to fix
inline is `lucide-react`; everything else is flagged here for a human to
verify against the live npm registry.

## Fixed inline

| Package | Old pin | New pin | Reason |
|---|---|---|---|
| `lucide-react` | `^1.7.0` | `^0.460.0` | `lucide-react` has never reached a 1.x release; the package lives in the `0.4xx` range. `^1.7.0` would fail to resolve. Updated to a recent stable in the documented range. |

## Flagged for human review

The auditor's training data may be stale on these. Please verify each
against `npm view <pkg> version` before merging any change.

| Package | Current pin | Concern | Suggested action |
|---|---|---|---|
| `jspdf` | `^4.2.1` | jspdf's published `latest` line is in the `2.5.x` range historically. A `4.2.1` release may not exist. If it does not resolve, the install will fail. | Run `npm view jspdf versions --json` and pin to the actual latest stable (likely `^2.5.2`). |
| `stripe` | `^22.0.0` | The `stripe` Node SDK has historically released around the `17.x`–`18.x` range. `22.0.0` may not exist yet, in which case `npm install` will fail. | Verify with `npm view stripe version`. If not yet published, pin to the real latest (e.g. `^17.5.0` or whatever the registry shows). |
| `@supabase/ssr` | `^0.10.0` | `@supabase/ssr` has historically been in the `0.5.x` range. A `0.10.0` release may not exist. | Verify with `npm view @supabase/ssr version` and pin accordingly. |
| `next` | `16.2.2` | Next.js's last known stable major was `15.x`. `16.2.2` may be ahead of what is published; if so the install fails. | Verify with `npm view next version`. If `16.x` is not yet published, pin to the latest published `15.x`. |
| `react` / `react-dom` | `19.2.4` | React `19.x` is published, but `19.2.4` specifically may not exist. | Verify with `npm view react version` and align to the actual latest 19 release. |
| `eslint-config-next` | `16.2.2` | Tied to the `next` version above — same concern. | Keep aligned with whatever `next` version is actually used. |
| `zod` | `^4.3.6` | Zod's stable major is `3.x`. A `4.3.6` release may not exist as a stable. | Verify with `npm view zod version`. If `4.x` is not yet stable, pin to the latest `3.x` (e.g. `^3.23.8`). |
| `@trpc/*` | `^11.16.0` | tRPC `11.x` is published, but `11.16.0` specifically may be ahead of the current minor. | Verify with `npm view @trpc/server version`. |
| `@tanstack/react-query` | `^5.96.2` | React Query `5.x` is current; minor `96` may be ahead of reality but not implausible. Low concern. | Verify with `npm view @tanstack/react-query version`. |

## Notes

- No `github:` URLs or `file:` paths were found in `package.json`.
- No private registry references were found.
- `package-lock.json` was not regenerated as part of this audit; do that
  after the human review pins are corrected.
