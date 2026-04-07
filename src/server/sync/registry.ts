import "server-only";
import type { SyncHandler } from "./types";
import dailyReportsHandler from "./handlers/daily-reports";
import iceOperationsHandler from "./handlers/ice-operations";
import airQualityHandler from "./handlers/air-quality";
import iceDepthHandler from "./handlers/ice-depth";
import incidentsHandler from "./handlers/incidents";
import refrigerationHandler from "./handlers/refrigeration";

export const handlerRegistry = new Map<string, SyncHandler>([
  [dailyReportsHandler.table, dailyReportsHandler],
  [iceOperationsHandler.table, iceOperationsHandler],
  [airQualityHandler.table, airQualityHandler],
  [iceDepthHandler.table, iceDepthHandler],
  [incidentsHandler.table, incidentsHandler],
  [refrigerationHandler.table, refrigerationHandler],
]);
