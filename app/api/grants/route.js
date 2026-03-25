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
  return [];
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const fips = searchParams.get("fips");

  const allData = loadData();
  if (!fips) {
    return NextResponse.json({ awards: [], summary: null, error: "fips required" });
  }

  // Match by FIPS - the grants data might use state+county codes or full FIPS
  const stateCode = fips.slice(0, 2);
  const countyCode = fips.slice(2);

  let awards = [];
  if (Array.isArray(allData)) {
    awards = allData.filter((a) => {
      // Try various matching strategies
      if (a.fips_code === fips) return true;
      if (a.county_fips === fips) return true;
      if (a.place_of_performance_county_fips === countyCode && a.place_of_performance_state_fips === stateCode) return true;
      if (a["Place of Performance County FIPS"] === countyCode && a["Place of Performance State FIPS"] === stateCode) return true;
      return false;
    });
  } else if (allData[fips]) {
    awards = allData[fips];
  }

  // Sort by amount descending
  awards = awards.sort((a, b) => {
    const amtA = Math.abs(parseFloat(a.award_amount || a["Award Amount"] || a.total_obligation || 0));
    const amtB = Math.abs(parseFloat(b.award_amount || b["Award Amount"] || b.total_obligation || 0));
    return amtB - amtA;
  }).slice(0, 50);

  const totalAmount = awards.reduce((s, a) => s + Math.abs(parseFloat(a.award_amount || a["Award Amount"] || a.total_obligation || 0)), 0);
  const agencies = [...new Set(awards.map(a => a.awarding_agency || a["Awarding Agency"] || "Unknown"))];

  return NextResponse.json({
    awards: awards.map(a => ({
      recipient: a.recipient_name || a["Recipient Name"] || "Unknown",
      amount: parseFloat(a.award_amount || a["Award Amount"] || a.total_obligation || 0),
      description: a.description || a["Description"] || "",
      agency: a.awarding_agency || a["Awarding Agency"] || "Unknown",
      start_date: a.start_date || a["Start Date"] || null,
      cfda: a.cfda_number || a["CFDA Number"] || null,
    })),
    summary: {
      total_awards: awards.length,
      total_amount: totalAmount,
      agencies: agencies.slice(0, 5),
    },
  });
}
