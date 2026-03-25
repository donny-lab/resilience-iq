import { NextResponse } from "next/server";
import qcewRaw from "../../../data/qcew-data.json";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const fips = searchParams.get("fips");

  // Handle nested structure: { metadata, data: [...] } or flat array
  const data = Array.isArray(qcewRaw) ? qcewRaw : (Array.isArray(qcewRaw?.data) ? qcewRaw.data : []);

  if (!fips) {
    return NextResponse.json({ industries: [], error: "fips required" });
  }

  const industries = data
    .filter((d) => d.fips_code === fips || d.area_fips === fips)
    .sort((a, b) => (b.avg_employment || b.employment || 0) - (a.avg_employment || a.employment || 0));

  // Compute total employment for share calculation
  const totalEmp = industries.reduce((s, d) => s + (d.avg_employment || d.employment || 0), 0);

  const enriched = industries.map((d) => ({
    naics_code: d.naics_code || d.industry_code,
    industry_title: d.industry_title || `NAICS ${d.naics_code || d.industry_code}`,
    employment: d.avg_employment || d.employment || 0,
    establishments: d.total_establishments || d.establishments || 0,
    avg_weekly_wage: d.avg_weekly_wage || 0,
    share: totalEmp > 0 ? ((d.avg_employment || d.employment || 0) / totalEmp * 100) : 0,
    location_quotient: d.location_quotient || null,
    annual_wages: (d.avg_weekly_wage || 0) * 52,
  }));

  return NextResponse.json({
    industries: enriched,
    summary: {
      total_employment: totalEmp,
      total_establishments: industries.reduce((s, d) => s + (d.total_establishments || d.establishments || 0), 0),
      top_industry: enriched[0]?.industry_title || null,
      sector_count: enriched.length,
    },
  });
}
