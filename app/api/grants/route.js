import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

let grantsData = null;

function loadData() {
  if (grantsData) return grantsData;
  const paths = [
    join(process.cwd(), "data", "federal-grants.json"),
    join(process.cwd(), "..", "resilience-iq", "data", "federal-grants.json"),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        grantsData = JSON.parse(readFileSync(p, "utf-8"));
        return grantsData;
      } catch (e) {
        console.error("Error loading grants data:", e);
      }
    }
  }
  return null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const fips = searchParams.get("fips");

  const raw = loadData();
  if (!fips || !raw) {
    return NextResponse.json({ awards: [], summary: null });
  }

  // Structure: { metadata, summary: { fips: {...} }, counties: [ { fips_code, total_grant_obligations, categories: {...} } ] }
  const counties = raw.counties || [];
  const county = counties.find((c) => c.fips_code === fips);

  if (!county) {
    return NextResponse.json({ awards: [], summary: null });
  }

  // Collect all awards from categories
  const categories = county.categories || {};
  const allAwards = [];
  const categoryBreakdown = [];

  for (const [catName, catData] of Object.entries(categories)) {
    const awards = catData?.awards || [];
    const catTotal = catData?.total_obligations || catData?.obligation_amount || 0;
    categoryBreakdown.push({
      name: catName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      amount: catTotal,
      count: awards.length,
    });
    for (const a of awards) {
      allAwards.push({
        recipient: a.recipient_name || a.recipient || "Unknown",
        amount: parseFloat(a.award_amount || a.obligation_amount || a.total_obligation || 0),
        description: a.description || a.award_description || "",
        agency: a.awarding_agency || a.funding_agency || catName.replace(/_/g, " "),
        category: catName.replace(/_/g, " "),
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
