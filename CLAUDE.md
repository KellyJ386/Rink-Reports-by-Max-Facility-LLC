# RinkReports 3.0 — CLAUDE.md

## Project Identity
- Product: RinkReports by Max Facility LLC
- Repo: Rink-Reports-by-Max-Facility-LLC
- Stack: Next.js 15 App Router, TypeScript strict, tRPC, Supabase, Tailwind, Dexie.js
- Deploy: Vercel

## Non-Negotiable Rules — Read Before Writing Any Code

### 1. facility_id is NEVER accepted from client input
It is ALWAYS read from `ctx.facilityId` in tRPC context.
The context reads it from `user_profiles` in Supabase.
Any code that accepts facility_id from a form, URL param, 
or request body is a bug. Reject it.

### 2. No hardcoded dropdown values anywhere in module code
ALL values (operation types, tab names, thresholds, positions,
equipment types, compressor counts) come from the 
`facility_config` table via the `useModuleConfig()` hook.
If a module has a hardcoded string list, it is wrong.

### 3. Offline-first write pattern — mandatory for all forms
Every form submission writes to Dexie (IndexedDB) first.
Server sync is background-only.
The UI never waits for a server response to show success.
Pattern: write local → show success → nudge sync engine.

### 4. No seed scripts for business data
The only seed allowed is the facility row and module list.
All configuration (tabs, dropdowns, thresholds) is entered
by the facility admin through the Admin Control Center UI.

### 5. No TypeScript `any`
Use `unknown` and narrow it. Use Zod for runtime validation.
`any` is a build error.

### 6. No mock data
Never generate placeholder data, fake records, or example
submissions. If a module has no data, it shows an empty state.

### 7. tRPC only — no raw API routes for app data
The only exception is `/api/sync` (offline sync endpoint)
and `/api/trpc` (the tRPC handler itself).

### 8. RLS is enforced at the database AND the server
Every tRPC procedure uses `ctx.facilityId` from context.
RLS policies use `get_user_facility_id()` function.
Both layers must be present. Neither replaces the other.

## Brand / Design Tokens
- Navy Blue:    #003B6F  (primary, headers, nav, buttons)
- Action Green: #4DFF00  (success, CTAs, positive indicators)
- Wolf Grey:    #A5ACAF  (secondary text, borders, disabled)
- Alert Yellow: #FFB800  (warnings, over-threshold)
- Alert Red:    #F42A2A  (errors, critical alerts)
- Dark BG:      #001122  (dark mode background)

## Project Structure
src/
  app/
    (auth)/              # login, forgot-password, reset-password
    (dashboard)/         # all protected routes
      dashboard/
      daily-reports/
      ice-depth/
      ice-operations/
      scheduling/
      incidents/
      refrigeration/
      air-quality/
      admin/             # Admin Control Center
    api/
      trpc/[trpc]/       # single tRPC handler
      sync/              # offline sync endpoint
  server/
    trpc/
      routers/           # one file per module
        index.ts         # root router
        admin.ts         # config CRUD
      context.ts         # facility_id injected here
      trpc.ts            # procedures + middleware
  lib/
    offline/
      db.ts              # Dexie schema
      sync-engine.ts     # sync worker
    database.types.ts    # generated Supabase types
    supabase.ts          # browser client
    supabase-server.ts   # server-only client
  modules/               # self-contained per module
    ice-operations/
      components/
      hooks/
      schema.ts
    refrigeration/
    daily-reports/
    air-quality/
    ice-depth/
    incidents/
    scheduling/
    communications/
  components/
    ui/                  # primitives only
    layout/              # Header, Sidebar, MobileNav
  hooks/
    useModuleConfig.ts   # reads facility_config — used everywhere

## Module Descriptions

### 1. 📋 Daily Reports
The primary day-to-day operational log. Staff document activity, notes, and conditions for their assigned area each day.

**Structure**
- Tab Bar — horizontal scrollable tab navigation, one tab per configured area (up to 20). Tennity's 10: Front Desk, Pro Shop, Custodial, Skate Sharpening, Concessions, Event Set Up, Learn to Skate, Public Skate, Locker Rooms, Building Services.
- Each tab is independent — saving one does not affect others.
- The full report locks at end of day and cannot be edited after submission.

