import { NextResponse } from "next/server";
import grantsRaw from "../../../data/federal-grants.json";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const fips = searchParams.get("fips");

  if (!fips) {
    return NextResponse.json({ awards: [], summary: null });
  }

  // Structure: { metadata, summary, counties: [ { fips_code, total_grant_obligations, categories: {...} } ] }
  const counties = grantsRaw?.counties || [];
  const county = counties.find((c) => c.fips_code === fips);

  if (!county) {
    return NextResponse.json({ awards: [], summary: null });
  }

  // Collect all awards from categories
  const categories = county.categories || {};
  const allAwards = [];
  const categoryBreakdown = [];

  for (const [catName, catData] of Object.entries(categories)) {
    const topAwards = catData?.top_awards || catData?.awards || [];
    const catTotal = catData?.total_amount || catData?.total_obligations || 0;
    const catCount = catData?.count || topAwards.length || 0;
    const prettyName = catName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    categoryBreakdown.push({
      name: prettyName,
      amount: catTotal,
      count: catCount,
    });
    for (const a of topAwards) {
      allAwards.push({
        recipient: a.recipient_name || a.recipient || "Unknown",
        amount: parseFloat(a.award_amount || a.obligation_amount || a.total_obligation || a.amount || 0),
        description: a.description || a.award_description || "",
        agency: a.awarding_agency || a.funding_agency || prettyName,
        category: prettyName,
        start_date: a.start_date || null,
      });
    }
  }

  // Sort by amount
  allAwards.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  return NextResponse.json({
    awards: allAwards.slice(0, 50),
    summary: {
      total_awards: allAwards.length || county.total_awards_found || 0,
      total_amount: county.total_grant_obligations || 0,
      county_name: county.county_name || "",
      fiscal_year: county.fiscal_year || "FY2024",
      categories: categoryBreakdown,
    },
  });
}
