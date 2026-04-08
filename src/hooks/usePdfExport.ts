"use client";

import { useState } from "react";

export function usePdfExport() {
  const [isExporting, setIsExporting] = useState(false);

  function downloadPdf(opts: { base64: string; filename: string }) {
    const link = document.createElement("a");
    link.href = `data:application/pdf;base64,${opts.base64}`;
    link.download = opts.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return { downloadPdf, isExporting, setIsExporting };
}
