import jsPDF from "jspdf";
import "jspdf-autotable";

export function generateBriefingPDF({
  jurisdiction,
  lausData,
  resilienceScore,
  aiExposure,
  aiReadiness,
  nationalAvg,
  qcewData,
  peers,
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const colors = {
    green: [27, 107, 74],
    darkText: [26, 26, 24],
    gray: [107, 107, 102],
    lightGray: [232, 230, 225],
    red: [196, 61, 61],
    amber: [193, 122, 26],
    accent: [27, 107, 74],
  };

  // Helper functions
  const addLine = (thickness = 0.3) => {
    doc.setDrawColor(...colors.lightGray);
    doc.setLineWidth(thickness);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;
  };

  const checkPage = (needed = 30) => {
    if (y + needed > 275) {
      doc.addPage();
      y = margin;
    }
  };

  const county = jurisdiction?.county_name || "County";
  const state = jurisdiction?.state_abbr || "US";
  const fips = jurisdiction?.fips_code || "00000";
  const latest = lausData?.length > 0 ? lausData[lausData.length - 1] : null;
  const rate = latest ? parseFloat(latest.unemployment_rate) : null;
  const laborForce = latest ? parseInt(latest.labor_force) : 0;
  const employed = latest ? parseInt(latest.employed) : 0;
  const score = resilienceScore ? parseFloat(resilienceScore.overall_score) : null;
  const exposureScore = aiExposure ? parseFloat(aiExposure.aige_score) : 0;
  const readinessScore = aiReadiness ? parseFloat(aiReadiness.readiness_score) : 0;
  const workersAtRisk = Math.round(employed * exposureScore * 0.35);
  const wagesAtRisk = workersAtRisk * 48000;
  const readinessGap = readinessScore - exposureScore * 100;

  // === HEADER ===
  doc.setFontSize(10);
  doc.setTextColor(...colors.gray);
  doc.text("RESILIENCE IQ", margin, y);
  doc.text("CONFIDENTIAL BRIEFING", pageWidth - margin, y, { align: "right" });
  y += 3;
  addLine(0.5);

  // === TITLE ===
  doc.setFontSize(22);
  doc.setTextColor(...colors.darkText);
  doc.text(`${county}, ${state}`, margin, y + 6);
  y += 8;
  doc.setFontSize(11);
  doc.setTextColor(...colors.gray);
  doc.text("Economic Resilience & AI Workforce Impact Briefing", margin, y + 4);
  y += 6;

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  doc.setFontSize(9);
  doc.text(`Prepared ${dateStr}  |  FIPS ${fips}  |  Data: BLS LAUS, Census ACS 2023, QCEW Q1 2025`, margin, y + 3);
  y += 8;
  addLine(0.5);

  // === EXECUTIVE SUMMARY ===
  doc.setFontSize(13);
  doc.setTextColor(...colors.darkText);
  doc.text("Executive Summary", margin, y + 4);
  y += 10;

  doc.setFontSize(10);
  doc.setTextColor(...colors.darkText);
  const summaryText = `${county}'s unemployment rate stands at ${rate !== null ? rate.toFixed(1) : "N/A"}%${nationalAvg ? `, ${rate < nationalAvg ? "below" : "above"} the national average of ${nationalAvg}%` : ""}. The labor force is ${laborForce.toLocaleString()} with ${employed.toLocaleString()} employed. The county's Resilience Score is ${score !== null ? Math.round(score) : "N/A"}/100, ranking #${peers?.findIndex(p => p.isCurrent) + 1 || "N/A"} among peer counties.`;

  const summaryLines = doc.splitTextToSize(summaryText, contentWidth);
  doc.text(summaryLines, margin, y);
  y += summaryLines.length * 5 + 4;

  const aiSummary = `An estimated ${workersAtRisk.toLocaleString()} workers (${(exposureScore * 100).toFixed(0)}% of the workforce) face significant AI task displacement, representing $${(wagesAtRisk / 1000000).toFixed(0)}M in annual wages at risk. The county's AI readiness gap is ${readinessGap >= 0 ? "+" : ""}${readinessGap.toFixed(0)} (${readinessGap >= 0 ? "net prepared" : "underprepared"}).`;

  const aiLines = doc.splitTextToSize(aiSummary, contentWidth);
  doc.text(aiLines, margin, y);
  y += aiLines.length * 5 + 6;

  // === KEY METRICS TABLE ===
  addLine();
  doc.setFontSize(13);
  doc.setTextColor(...colors.darkText);
  doc.text("Key Economic Indicators", margin, y + 4);
  y += 10;

  const metricsData = [
    ["Unemployment Rate", rate !== null ? `${rate.toFixed(1)}%` : "N/A", nationalAvg ? `${nationalAvg}%` : "N/A"],
    ["Labor Force", laborForce.toLocaleString(), ""],
    ["Employed", employed.toLocaleString(), `${((employed / laborForce) * 100).toFixed(1)}% participation`],
    ["Resilience Score", score !== null ? `${Math.round(score)}/100` : "N/A", ""],
    ["AI Exposure Index", `${(exposureScore * 100).toFixed(0)}/100`, `P${aiExposure ? parseFloat(aiExposure.aige_percentile).toFixed(0) : "N/A"}`],
    ["AI Readiness Score", `${readinessScore.toFixed(0)}/100`, aiReadiness?.readiness_tier || "N/A"],
    ["Workers at AI Risk", workersAtRisk.toLocaleString(), `$${(wagesAtRisk / 1000000).toFixed(0)}M wages`],
    ["Readiness Gap", `${readinessGap >= 0 ? "+" : ""}${readinessGap.toFixed(0)}`, readinessGap >= 0 ? "Net prepared" : "Underprepared"],
  ];

  doc.autoTable({
    startY: y,
    head: [["Metric", "Value", "Context"]],
    body: metricsData,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 3, lineColor: colors.lightGray, lineWidth: 0.2 },
    headStyles: { fillColor: colors.accent, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: [250, 250, 248] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 }, 1: { cellWidth: 45 } },
  });
  y = doc.lastAutoTable.finalY + 8;

  // === AI WORKFORCE IMPACT ===
  checkPage(60);
  addLine();
  doc.setFontSize(13);
  doc.setTextColor(...colors.darkText);
  doc.text("AI Workforce Impact Analysis", margin, y + 4);
  y += 10;

  // Top exposed occupations
  if (aiExposure?.top_exposed_occupations?.length > 0) {
    doc.setFontSize(10);
    doc.setTextColor(...colors.gray);
    doc.text("Occupations Most Exposed to AI Disruption (Felten AIOE Methodology)", margin, y);
    y += 6;

    const occData = aiExposure.top_exposed_occupations
      .filter(o => (o.score || 0) >= 0.55)
      .slice(0, 7)
      .map((o, i) => [
        `${i + 1}`,
        o.title || "Unknown",
        o.soc || "",
        `${(o.score * 100).toFixed(0)}/100`,
        o.score >= 0.8 ? "High" : o.score >= 0.6 ? "Moderate" : "Low",
      ]);

    doc.autoTable({
      startY: y,
      head: [["#", "Occupation", "SOC Code", "Exposure", "Risk Level"]],
      body: occData,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: colors.lightGray, lineWidth: 0.2 },
      headStyles: { fillColor: [89, 55, 138], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 65 }, 4: { cellWidth: 22 } },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // AI Readiness indicators
  checkPage(40);
  if (aiReadiness) {
    doc.setFontSize(10);
    doc.setTextColor(...colors.gray);
    doc.text("AI Readiness Infrastructure (Census ACS 2023)", margin, y);
    y += 6;

    const readData = [
      ["Bachelor's Degree+", `${parseFloat(aiReadiness.bachelors_plus_pct).toFixed(1)}%`, "33%", parseFloat(aiReadiness.bachelors_plus_pct) > 33 ? "Above" : "Below"],
      ["Graduate Degree+", `${parseFloat(aiReadiness.graduate_plus_pct).toFixed(1)}%`, "13%", parseFloat(aiReadiness.graduate_plus_pct) > 13 ? "Above" : "Below"],
      ["Broadband Access", `${parseFloat(aiReadiness.broadband_pct).toFixed(1)}%`, "87%", parseFloat(aiReadiness.broadband_pct) > 87 ? "Above" : "Below"],
      ["Knowledge Workers", `${parseFloat(aiReadiness.stem_workforce_pct).toFixed(1)}%`, "39%", parseFloat(aiReadiness.stem_workforce_pct) > 39 ? "Above" : "Below"],
    ];

    doc.autoTable({
      startY: y,
      head: [["Indicator", "County", "National Avg", "Status"]],
      body: readData,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: colors.lightGray, lineWidth: 0.2 },
      headStyles: { fillColor: [43, 108, 176], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // === RECOMMENDED ACTIONS ===
  checkPage(50);
  addLine();
  doc.setFontSize(13);
  doc.setTextColor(...colors.darkText);
  doc.text("Recommended Actions", margin, y + 4);
  y += 10;

  const bPct = aiReadiness ? parseFloat(aiReadiness.bachelors_plus_pct) : 0;
  const bbPct = aiReadiness ? parseFloat(aiReadiness.broadband_pct) : 0;
  const retrainingCost = workersAtRisk * 4200;

  const actions = [
    {
      priority: "1",
      action: "AI Workforce Retraining Program",
      detail: `${workersAtRisk.toLocaleString()} workers need AI-readiness training. Est. investment: $${(retrainingCost / 1000000).toFixed(1)}M at $4,200/worker.`,
      timeline: "6-12 months",
    },
    {
      priority: "2",
      action: bbPct < 85 ? "Broadband Infrastructure Expansion" : "Digital Literacy Initiative",
      detail: bbPct < 85
        ? `${(100 - bbPct).toFixed(0)}% of households lack broadband. Apply for BEAD/NTIA grants.`
        : `Broadband at ${bbPct.toFixed(0)}%. Focus on AI tool training for existing workforce.`,
      timeline: bbPct < 85 ? "12-24 months" : "6-12 months",
    },
    {
      priority: "3",
      action: "Knowledge Economy Pipeline",
      detail: `${bPct.toFixed(0)}% have bachelor's+ (vs 33% national). ${bPct > 33 ? "Maintain" : "Expand"} post-secondary access and AI curriculum partnerships.`,
      timeline: "12-36 months",
    },
  ];

  const actionData = actions.map(a => [a.priority, a.action, a.detail, a.timeline]);
  doc.autoTable({
    startY: y,
    head: [["#", "Action", "Detail", "Timeline"]],
    body: actionData,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8.5, cellPadding: 3, lineColor: colors.lightGray, lineWidth: 0.2 },
    headStyles: { fillColor: colors.accent, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
    columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 42, fontStyle: "bold" }, 2: { cellWidth: 85 } },
  });
  y = doc.lastAutoTable.finalY + 8;

  // === FOOTER ===
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...colors.gray);
    doc.text(
      `Resilience IQ  |  ${county}, ${state}  |  ${dateStr}  |  Page ${i} of ${pageCount}`,
      pageWidth / 2,
      290,
      { align: "center" }
    );
    doc.text(
      "Sources: BLS LAUS, Census ACS 2023 5-Year, BLS QCEW Q1 2025, Felten et al. AIOE",
      pageWidth / 2,
      294,
      { align: "center" }
    );
  }

  // Save
  const filename = `Resilience_IQ_${county.replace(/\s+/g, "_")}_${state}_${today.toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
  return filename;
}
