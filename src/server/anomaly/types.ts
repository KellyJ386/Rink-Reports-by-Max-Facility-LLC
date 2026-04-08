import "server-only";

export type DetectionResult = {
  facilityId: string;
  alertType: string;
  severity: "info" | "warning" | "critical";
  targetIdentifier?: string;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
};
