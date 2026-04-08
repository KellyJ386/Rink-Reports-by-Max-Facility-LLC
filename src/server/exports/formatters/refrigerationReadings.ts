import "server-only";

import type { CsvCell } from "@/server/exports/csv";

// Shape of a refrigeration_readings row.
// Columns: id, facility_id, submitted_by, submitted_at,
//   brine_supply, brine_return, brine_flow, ice_surface_temp,
//   condenser_temp, compressor_readings (JSONB array), local_id, created_at
//
// compressor_readings element shape:
//   {
//     compressor_id: string,
//     suction_pressure:   number | null,
//     discharge_pressure: number | null,
//     oil_pressure:       number | null,
//     amps:               number | null,
//     oil_temperature:    number | null
//   }
interface CompressorReading {
  compressor_id?: string;
  suction_pressure?: number | null;
  discharge_pressure?: number | null;
  oil_pressure?: number | null;
  amps?: number | null;
  oil_temperature?: number | null;
}

interface RefrigerationReadingRow {
  id: string;
  facility_id: string;
  submitted_by: string;
  submitted_at: string;
  brine_supply: number | null;
  brine_return: number | null;
  brine_flow: number | null;
  ice_surface_temp: number | null;
  condenser_temp: number | null; // TODO: column condenser_temp exists in migration
  compressor_readings: CompressorReading[] | null;
}

export type { RefrigerationReadingRow };

export function formatRefrigerationRows(rows: RefrigerationReadingRow[]): {
  headers: string[];
  rows: CsvCell[][];
} {
  const headers = [
    "Date",
    "Shift",           // TODO: column not found — no shift column in migration
    "Compressor #",
    "Suction PSI",
    "Discharge PSI",
    "Oil PSI",
    "Amps",
    "Oil Temp",
    "Brine Supply",
    "Brine Return",
    "Brine Flow",
    "Ice Surface Temp",
  ];

  const outputRows: CsvCell[][] = [];

  for (const reading of rows) {
    const date = reading.submitted_at
      ? reading.submitted_at.slice(0, 10)
      : null;
    const shift: CsvCell = null; // TODO: column not found — no shift column in migration

    const compressors = reading.compressor_readings ?? [];

    if (compressors.length === 0) {
      // Emit one row with facility-wide fields, no compressor data
      outputRows.push([
        date,
        shift,
        null,
        null,
        null,
        null,
        null,
        null,
        reading.brine_supply ?? null,
        reading.brine_return ?? null,
        reading.brine_flow ?? null,
        reading.ice_surface_temp ?? null,
      ]);
    } else {
      // Fan out — one output row per compressor entry
      for (let i = 0; i < compressors.length; i++) {
        const c = compressors[i];
        if (!c) continue;
        outputRows.push([
          date,
          shift,
          i + 1,
          c.suction_pressure ?? null,
          c.discharge_pressure ?? null,
          c.oil_pressure ?? null,
          c.amps ?? null,
          c.oil_temperature ?? null,
          reading.brine_supply ?? null,
          reading.brine_return ?? null,
          reading.brine_flow ?? null,
          reading.ice_surface_temp ?? null,
        ]);
      }
    }
  }

  return { headers, rows: outputRows };
}