**Fields (per tab)**
- Date — auto-populated, read-only, pulls current date
- Area Name — auto-populated header from admin config, read-only
- Staff on Duty — text input or staff selector dropdown (assigned staff for that area)
- General Notes — large multi-line text area for open-ended shift narrative
- Equipment Status — dropdown (Operational / Needs Attention / Out of Service) per relevant equipment items configured by admin
- Checklist Items — series of toggle checkboxes for admin-configured tasks specific to that area (e.g., "Skates organized and accounted for" in Pro Shop, "Ice surface inspected before public skate" in Public Skate)
- Incident Flag — toggle (Yes / No) — did anything occur that may require an incident report?
- Save Tab Button — saves that individual tab's data without affecting others
- Submit Report Button — appears when all required tabs are complete; locks the full daily report

### 2. 🧊 Ice Depth
Precision ice thickness tracking with spatial visualization.

**Structure**
- Template Selector — dropdown at top of screen; selects from up to 8 admin-created measurement templates (e.g., "Standard 60-Point," "Corner Focus," "Center Ice Only")
- Interactive Rink Diagram — full SVG rink surface rendered to screen; users tap/click measurement points sequentially
- Point Markers — numbered 1–60; each marker is tappable and cycles through states (unmeasured → active → recorded)
- Measurement Input — numeric text input (decimal allowed) that appears when a point is tapped; unit label (inches or mm) displayed inline based on admin config
- Bluetooth Caliper Connect Button — initiates pairing via CaliperAdapter; auto-populates the active measurement point when a reading is taken from the device
- Heat Map Toggle — switches the rink diagram view from numbered markers to a color-gradient heat map showing thickness distribution across the surface
- Session Notes — multi-line text area for general observations about the ice surface
- Resurfacing Status — dropdown (Pre-Resurface / Post-Resurface / Mid-Session) to contextualize when the measurement was taken
- Save Draft Button — saves progress without finalizing
- Complete & Export Button — finalizes the session and sends the PDF to the Communications module for delivery

### 3. ⛸️ Ice Operations
Time-stamped log of all on-ice maintenance activities.

**4-Tab Navigation:** Log Entry | History | Equipment | Summary

**Log Entry Tab**
- Operation Type — dropdown populated by Admin config; options are: Ice Cut, Circle Check, Edging, Blade Change (Patch permanently removed)
- Equipment Used — dropdown populated by Admin config; lists facility's actual equipment (e.g., Zamboni 500, Olympia Pro, etc.)
- Operator — dropdown of active staff pulled from the Employee Scheduling module roster
- Start Time — auto-populated on entry creation; read-only timestamp
- End Time — auto-populated when entry is marked complete, or manually tappable to record
- Rink Surface Condition (Pre) — dropdown (Good / Fair / Poor / Concerning)
- Rink Surface Condition (Post) — dropdown (Good / Fair / Poor / Concerning)
- Water Temperature — numeric text input (°F or °C per admin config) for resurfacing entries
- Notes — single-line or multi-line text input for operation-specific observations
- Complete Entry Button — finalizes and timestamps the log entry

**History Tab**
- Date Range Picker — select start and end date to filter history
- Operation Type Filter — dropdown (All / Ice Cut / Circle Check / Edging / Blade Change)
- Equipment Filter — dropdown (All / specific equipment)
- Operator Filter — dropdown (All / specific staff member)
- Results List — scrollable log of past entries showing operation type, operator, equipment, timestamps, and pre/post conditions
- Entry Row Tap — expands to show full detail of that log entry

**Equipment Tab**
- Equipment List — read-only list of admin-configured equipment
- Status per Equipment — dropdown per item (Operational / Scheduled Maintenance / Out of Service)
- Last Serviced — date picker per equipment item
- Notes per Equipment — text input for equipment-specific notes

**Summary Tab**
- Date Range Selector — dropdown (Today / This Week / This Month / Custom)
- Operations Count by Type — read-only numeric display per operation type
- Total Ice Time — calculated read-only field (sum of all operation durations)
- Operator Activity Summary — list of operators with operation counts
- Export Button — sends summary PDF to Communications module

### 4. ❄️ Refrigeration
Shift-based plant monitoring log. Compressor count and readings per shift are Admin-configurable.

**Structure**
- Shift Selector — dropdown (Morning / Afternoon / Evening / Night or custom shift names set by admin)
- Date — auto-populated, read-only
- Operator Name — dropdown from active staff roster

**Per Compressor** (repeating section, count set by admin)
Each compressor renders as its own card with the following fields:
- Compressor Label — read-only header (e.g., "Compressor 1," "Compressor 2") set by admin
- Suction Pressure — numeric text input (PSI); normal range displayed inline in muted text
- Discharge Pressure — numeric text input (PSI); normal range inline
- Oil Pressure — numeric text input (PSI); normal range inline
- Amps — numeric text input (A); normal range inline
- Oil Temperature — numeric text input (°F or °C); normal range inline
- Status Indicator — auto-calculated icon/color (green = within range / yellow = borderline / red = out of range) based on entered values vs. normal ranges

