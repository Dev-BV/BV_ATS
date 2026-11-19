import { saveBlob } from "./api";

// Quotes a value and neutralises spreadsheet formulas (a value such as =HYPERLINK(...) would otherwise run in Excel)
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s = String(v).replace(/[\r\n]+/g, " ");
  if (typeof v === "string" && /^[=+\-@\t]/.test(s)) s = "'" + s;
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvDownload(filename: string, rows: (string | number | null)[][]) {
  const text = rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  saveBlob(new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" }), filename);   // BOM: Excel reads UTF-8 correctly
}
