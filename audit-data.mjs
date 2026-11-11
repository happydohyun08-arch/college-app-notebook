// node audit-data.mjs: 학교별 조사 대기 목록과 자료 보유 현황을 다시 만든다.
import fs from "node:fs";
const root = new URL("./", import.meta.url);
const schools = JSON.parse(fs.readFileSync(new URL("schools.json", root), "utf8"));
const followup = JSON.parse(fs.readFileSync(new URL("research/cds-followup.json", root), "utf8"));
const pending = new Map(followup.filter((s) => s.status.startsWith("not_applied")).map((s) => [s.id, s]));
const fields = ["admit_rate", "sat25", "sat75", "act25", "act75", "gpa_avg"];
const rows = schools.map((s) => ({
  id: s.id,
  name: s.name,
  status: pending.has(s.id) ? "source_access_pending" : s.cds_checked ? "reviewed_this_batch" : s.profile_checked ? "official_campus_data" : s.year.startsWith("CDS") ? "prior_cds_record" : "cds_review_pending",
  year: s.year,
  source: s.source,
  missing_fields: fields.filter((k) => s[k] == null),
  gpa_status: s.gpa_status ?? (s.gpa_avg != null ? "prior_reported_value" : "not_reviewed"),
  open_admission: s.open_admission === true,
}));
const summary = {
  total: rows.length,
  cds_records: schools.filter((s) => s.year.startsWith("CDS")).length,
  reviewed_this_batch: rows.filter((s) => s.status === "reviewed_this_batch").length,
  source_access_pending: rows.filter((s) => s.status === "source_access_pending").length,
  cds_review_pending: rows.filter((s) => s.status === "cds_review_pending").length,
  missing_fields: Object.fromEntries(fields.map((k) => [k, rows.filter((s) => s.missing_fields.includes(k)).length])),
};
fs.writeFileSync(new URL("research/data-coverage.json", root), JSON.stringify({ summary, schools: rows }, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