**System-Wide Fields** (one per reading, not per compressor)
- Brine Supply Temperature — numeric text input; normal range inline
- Brine Return Temperature — numeric text input; normal range inline
- Brine Flow Rate — numeric text input; normal range inline
- Ice Surface Temperature — numeric text input (°F or °C); normal range inline
- Condenser Inlet Temperature — numeric text input; normal range inline
- Condenser Outlet Temperature — numeric text input; normal range inline
- Condenser Pressure — numeric text input (PSI); normal range inline

**Bottom Controls**
- General Notes — multi-line text area for shift observations or anomalies
- Alert Flag Toggle — toggle (On / Off) — flag this reading for supervisor review
- Save Draft Button — saves without submitting
- Submit Reading Button — finalizes and timestamps the reading for this shift

### 5. 🌬️ Air Quality
CO and NO₂ monitoring with escalation enforcement.

**Structure**
- Date & Time — auto-populated, read-only
- Recorded By — dropdown from active staff roster
- Sensor Location — dropdown of admin-configured monitoring zones (e.g., Player Bench, Lobby, Resurfacing Doors)

**Readings**
- CO Level — numeric text input (PPM); current threshold tier displayed inline
- NO₂ Level — numeric text input (PPM); current threshold tier displayed inline
- Tier Indicator — auto-calculated read-only badge that updates live as values are entered:
  - 🟢 Tier 1 — Normal — no action required
  - 🟡 Tier 2 — Elevated — increase ventilation, monitor closely
  - 🟠 Tier 3 — High — suspend ice resurfacing, notify manager
  - 🔴 Tier 4 — Critical — evacuate, contact authorities

**Escalation Response Fields** (appear dynamically based on tier reached)
- Actions Taken — multi-line text area (required at Tier 2+)
- Manager Notified Toggle — toggle Yes/No (required at Tier 3+)
- Facility Evacuated Toggle — toggle Yes/No (required at Tier 4)
- Authorities Contacted Toggle — toggle Yes/No (required at Tier 4)
- Resolution Notes — multi-line text area

**Bottom Controls**
- Notes — general text area for ambient observations
- Save & Submit Button — finalizes the reading
- Reading History Button — navigates to scrollable log of past readings with tier indicators

### 6. 🚑 Incident Reporting
Two distinct forms — Incident and Accident — for documenting events.

**Form Selector**
- Report Type Toggle / Selector — toggle or segmented control: Incident (property, near-miss, behavioral) vs. Accident (physical injury)

**Incident Form Fields**
- Date & Time — auto-populated, editable
- Reported By — dropdown from staff roster
- Location on Premises — dropdown of admin-configured zones (e.g., Ice Surface, Lobby, Locker Room, Pro Shop)
- Incident Type — dropdown (Property Damage / Near-Miss / Behavioral / Equipment / Other)
- Persons Involved — text input (name(s) of involved parties; free text, not tied to staff roster)
- Witnesses — text input (free text)
- Description of Incident — large multi-line text area (required)
- Immediate Action Taken — multi-line text area
- Follow-Up Required Toggle — toggle Yes/No
- Follow-Up Notes — text input (visible when Follow-Up Required = Yes)
- Submit Button

**Accident Form Fields**
All Incident fields above, plus:
- Injured Person Name — text input
- Injured Person Type — dropdown (Staff / Skater / Spectator / Contractor / Other)
- Age of Injured — numeric text input
- Nature of Injury — multi-line text area (describe the injury)
- Body Diagram — interactive SVG human figure (front and back views); user taps to place markers on the affected body region(s); markers are labeled and listed below the diagram. No photos.
- First Aid Administered Toggle — toggle Yes/No
- First Aid Details — text input (visible when Yes)
- EMS Called Toggle — toggle Yes/No
- EMS Details — text input (agency, arrival time — visible when Yes)
- Transported to Hospital Toggle — toggle Yes/No
- Hospital Name — text input (visible when Yes)
- Submit Button

### 7. 📅 Employee Scheduling
Full scheduling lifecycle for up to 200 staff across 4 operational layers.

**Layer 1 — Availability**
- Staff Availability Grid — each staff member sees their own week-view grid
- Day/Time Blocks — tappable half-hour or hour blocks per day; toggle between Available / Unavailable / Preferred
- Recurring Availability Toggle — toggle to apply the same availability pattern every week
- Submit Availability Button

