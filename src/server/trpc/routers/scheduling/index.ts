import "server-only";

import { router } from "@/server/trpc/trpc";

// Base procedures (migrated from the original single-file scheduling.ts)
import {
  listRoster,
  listPositions,
  listCertifications,
  getMyAvailability,
  saveMyAvailability,
  listFacilityAvailability,
  getScheduleForWeek,
  ensureDraftSchedule,
  publishSchedule,
  unpublishSchedule,
  createShift,
  updateShift,
  deleteShift,
  autoSuggest,
  previewImport,
  commitImport,
} from "./base";

// Sub-routers for new scheduling features
import { employeeRouter } from "./employees";
import { areaRouter } from "./areas";
import { templateRouter } from "./templates";
import { timeOffRouter } from "./timeOff";
import { swapRouter } from "./swaps";
import { scheduleNotificationRouter } from "./scheduleNotifications";
import { schedulingConfigRouter } from "./config";

/**
 * Scheduling router — merges the original base procedures with
 * new sub-routers for employees, areas, templates, time-off,
 * swaps, notifications, and config.
 *
 * The import path `@/server/trpc/routers/scheduling` resolves to
 * this index.ts — the root router import in routers/index.ts
 * does NOT need to change.
 */
export const schedulingRouter = router({
  // ------------------------------------------------------------------
  // Original base procedures (preserved 1:1 from scheduling.ts)
  // ------------------------------------------------------------------
  listRoster,
  listPositions,
  listCertifications,
  getMyAvailability,
  saveMyAvailability,
  listFacilityAvailability,
  getScheduleForWeek,
  ensureDraftSchedule,
  publishSchedule,
  unpublishSchedule,
  createShift,
  updateShift,
  deleteShift,
  autoSuggest,
  previewImport,
  commitImport,

  // ------------------------------------------------------------------
  // New sub-routers
  // ------------------------------------------------------------------
  employees: employeeRouter,
  areas: areaRouter,
  templates: templateRouter,
  timeOff: timeOffRouter,
  swaps: swapRouter,
  notifications: scheduleNotificationRouter,
  config: schedulingConfigRouter,
});