**Layer 2 — Auto-Suggest (Manager View)**
- Week Selector — date picker to choose the scheduling week
- Generate Schedule Button — triggers auto-suggest algorithm based on submitted availability, position requirements, and certifications
- Suggested Schedule Grid — week-view grid with staff names on Y-axis, days/times on X-axis; suggested shifts populated as color-coded blocks
- Conflict Indicators — red flags on any suggested shift that conflicts with availability or certification gaps

**Layer 3 — Grid Edit (Manager View)**
- Drag-and-Drop Shift Blocks — managers can drag shifts to different time slots or staff rows
- Add Shift Button — opens modal with fields:
  - Staff Member — dropdown
  - Position — dropdown (admin-configured positions)
  - Date — date picker
  - Start Time — time picker
  - End Time — time picker
  - Certification Required Toggle — auto-checked based on position config
- Remove Shift Button — removes a shift block (confirmation prompt)
- Notes per Shift — optional text input on each shift block
- Certification Warning Banner — appears if a shift is assigned to staff missing required certification for that position

**Layer 4 — Live Board (All Staff)**
- Published Schedule View — read-only week-view grid showing all published shifts
- My Shifts Highlight — logged-in staff member's own shifts highlighted distinctly
- Filter by Position — dropdown filter to view only specific positions
- Filter by Staff Member — dropdown (manager view only)

**Publishing Controls** (GM / Admin / Manager only)
- Review & Publish Button — opens confirmation screen showing full schedule before publish
- Publish Button — makes schedule live to all staff; no auto-publish, human must confirm
- Unpublish Button — reverts to draft state

### 8. 📡 Communications
Internal document delivery and PDF generation hub.

**Structure**
- Inbox / Sent Toggle — segmented control switching between received and sent communications
- New Message Button — opens compose view

**Compose View**
- Recipient(s) — dropdown multi-select from staff roster (internal only)
- Subject — single-line text input
- Message Body — multi-line rich text area (basic formatting: bold, italic, bullet list)
- Attach Report Dropdown — dropdown to attach a finalized module report (Daily Report, Ice Depth session, Refrigeration reading, etc.) as a PDF
- Send Button

**PDF Generation** (triggered from other modules)
Every generated PDF automatically includes the Universal Module Header:
- Facility Name — pulled from admin config, read-only
- User Name — pulled from authenticated session
- Module Name — auto-populated
- Date & Time — live at time of generation
- Outdoor Temperature — auto-fetched via Open-Meteo + Zippopotam.us (no API key required); displayed in °F or °C per admin config

**Message List View**
- Message Rows — each row shows sender, subject, date/time, and read/unread indicator
- Tap to Open — expands full message thread
- Attached PDF Link — tappable to open/download the attached report PDF

### 9. 🔧 Admin Control Center
The configuration layer that powers every other module.

**10 Configuration Sections:**
1. Facility Profile — Facility name, address, zip code (used for weather geocoding), contact info, unit preferences (°F/°C, inches/mm)
2. Daily Report Tabs — Add/remove/rename tabs (up to 20); configure checklist items and equipment status fields per tab; set required vs. optional fields
3. Ice Operations Config — Add/remove operation types (Ice Cut, Circle Check, Edging, Blade Change) and equipment names/labels
4. Ice Depth Templates — Create/edit up to 8 measurement templates; define point count and layout per template
5. Refrigeration Config — Set number of compressors; set shift names and count; set normal operating ranges per field
6. Air Quality Thresholds — View jurisdictional minimums (read-only floor); set facility-level thresholds per tier (can only tighten, not loosen); configure monitoring zone names
7. Positions & Certifications — Define staff positions; attach required certifications per position; certifications referenced in scheduling
8. Staff Roster Management — Add/remove/edit staff; assign roles (Super Admin / Admin / Manager / Staff); assign positions; record certifications. Manager role included here.
9. Shift Configuration — Define shift names and times used across Refrigeration and Scheduling modules
10. Branding & Display — Facility logo upload; color theme selection; PDF header customization

## Phase Gates
### Phase 0 — Foundation (current)
Supabase schema, tRPC, Auth, Dexie, Admin config API

### Phase 1 — Admin Control Center UI
Facility settings, module toggles, per-module config panels,
user management

### Phase 2 — Daily Reports + Ice Operations
### Phase 3 — Refrigeration + Air Quality
### Phase 4 — Ice Depth + Incidents
### Phase 5 — Scheduling + Communications
### Phase 6 — Platform (Stripe, HubSpot, multi-facility)

## Environment Variables Needed
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_TRPC_URL

## Current Phase
PHASE 0 — Do not build module UI until Phase 0 exit gate passes.
