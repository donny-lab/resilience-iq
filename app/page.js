"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ============================================================
// DATA HOOKS (using Supabase JS client)
// ============================================================

function useJurisdiction(fips) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!fips) return;
    setLoading(true);
    supabase
      .from("jurisdictions")
      .select("*")
      .eq("fips_code", fips)
      .single()
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setData(data);
      })
      .finally(() => setLoading(false));
  }, [fips]);
  return { jurisdiction: data, loading };
}

function useLausData(fips, months = 24) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!fips) return;
    setLoading(true);
    supabase
      .from("bls_laus")
      .select("year,month,unemployment_rate,labor_force,employed,unemployed")
      .eq("fips_code", fips)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(months)
      .then(({ data: rows, error }) => {
        if (error) console.error(error);
        else setData((rows || []).reverse());
      })
      .finally(() => setLoading(false));
  }, [fips, months]);
  return { lausData: data, loading };
}

function useResilienceScore(fips) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!fips) return;
    setLoading(true);
    supabase
      .from("resilience_scores")
      .select("*")
      .eq("fips_code", fips)
      .order("computed_at", { ascending: false })
      .limit(1)
      .single()
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setData(data);
      })
      .finally(() => setLoading(false));
  }, [fips]);
  return { score: data, loading };
}

function usePeerScores(fips, currentScore) {
  const [data, setData] = useState([]);
  const [rank, setRank] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!fips || currentScore == null) return;
    setLoading(true);
    (async () => {
      try {
        const { count: higherCount } = await supabase
          .from("resilience_scores")
          .select("fips_code", { count: "exact", head: true })
          .gt("overall_score", currentScore);
        const { count: totalCount } = await supabase
          .from("resilience_scores")
          .select("fips_code", { count: "exact", head: true });
        setRank((higherCount || 0) + 1);
        setTotal(totalCount || 0);

        const lo = Math.max(0, currentScore - 8);
        const hi = Math.min(100, currentScore + 8);
        const { data: scores } = await supabase
          .from("resilience_scores")
          .select("fips_code,overall_score,trend")
          .gte("overall_score", lo)
          .lte("overall_score", hi)
          .order("overall_score", { ascending: false })
          .limit(50);

        const fipsList = (scores || []).map((s) => s.fips_code);
        const { data: jurisdictions } = await supabase
          .from("jurisdictions")
          .select("fips_code,county_name,state_abbr")
          .in("fips_code", fipsList);

        const nameMap = {};
        (jurisdictions || []).forEach((j) => { nameMap[j.fips_code] = j; });

        const sorted = (scores || []).sort((a, b) => parseFloat(b.overall_score) - parseFloat(a.overall_score));
        const currentIdx = sorted.findIndex((s) => s.fips_code === fips);
        const startIdx = Math.max(0, currentIdx - 3);
        const peers = sorted.slice(startIdx, startIdx + 8).map((s) => ({
          fips: s.fips_code,
          name: nameMap[s.fips_code]
            ? `${nameMap[s.fips_code].county_name}, ${nameMap[s.fips_code].state_abbr}`
            : s.fips_code,
          score: parseFloat(s.overall_score),
          isCurrent: s.fips_code === fips,
        }));
        setData(peers);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [fips, currentScore]);
  return { peers: data, rank, total, loading };
}

function useNationalAverage(year, month) {
  const [avg, setAvg] = useState(null);
  useEffect(() => {
    if (!year || !month) return;
    supabase
      .from("bls_laus")
      .select("unemployment_rate")
      .eq("year", year)
      .eq("month", month)
      .not("unemployment_rate", "is", null)
      .limit(1000)
      .then(({ data: rows, error }) => {
        if (error) { console.error(error); return; }
        if (rows && rows.length > 0) {
          const sum = rows.reduce((s, r) => s + parseFloat(r.unemployment_rate), 0);
          setAvg(parseFloat((sum / rows.length).toFixed(1)));
        }
      });
  }, [year, month]);
  return avg;
}

function useCountySearch() {
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const search = useCallback(async (query) => {
    if (!query || query.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("jurisdictions")
        .select("fips_code,county_name,state_abbr,state_name")
        .ilike("county_name", `%${query}%`)
        .order("county_name", { ascending: true })
        .limit(10);
      if (error) throw error;
      setResults(data || []);
    } catch (e) { console.error(e); }
    setSearching(false);
  }, []);
  return { results, search, searching };
}

function useWarnFilings(fips) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!fips) return;
    setLoading(true);
    supabase
      .from("warn_filings")
      .select("company_name,employees_affected,layoff_type,notice_date,effective_date,naics_code")
      .eq("fips_code", fips)
      .order("notice_date", { ascending: false })
      .limit(50)
      .then(({ data: rows, error }) => {
        if (error) console.error(error);
        else setData(rows || []);
      })
      .finally(() => setLoading(false));
  }, [fips]);
  return { warnFilings: data, loading };
}

function useBusinessActivity(fips) {
  const [data, setData] = useState({ registrations: [], summary: null });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!fips) return;
    setLoading(true);
    (async () => {
      try {
        const { data: regs } = await supabase
          .from("business_registrations")
          .select("entity_name,entity_type,status,registration_date,dissolution_date")
          .eq("fips_code", fips)
          .order("registration_date", { ascending: false })
          .limit(500);
        const rows = regs || [];
        const monthly = {};
        rows.forEach(r => {
          const date = r.status === "dissolved" ? r.dissolution_date : r.registration_date;
          if (!date) return;
          const key = date.slice(0, 7);
          if (!monthly[key]) monthly[key] = { new: 0, dissolved: 0 };
          if (r.status === "active") monthly[key].new++;
          else monthly[key].dissolved++;
        });
        const sortedMonths = Object.keys(monthly).sort().slice(-12);
        const summary = sortedMonths.map(m => ({
          month: m,
          new: monthly[m].new,
          dissolved: monthly[m].dissolved,
          net: monthly[m].new - monthly[m].dissolved,
        }));
        setData({ registrations: rows.slice(0, 20), summary });
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [fips]);
  return { bizData: data, loading };
}

function useAiBriefing(fips) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!fips) return;
    setLoading(true);
    supabase
      .from("ai_briefings")
      .select("headline,body,key_insights,model_version,created_at")
      .eq("fips_code", fips)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()
      .then(({ data, error }) => {
        if (error) setData(null);
        else setData(data);
      })
      .finally(() => setLoading(false));
  }, [fips]);
  return { briefing: data, loading };
}

function useStateComparison(stateAbbr) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!stateAbbr) return;
    setLoading(true);
    (async () => {
      try {
        const { data: counties } = await supabase
          .from("jurisdictions")
          .select("fips_code,county_name")
          .eq("state_abbr", stateAbbr)
          .order("county_name");
        const fipsList = (counties || []).map(c => c.fips_code);
        if (fipsList.length === 0) { setData([]); return; }
        const { data: scores } = await supabase
          .from("resilience_scores")
          .select("fips_code,overall_score,trend,trend_delta")
          .in("fips_code", fipsList)
          .order("overall_score", { ascending: false });
        const nameMap = {};
        (counties || []).forEach(c => { nameMap[c.fips_code] = c.county_name; });
        setData((scores || []).map(s => ({
          fips: s.fips_code,
          name: nameMap[s.fips_code] || s.fips_code,
          score: parseFloat(s.overall_score),
          trend: s.trend,
          trendDelta: s.trend_delta,
        })));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [stateAbbr]);
  return { stateData: data, loading };
}

// ============================================================
// AI DATA HOOKS
// ============================================================

function useAIExposure(fips) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!fips) return;
    setLoading(true);
    supabase
      .from("ai_exposure_scores")
      .select("*")
      .eq("fips_code", fips)
      .single()
      .then(({ data, error }) => {
        if (error) setData(null);
        else setData(data);
      })
      .finally(() => setLoading(false));
  }, [fips]);
  return { exposure: data, loading };
}

function useAIReadiness(fips) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!fips) return;
    setLoading(true);
    supabase
      .from("ai_readiness_indicators")
      .select("*")
      .eq("fips_code", fips)
      .single()
      .then(({ data, error }) => {
        if (error) setData(null);
        else setData(data);
      })
      .finally(() => setLoading(false));
  }, [fips]);
  return { readiness: data, loading };
}

function useAIStateComparison(stateAbbr) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!stateAbbr) return;
    setLoading(true);
    (async () => {
      try {
        const { data: counties } = await supabase
          .from("jurisdictions")
          .select("fips_code,county_name")
          .eq("state_abbr", stateAbbr)
          .order("county_name");
        const fipsList = (counties || []).map(c => c.fips_code);
        if (fipsList.length === 0) { setData([]); return; }
        const { data: exposure } = await supabase
          .from("ai_exposure_scores")
          .select("fips_code,aige_score,aige_percentile")
          .in("fips_code", fipsList)
          .order("aige_score", { ascending: false });
        const { data: readiness } = await supabase
          .from("ai_readiness_indicators")
          .select("fips_code,readiness_score,readiness_tier")
          .in("fips_code", fipsList);
        const nameMap = {};
        (counties || []).forEach(c => { nameMap[c.fips_code] = c.county_name; });
        const readinessMap = {};
        (readiness || []).forEach(r => { readinessMap[r.fips_code] = r; });
        setData((exposure || []).map(e => ({
          fips: e.fips_code,
          name: nameMap[e.fips_code] || e.fips_code,
          aigeScore: parseFloat(e.aige_score),
          aigePercentile: parseFloat(e.aige_percentile),
          readinessScore: readinessMap[e.fips_code] ? parseFloat(readinessMap[e.fips_code].readiness_score) : null,
          readinessTier: readinessMap[e.fips_code]?.readiness_tier || "Unknown",
        })));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [stateAbbr]);
  return { aiStateData: data, loading };
}

// ============================================================
// QCEW INDUSTRY DATA HOOK (from JSON API route)
// ============================================================
function useQCEWData(fips) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!fips) return;
    setLoading(true);
    fetch(`/api/qcew?fips=${fips}`)
      .then(r => r.json())
      .then(d => setData(d.industries || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [fips]);
  return { industries: data, loading };
}

// ============================================================
// FEDERAL GRANTS HOOK (from JSON API route)
// ============================================================
function useFederalGrants(fips) {
  const [data, setData] = useState({ awards: [], summary: null });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!fips) return;
    setLoading(true);
    fetch(`/api/grants?fips=${fips}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [fips]);
  return { grants: data, loading };
}

// ============================================================
// DESIGN SYSTEM
// ============================================================
const colors = {
  bg: "#FAFAF8", card: "#FFFFFF", cardBorder: "#E8E6E1",
  text: "#1A1A18", textSecondary: "#6B6B66", textTertiary: "#9C9A92",
  accent: "#1B6B4A", accentLight: "#E8F5EE", accentMid: "#3DA07A",
  scoreGreen: "#1B8F5A", scoreAmber: "#C17A1A", scoreRed: "#C43D3D",
  chartBlue: "#2B6CB0", chartBlueLine: "#3B82C4", chartBlueArea: "rgba(43, 108, 176, 0.08)",
  chartPeerLine: "#C4A23B", chartPeerDash: "4 3",
  chartGreen: "#2D8A5E", chartGreenArea: "rgba(45, 138, 94, 0.08)",
  chartCoral: "#C45B3B", chartCoralArea: "rgba(196, 91, 59, 0.06)",
  positive: "#1B7A4A", positiveBg: "#ECFAF2",
  caution: "#A06B1A", cautionBg: "#FFF8EC",
  neutral: "#5A6B7A", neutralBg: "#F0F2F5", warmGray: "#F5F4F1",
  aiPurple: "#6B46C1", aiPurpleLight: "#F3EEFB", aiPurpleMid: "#9F7AEA",
  aiBlue: "#2B6CB0", aiBlueLight: "#EBF4FF",
};

// ============================================================
// CHART COMPONENT
// ============================================================
function AreaChart({ data, xKey, yKeys, colors: chartColors, height = 220, peerKey, peerColor, peerDash }) {
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  if (!data || data.length < 2) return null;
  const padL = 48, padR = 16, padT = 16, padB = 32;
  const w = 600, h = height;
  const cw = w - padL - padR, ch = h - padT - padB;
  const allVals = data.flatMap(d => yKeys.map(k => d[k]).concat(peerKey ? [d[peerKey]] : [])).filter(v => v != null);
  const niceMin = Math.floor(Math.min(...allVals) * 10) / 10;
  const niceMax = Math.ceil(Math.max(...allVals) * 10) / 10;
  const niceRange = niceMax - niceMin || 1;
  const xScale = (i) => padL + (i / (data.length - 1)) * cw;
  const yScale = (v) => padT + ch - ((v - niceMin) / niceRange) * ch;
  const makePath = (key) =>
    data.map((d, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(d[key]).toFixed(1)}`).join(" ");
  const makeArea = (key) =>
    `${makePath(key)} L${xScale(data.length - 1).toFixed(1)},${(padT + ch).toFixed(1)} L${padL},${(padT + ch).toFixed(1)} Z`;
  const ticks = 5;
  const yTicks = Array.from({ length: ticks }, (_, i) => niceMin + (niceRange / (ticks - 1)) * i);
  const xLabelInterval = Math.ceil(data.length / 6);
  return (
    <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }}
      onMouseMove={(e) => { const rect = svgRef.current?.getBoundingClientRect(); if (!rect) return; const mx = ((e.clientX - rect.left) / rect.width) * w; const idx = Math.round(((mx - padL) / cw) * (data.length - 1)); if (idx >= 0 && idx < data.length) setHover(idx); }}
      onMouseLeave={() => setHover(null)}>
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={padL} y1={yScale(v)} x2={w - padR} y2={yScale(v)} stroke={colors.cardBorder} strokeWidth="0.5" />
          <text x={padL - 6} y={yScale(v)} textAnchor="end" dominantBaseline="central" fill={colors.textSecondary} fontSize="11.5" fontFamily="'DM Sans', system-ui">{v.toFixed(1)}</text>
        </g>
      ))}
      {data.map((d, i) => i % xLabelInterval === 0 || i === data.length - 1 ? (
        <text key={i} x={xScale(i)} y={h - 6} textAnchor="middle" fill={colors.textSecondary} fontSize="11" fontFamily="'DM Sans', system-ui">{d[xKey]}</text>
      ) : null)}
      {yKeys.map((key, ki) => <path key={`area-${key}`} d={makeArea(key)} fill={chartColors[ki]?.area || "transparent"} />)}
      {peerKey && <path d={makePath(peerKey)} fill="none" stroke={peerColor} strokeWidth="1.5" strokeDasharray={peerDash} opacity="0.6" />}
      {yKeys.map((key, ki) => <path key={`line-${key}`} d={makePath(key)} fill="none" stroke={chartColors[ki]?.line || colors.chartBlue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />)}
      {hover !== null && (
        <g>
          <line x1={xScale(hover)} y1={padT} x2={xScale(hover)} y2={padT + ch} stroke={colors.textTertiary} strokeWidth="0.5" strokeDasharray="3 2" />
          {yKeys.map((key, ki) => <circle key={key} cx={xScale(hover)} cy={yScale(data[hover][key])} r="4" fill={chartColors[ki]?.line || colors.chartBlue} stroke={colors.card} strokeWidth="2" />)}
          {peerKey && data[hover][peerKey] != null && <circle cx={xScale(hover)} cy={yScale(data[hover][peerKey])} r="3" fill={peerColor} stroke={colors.card} strokeWidth="2" />}
        </g>
      )}
    </svg>
  );
}

// ============================================================
// BAR CHART COMPONENT (for AI data)
// ============================================================
function HorizontalBarChart({ items, maxValue = 100, accentColor = colors.aiPurple, height = 28 }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: colors.text, width: 200, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
          <div style={{ flex: 1, height: 8, background: colors.warmGray, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(item.value / maxValue) * 100}%`, background: accentColor, borderRadius: 4, transition: "width 0.5s ease" }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "'Source Serif 4', Georgia, serif", fontVariantNumeric: "tabular-nums", width: 40, textAlign: "right", color: accentColor }}>
            {typeof item.displayValue === "string" ? item.displayValue : item.value.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// SCORE RING COMPONENT
// ============================================================
function ScoreRing({ score, size = 110, trend, trendDelta, label = "of 100", color: overrideColor }) {
  const strokeW = 8;
  const r = (size - strokeW) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const scoreColor = overrideColor || (score >= 70 ? colors.scoreGreen : score >= 50 ? colors.scoreAmber : colors.scoreRed);
  const trendColor = trend === "improving" ? colors.positive : trend === "declining" ? colors.caution : colors.neutral;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.warmGray} strokeWidth={strokeW} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={scoreColor} strokeWidth={strokeW}
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 32, fontWeight: 600, color: scoreColor, lineHeight: 1, fontFamily: "'Source Serif 4', Georgia, serif", fontVariantNumeric: "tabular-nums" }}>{score}</span>
          <span style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>{label}</span>
        </div>
      </div>
      {trend && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 12,
          background: trend === "improving" ? colors.positiveBg : trend === "declining" ? colors.cautionBg : colors.neutralBg }}>
          <span style={{ fontSize: 11, color: trendColor }}>{trend === "improving" ? "\u25B2" : trend === "declining" ? "\u25BC" : "\u2014"}</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: trendColor }}>{trendDelta > 0 ? "+" : ""}{parseFloat(trendDelta || 0).toFixed(1)} pts</span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// GAUGE COMPONENT (for AI metrics)
// ============================================================
function Gauge({ value, maxValue = 1, size = 90, label, color, sublabel }) {
  const strokeW = 7;
  const r = (size - strokeW) / 2;
  const circ = Math.PI * r; // semicircle
  const pct = Math.min(value / maxValue, 1);
  const offset = circ - pct * circ;
  const gaugeColor = color || (pct >= 0.7 ? colors.scoreRed : pct >= 0.4 ? colors.scoreAmber : colors.scoreGreen);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ position: "relative", width: size, height: size / 2 + 10, overflow: "hidden" }}>
        <svg width={size} height={size} style={{ transform: "rotate(180deg)", position: "absolute", top: 0 }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.warmGray} strokeWidth={strokeW}
            strokeDasharray={`${circ} ${circ}`} strokeLinecap="round" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={gaugeColor} strokeWidth={strokeW}
            strokeDasharray={`${circ} ${circ}`} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.8s ease" }} />
        </svg>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, textAlign: "center" }}>
          <span style={{ fontSize: 20, fontWeight: 600, color: gaugeColor, fontFamily: "'Source Serif 4', Georgia, serif", fontVariantNumeric: "tabular-nums" }}>
            {(value * 100).toFixed(0)}
          </span>
        </div>
      </div>
      <span style={{ fontSize: 12, color: colors.textSecondary, textAlign: "center", lineHeight: 1.2 }}>{label}</span>
      {sublabel && <span style={{ fontSize: 11, color: colors.textTertiary }}>{sublabel}</span>}
    </div>
  );
}

// ============================================================
// LOADING SKELETON
// ============================================================
function LoadingSkeleton({ height = 200 }) {
  return (
    <div style={{ height, borderRadius: 12, background: `linear-gradient(90deg, ${colors.warmGray} 25%, #EEEDEA 50%, ${colors.warmGray} 75%)`,
      backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }}>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}

// ============================================================
// HELPERS
// ============================================================
const MONTH_ABBR = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtMonth(year, month) { return `${MONTH_ABBR[month]} ${String(year).slice(2)}`; }

function getExposureLevel(score) {
  if (score >= 0.7) return { label: "High", color: colors.scoreRed, bg: "#FEF2F2" };
  if (score >= 0.4) return { label: "Moderate", color: colors.scoreAmber, bg: colors.cautionBg };
  return { label: "Low", color: colors.scoreGreen, bg: colors.positiveBg };
}

function getTierStyle(tier) {
  switch (tier) {
    case "Leading": return { color: colors.scoreGreen, bg: colors.positiveBg };
    case "Prepared": return { color: colors.aiBlue, bg: colors.aiBlueLight };
    case "Developing": return { color: colors.scoreAmber, bg: colors.cautionBg };
    case "Emerging": return { color: colors.scoreRed, bg: "#FEF2F2" };
    default: return { color: colors.neutral, bg: colors.neutralBg };
  }
}

// ============================================================
// MAIN DASHBOARD PAGE
// ============================================================
export default function ResilienceIQ() {
  const [fips, setFips] = useState("45045");
  const [activeTab, setActiveTab] = useState("overview");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [timePeriod, setTimePeriod] = useState(24);

  const { jurisdiction, loading: jLoading } = useJurisdiction(fips);
  const { lausData, loading: lLoading } = useLausData(fips, timePeriod);
  const { score: resilienceScore, loading: sLoading } = useResilienceScore(fips);
  const score = resilienceScore ? parseFloat(resilienceScore.overall_score) : null;
  const { peers, rank: peerRank, total: peerTotal, loading: pLoading } = usePeerScores(fips, score);
  const { results: searchResults, search, searching } = useCountySearch();

  const latestLaus = lausData.length > 0 ? lausData[lausData.length - 1] : null;
  const threeMonthAgo = lausData.length >= 4 ? lausData[lausData.length - 4] : null;
  const nationalAvg = useNationalAverage(latestLaus?.year, latestLaus?.month);

  const isLoading = jLoading || sLoading;

  const chartData = lausData.map(d => ({
    month: fmtMonth(d.year, d.month),
    rate: parseFloat(d.unemployment_rate),
    laborForce: d.labor_force,
  }));

  const chartDataWithPeer = chartData.map(d => ({ ...d, peer: nationalAvg || d.rate + 0.5 }));

  const lfNow = latestLaus?.labor_force;
  const lfFirst = lausData.length > 0 ? lausData[0].labor_force : null;
  const lfChange = lfNow && lfFirst ? lfNow - lfFirst : 0;

  const { briefing } = useAiBriefing(fips);
  const { warnFilings } = useWarnFilings(fips);
  const { bizData } = useBusinessActivity(fips);
  const { stateData } = useStateComparison(jurisdiction?.state_abbr);

  // AI data hooks
  const { exposure: aiExposure, loading: aiExpLoading } = useAIExposure(fips);
  const { readiness: aiReadiness, loading: aiReadLoading } = useAIReadiness(fips);
  const { aiStateData } = useAIStateComparison(jurisdiction?.state_abbr);

  // QCEW and grants hooks
  const { industries: qcewIndustries, loading: qcewLoading } = useQCEWData(fips);
  const { grants: grantsData, loading: grantsLoading } = useFederalGrants(fips);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "labor", label: "Labor market" },
    { id: "industry", label: "Industry" },
    { id: "ai", label: "AI impact" },
    { id: "alerts", label: "Alerts" + (warnFilings.length > 0 ? ` (${warnFilings.length})` : "") },
    { id: "grants", label: "Grants" },
    { id: "compare", label: "Compare" },
  ];

  const scoreComponents = resilienceScore ? [
    { label: "Unemployment vs national", score: parseFloat(resilienceScore.unemployment_score), weight: 30 },
    { label: "Unemployment trend (3mo)", score: parseFloat(resilienceScore.unemployment_trend_score), weight: 15 },
    { label: "Labor force size", score: parseFloat(resilienceScore.labor_force_score), weight: 10 },
    { label: "Labor force trend", score: parseFloat(resilienceScore.job_posting_score), weight: 10 },
    { label: "Business formation", score: parseFloat(resilienceScore.business_formation_score), weight: 15 },
    { label: "WARN activity", score: parseFloat(resilienceScore.warn_activity_score), weight: 20 },
  ] : [];

  // AI exposure derived data
  const exposureLevel = aiExposure ? getExposureLevel(parseFloat(aiExposure.aige_score)) : null;
  const topOccupations = aiExposure?.top_exposed_occupations || [];
  const topIndustries = aiExposure?.top_exposed_industries || [];

  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif", background: colors.bg, minHeight: "100vh", color: colors.text }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap" rel="stylesheet" />
      {/* Header */}
      <header style={{ background: colors.card, borderBottom: `1px solid ${colors.cardBorder}`, padding: "0 28px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="16" width="4.5" height="6" rx="1.2" fill={colors.accent} opacity="0.4"/>
              <rect x="9.75" y="10" width="4.5" height="12" rx="1.2" fill={colors.accent} opacity="0.7"/>
              <rect x="17.5" y="4" width="4.5" height="18" rx="1.2" fill={colors.accent}/>
            </svg>
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em", color: colors.text }}>
              Resilience <span style={{ fontWeight: 400, color: colors.textSecondary }}>IQ</span>
            </span>
          </div>
          <div style={{ width: 1, height: 24, background: colors.cardBorder }} />
          <nav style={{ display: "flex", gap: 2, height: 56, alignItems: "stretch" }}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{ padding: "0 14px", fontSize: 13, fontWeight: 500,
                  color: activeTab === tab.id ? colors.text : colors.textTertiary,
                  background: "none", border: "none", cursor: "pointer",
                  borderBottom: `2px solid ${activeTab === tab.id ? (tab.id === "ai" ? colors.aiPurple : colors.accent) : "transparent"}`,
                  borderTop: "2px solid transparent", transition: "all 0.15s ease", fontFamily: "inherit" }}>
                {tab.id === "ai" && <span style={{ marginRight: 4 }}>✦</span>}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: colors.scoreGreen }} />
            <span style={{ fontSize: 11.5, color: colors.textTertiary }}>
              {latestLaus ? `Updated ${fmtMonth(latestLaus.year, latestLaus.month)}` : "Loading..."}
            </span>
          </div>
          <div style={{ position: "relative" }}>
            <button onClick={() => setSearchOpen(!searchOpen)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px 6px 10px",
                borderRadius: 8, border: `1px solid ${colors.cardBorder}`, background: colors.bg,
                cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: colors.text, lineHeight: 1.2 }}>
                  {jurisdiction?.county_name || "Loading..."}
                </div>
                <div style={{ fontSize: 10.5, color: colors.textTertiary, lineHeight: 1.2 }}>
                  {jurisdiction ? `${jurisdiction.state_abbr} \u00B7 FIPS ${fips}` : ""}
                </div>
              </div>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2.5 4L5 6.5L7.5 4" stroke={colors.textTertiary} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {searchOpen && (
              <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, width: 300,
                background: colors.card, borderRadius: 10, border: `1px solid ${colors.cardBorder}`,
                boxShadow: "0 8px 24px rgba(0,0,0,0.08)", zIndex: 100, overflow: "hidden" }}>
                <input autoFocus placeholder="Search counties..." value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); search(e.target.value); }}
                  style={{ width: "100%", padding: "12px 16px", border: "none", borderBottom: `1px solid ${colors.cardBorder}`,
                    fontSize: 14, fontFamily: "inherit", outline: "none", background: "transparent", boxSizing: "border-box" }} />
                <div style={{ maxHeight: 240, overflowY: "auto" }}>
                  {searching && <div style={{ padding: "12px 16px", fontSize: 13, color: colors.textTertiary }}>Searching...</div>}
                  {searchResults.map(r => (
                    <div key={r.fips_code}
                      onClick={() => { setFips(r.fips_code); setSearchOpen(false); setSearchQuery(""); }}
                      style={{ padding: "10px 16px", cursor: "pointer", fontSize: 13,
                        borderBottom: `1px solid ${colors.warmGray}`, display: "flex", justifyContent: "space-between" }}
                      onMouseEnter={e => e.currentTarget.style.background = colors.warmGray}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <span style={{ fontWeight: 500 }}>{r.county_name}</span>
                      <span style={{ color: colors.textTertiary }}>{r.state_abbr} \u00B7 {r.fips_code}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 24px 64px" }}>
        {/* Time period selector - show on overview and labor tabs */}
        {(activeTab === "overview" || activeTab === "labor") && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16, gap: 4 }}>
            <span style={{ fontSize: 12, color: colors.textSecondary, alignSelf: "center", marginRight: 8 }}>Period</span>
            {[
              { label: "3M", value: 3 },
              { label: "6M", value: 6 },
              { label: "12M", value: 12 },
              { label: "24M", value: 24 },
            ].map(p => (
              <button key={p.value} onClick={() => setTimePeriod(p.value)}
                style={{
                  padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                  border: `1px solid ${timePeriod === p.value ? colors.accent : colors.cardBorder}`,
                  background: timePeriod === p.value ? colors.accent : colors.card,
                  color: timePeriod === p.value ? "#fff" : colors.textSecondary,
                  cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                }}>
                {p.label}
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <LoadingSkeleton height={180} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              {[1,2,3,4].map(i => <LoadingSkeleton key={i} height={110} />)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <LoadingSkeleton height={260} /><LoadingSkeleton height={260} />
            </div>
          </div>
        ) : (
          <>
            {/* ==================== OVERVIEW TAB ==================== */}
            {activeTab === "overview" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Hero */}
                <div style={{ background: colors.card, borderRadius: 16, border: `1px solid ${colors.cardBorder}`, overflow: "hidden" }}>
                  <div style={{ padding: "28px 32px 24px", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 28, alignItems: "center", borderBottom: `1px solid ${colors.cardBorder}` }}>
                    {score !== null && <ScoreRing score={Math.round(score)} trend={resilienceScore?.trend || "new"} trendDelta={resilienceScore?.trend_delta} />}
                    <div style={{ display: "flex", gap: 1, height: 68 }}>
                      {[
                        { label: "Unemployment", value: latestLaus ? `${parseFloat(latestLaus.unemployment_rate).toFixed(1)}%` : "\u2014", sub: nationalAvg ? `vs ${nationalAvg}% national` : "", good: latestLaus && nationalAvg ? parseFloat(latestLaus.unemployment_rate) < nationalAvg : true },
                        { label: "Labor force", value: lfNow ? lfNow.toLocaleString() : "\u2014", sub: lfChange !== 0 ? `${lfChange > 0 ? "+" : ""}${lfChange.toLocaleString()} over ${lausData.length}mo` : "", good: lfChange >= 0 },
                        { label: "Employed", value: latestLaus ? parseInt(latestLaus.employed).toLocaleString() : "\u2014", sub: latestLaus ? `${((latestLaus.employed / latestLaus.labor_force) * 100).toFixed(1)}% participation` : "", good: true },
                        { label: "Unemployed", value: latestLaus ? parseInt(latestLaus.unemployed).toLocaleString() : "\u2014", sub: threeMonthAgo ? `${parseInt(latestLaus.unemployed) < parseInt(threeMonthAgo.unemployed) ? "\u25BC" : "\u25B2"} from 3mo ago` : "", good: threeMonthAgo ? parseInt(latestLaus.unemployed) <= parseInt(threeMonthAgo.unemployed) : true },
                      ].map((stat, i) => (
                        <div key={i} style={{ flex: 1, padding: "0 18px", borderLeft: i > 0 ? `1px solid ${colors.cardBorder}` : "none", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                          <span style={{ fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", marginBottom: 5 }}>{stat.label}</span>
                          <span style={{ fontSize: 22, fontWeight: 600, fontFamily: "'Source Serif 4', Georgia, serif", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{stat.value}</span>
                          <span style={{ fontSize: 12.5, color: stat.good ? colors.positive : colors.caution, fontWeight: 500, marginTop: 4 }}>{stat.sub}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 20px", borderLeft: `1px solid ${colors.cardBorder}` }}>
                      <span style={{ fontSize: 12, color: colors.textSecondary, textTransform: "uppercase" }}>Peer rank</span>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                        <span style={{ fontSize: 28, fontWeight: 600, fontFamily: "'Source Serif 4', Georgia, serif", color: colors.accent }}>
                          {peerRank || "\u2014"}
                        </span>
                        <span style={{ fontSize: 13, color: colors.textSecondary }}>of {peerTotal.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  {/* Briefing */}
                  <div style={{ padding: "22px 32px 28px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <circle cx="7" cy="7" r="6" stroke={colors.accent} strokeWidth="1.2"/><circle cx="7" cy="7" r="2" fill={colors.accent}/>
                        <path d="M7 1V3M7 11V13M1 7H3M11 7H13" stroke={colors.accent} strokeWidth="0.8" strokeLinecap="round"/>
                      </svg>
                      <span style={{ fontSize: 13, fontWeight: 500, color: colors.accent }}>{briefing ? "AI economic briefing" : "Economic briefing"}</span>
                      {briefing && <span style={{ fontSize: 11, color: colors.textTertiary, marginLeft: "auto" }}>Powered by Claude</span>}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: colors.text, lineHeight: 1.35, fontFamily: "'Source Serif 4', Georgia, serif", marginBottom: 12 }}>
                      {briefing ? briefing.headline
                        : latestLaus && threeMonthAgo
                        ? parseFloat(latestLaus.unemployment_rate) < parseFloat(threeMonthAgo.unemployment_rate)
                          ? `Unemployment is trending down in ${jurisdiction?.county_name}`
                          : `Unemployment is holding steady in ${jurisdiction?.county_name}`
                        : `Economic overview for ${jurisdiction?.county_name}`}
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.75, color: colors.textSecondary }}>
                      {briefing ? (
                        <>
                          {briefing.body.split('\n').filter(p => p.trim()).map((p, i) => (
                            <p key={i} style={{ margin: i > 0 ? "12px 0 0" : 0 }}>{p}</p>
                          ))}
                          {briefing.key_insights?.length > 0 && (
                            <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 8, background: colors.accentLight }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: colors.accent, marginBottom: 6, textTransform: "uppercase" }}>Key insights</div>
                              {briefing.key_insights.map((insight, i) => (
                                <div key={i} style={{ fontSize: 13, color: colors.text, padding: "3px 0", display: "flex", gap: 8 }}>
                                  <span style={{ color: colors.accent }}>\u2022</span> {insight}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <p style={{ margin: 0 }}>
                            {jurisdiction?.county_name}&apos;s unemployment rate stands at {latestLaus ? parseFloat(latestLaus.unemployment_rate).toFixed(1) : "\u2014"}%
                            {nationalAvg ? `, ${parseFloat(latestLaus?.unemployment_rate) < nationalAvg ? "below" : "above"} the national average of ${nationalAvg}%` : ""}.
                            The labor force is {lfNow?.toLocaleString()} with {latestLaus ? parseInt(latestLaus.employed).toLocaleString() : "\u2014"} employed.
                            {lfChange > 0 ? ` The labor force has grown by ${lfChange.toLocaleString()} over the past ${lausData.length} months.` : ""}
                          </p>
                          <p style={{ margin: "12px 0 0" }}>
                            The Resilience Score of {score !== null ? Math.round(score) : "\u2014"}/100 reflects the county&apos;s overall economic health
                            relative to peer jurisdictions. {resilienceScore?.trend === "new" ? "This is the first score calculation. Future updates will show trend direction." : ""}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* AI Quick Glance - mini cards on overview */}
                {(aiExposure || aiReadiness) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    {aiExposure && (
                      <div style={{ background: colors.card, borderRadius: 12, border: `1px solid ${colors.cardBorder}`, padding: "18px 22px", display: "flex", alignItems: "center", gap: 16, cursor: "pointer" }}
                        onClick={() => setActiveTab("ai")}>
                        <div style={{ width: 44, height: 44, borderRadius: 22, background: colors.aiPurpleLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: 20 }}>✦</span>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", marginBottom: 2 }}>AI workforce exposure</div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                            <span style={{ fontSize: 24, fontWeight: 600, fontFamily: "'Source Serif 4', Georgia, serif", color: exposureLevel.color }}>
                              {(parseFloat(aiExposure.aige_score) * 100).toFixed(0)}
                            </span>
                            <span style={{ fontSize: 12, color: colors.textSecondary }}>/ 100 exposure index</span>
                          </div>
                          <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: exposureLevel.bg, color: exposureLevel.color, fontWeight: 500 }}>
                            {exposureLevel.label} exposure {"\u00B7"} P{parseFloat(aiExposure.aige_percentile).toFixed(0)}
                          </span>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M6 4L10 8L6 12" stroke={colors.textTertiary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
                    {aiReadiness && (
                      <div style={{ background: colors.card, borderRadius: 12, border: `1px solid ${colors.cardBorder}`, padding: "18px 22px", display: "flex", alignItems: "center", gap: 16, cursor: "pointer" }}
                        onClick={() => setActiveTab("ai")}>
                        <div style={{ width: 44, height: 44, borderRadius: 22, background: colors.aiBlueLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: 18 }}>🎯</span>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", marginBottom: 2 }}>AI readiness</div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                            <span style={{ fontSize: 24, fontWeight: 600, fontFamily: "'Source Serif 4', Georgia, serif", color: getTierStyle(aiReadiness.readiness_tier).color }}>
                              {parseFloat(aiReadiness.readiness_score).toFixed(0)}
                            </span>
                            <span style={{ fontSize: 12, color: colors.textSecondary }}>/ 100 readiness score</span>
                          </div>
                          <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: getTierStyle(aiReadiness.readiness_tier).bg, color: getTierStyle(aiReadiness.readiness_tier).color, fontWeight: 500 }}>
                            {aiReadiness.readiness_tier} tier
                          </span>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M6 4L10 8L6 12" stroke={colors.textTertiary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
                  </div>
                )}

                {/* Metric cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                  {[
                    { label: "Unemployment rate", value: latestLaus ? `${parseFloat(latestLaus.unemployment_rate).toFixed(1)}%` : "\u2014",
                      sub: threeMonthAgo ? `${Math.abs(parseFloat(latestLaus.unemployment_rate) - parseFloat(threeMonthAgo.unemployment_rate)).toFixed(1)} pts from 3mo ago` : "",
                      good: threeMonthAgo ? parseFloat(latestLaus.unemployment_rate) <= parseFloat(threeMonthAgo.unemployment_rate) : true,
                      context: nationalAvg ? `National avg: ${nationalAvg}%` : "" },
                    { label: "Labor force", value: lfNow ? lfNow.toLocaleString() : "\u2014",
                      sub: lfChange !== 0 ? `${lfChange > 0 ? "+" : ""}${lfChange.toLocaleString()} over ${lausData.length}mo` : "",
                      good: lfChange >= 0, context: latestLaus ? `${((latestLaus.employed / latestLaus.labor_force) * 100).toFixed(0)}% participation` : "" },
                    { label: "Score components", value: scoreComponents.filter(c => c.score >= 70).length.toString(),
                      sub: `of ${scoreComponents.length} above 70`, good: scoreComponents.filter(c => c.score >= 70).length >= 3,
                      context: scoreComponents.length > 0 ? `Weakest: ${scoreComponents.reduce((a, b) => a.score < b.score ? a : b).label}` : "" },
                    { label: "Peer standing", value: peerRank ? `#${peerRank.toLocaleString()}` : "\u2014",
                      sub: `of ${peerTotal.toLocaleString()} counties`, good: peerRank ? peerRank <= peerTotal * 0.5 : true,
                      context: peerRank ? `Top ${((peerRank / peerTotal) * 100).toFixed(0)}% nationally` : "" },
                  ].map((card, i) => (
                    <div key={i} style={{ background: colors.card, borderRadius: 12, border: `1px solid ${colors.cardBorder}`, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ fontSize: 12.5, color: colors.textSecondary }}>{card.label}</div>
                      <span style={{ fontSize: 30, fontWeight: 600, lineHeight: 1, fontFamily: "'Source Serif 4', Georgia, serif", fontVariantNumeric: "tabular-nums" }}>{card.value}</span>
                      <div style={{ fontSize: 13, color: card.good ? colors.positive : colors.caution, fontWeight: 500 }}>{card.sub}</div>
                      <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{card.context}</div>
                    </div>
                  ))}
                </div>

                {/* Charts */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div style={{ background: colors.card, borderRadius: 12, border: `1px solid ${colors.cardBorder}`, padding: "20px 24px" }}>
                    <div style={{ fontSize: 13, color: colors.textSecondary, textTransform: "uppercase", marginBottom: 4 }}>Unemployment rate</div>
                    <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>
                      {latestLaus && nationalAvg ? (parseFloat(latestLaus.unemployment_rate) < nationalAvg ? "Below national average" : "Tracking national average") : "Monthly trend"}{" "}
                      <span style={{ fontWeight: 400, color: colors.textTertiary, fontSize: 12 }}>({timePeriod}mo)</span>
                    </div>
                    {lLoading ? <LoadingSkeleton height={200} /> : (
                      <AreaChart data={chartDataWithPeer} xKey="month" yKeys={["rate"]}
                        colors={[{ line: colors.chartBlueLine, area: colors.chartBlueArea }]}
                        peerKey="peer" peerColor={colors.chartPeerLine} peerDash={colors.chartPeerDash} height={200} />
                    )}
                    <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12.5, color: colors.textSecondary }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 18, height: 2.5, background: colors.chartBlueLine, display: "inline-block", borderRadius: 1 }}></span>
                        {jurisdiction?.county_name || "County"}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 18, height: 2.5, background: colors.chartPeerLine, display: "inline-block", borderRadius: 1 }}></span>
                        National average
                      </span>
                    </div>
                  </div>
                  <div style={{ background: colors.card, borderRadius: 12, border: `1px solid ${colors.cardBorder}`, padding: "20px 24px" }}>
                    <div style={{ fontSize: 13, color: colors.textSecondary, textTransform: "uppercase", marginBottom: 4 }}>Peer comparison</div>
                    <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>Resilience score vs. similar counties</div>
                    {peers.sort((a, b) => b.score - a.score).map((county, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0",
                        borderBottom: i < peers.length - 1 ? `1px solid ${colors.warmGray}` : "none", cursor: county.isCurrent ? "default" : "pointer" }}
                        onClick={() => { if (!county.isCurrent) setFips(county.fips); }}>
                        <span style={{ width: 22, height: 22, borderRadius: 11, fontSize: 11, fontWeight: 500,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: county.isCurrent ? colors.accent : colors.warmGray,
                          color: county.isCurrent ? "#fff" : colors.textTertiary }}>{i + 1}</span>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: county.isCurrent ? 600 : 400,
                          color: county.isCurrent ? colors.text : colors.textSecondary }}>{county.name}</span>
                        <div style={{ width: 120, height: 6, background: colors.warmGray, borderRadius: 3 }}>
                          <div style={{ height: 6, borderRadius: 3, width: `${county.score}%`, background: county.isCurrent ? colors.accent : colors.textTertiary }} />
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 600, width: 28, textAlign: "right", fontVariantNumeric: "tabular-nums",
                          color: county.isCurrent ? colors.accent : colors.textSecondary }}>{Math.round(county.score)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Score breakdown */}
                {scoreComponents.length > 0 && (
                  <div style={{ background: colors.card, borderRadius: 12, border: `1px solid ${colors.cardBorder}`, padding: "20px 24px" }}>
                    <div style={{ fontSize: 13, color: colors.textSecondary, textTransform: "uppercase", marginBottom: 4 }}>Score breakdown</div>
                    <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>How your Resilience Score is calculated</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                      {scoreComponents.map((comp, i) => {
                        const compColor = comp.score >= 70 ? colors.scoreGreen : comp.score >= 50 ? colors.scoreAmber : colors.scoreRed;
                        return (
                          <div key={i} style={{ padding: "16px 18px", borderRadius: 10, background: colors.warmGray, display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ fontSize: 13, color: colors.text }}>{comp.label}</span>
                              <span style={{ fontSize: 12, color: colors.textSecondary }}>{comp.weight}%</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                              <span style={{ fontSize: 26, fontWeight: 600, color: compColor, fontFamily: "'Source Serif 4', Georgia, serif", fontVariantNumeric: "tabular-nums" }}>{Math.round(comp.score)}</span>
                              <span style={{ fontSize: 13, color: colors.textSecondary }}>/100</span>
                            </div>
                            <div style={{ height: 5, background: "#E0DFDA", borderRadius: 3 }}>
                              <div style={{ height: 5, borderRadius: 3, width: `${comp.score}%`, background: compColor }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ background: colors.warmGray, borderRadius: 12, padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 13, color: colors.textSecondary }}>
                    Data: BLS LAUS (monthly) \u00B7 Algorithm v2 \u00B7 {lausData.length} months loaded
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ fontSize: 12.5, color: colors.accent, fontWeight: 500, padding: "5px 12px", borderRadius: 6, background: colors.accentLight }}>View methodology</div>
                    <button
                      onClick={() => {
                        const rows = [["Month", "Unemployment Rate", "Labor Force", "Employed", "Unemployed"]];
                        lausData.forEach(d => rows.push([fmtMonth(d.year, d.month), d.unemployment_rate, d.labor_force, d.employed, d.unemployed]));
                        const csv = rows.map(r => r.join(",")).join("\n");
                        const blob = new Blob([csv], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a"); a.href = url; a.download = `${jurisdiction?.county_name || fips}_data.csv`; a.click();
                        URL.revokeObjectURL(url);
                      }}
                      style={{ fontSize: 12.5, color: colors.accent, fontWeight: 500, padding: "5px 12px", borderRadius: 6, background: colors.accentLight, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                      Export CSV
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ==================== LABOR MARKET TAB ==================== */}
            {activeTab === "labor" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ background: colors.card, borderRadius: 12, border: `1px solid ${colors.cardBorder}`, padding: "24px 28px" }}>
                  <div style={{ fontSize: 18, fontWeight: 600, fontFamily: "'Source Serif 4', Georgia, serif", marginBottom: 4 }}>Labor market deep dive</div>
                  <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 20 }}>{lausData.length}-month trend for {jurisdiction?.county_name}</div>
                  {lLoading ? <LoadingSkeleton height={280} /> : (
                    <AreaChart data={chartDataWithPeer} xKey="month" yKeys={["rate"]}
                      colors={[{ line: colors.chartBlueLine, area: colors.chartBlueArea }]}
                      peerKey="peer" peerColor={colors.chartPeerLine} peerDash={colors.chartPeerDash} height={280} />
                  )}
                </div>
                <div style={{ background: colors.card, borderRadius: 12, border: `1px solid ${colors.cardBorder}`, padding: "24px 28px" }}>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Labor force over time</div>
                  {lLoading ? <LoadingSkeleton height={200} /> : (
                    <AreaChart data={chartData.map(d => ({ ...d, lf: d.laborForce / 1000 }))} xKey="month" yKeys={["lf"]}
                      colors={[{ line: colors.chartGreen, area: colors.chartGreenArea }]} height={200} />
                  )}
                </div>
              </div>
            )}

            {/* ==================== AI IMPACT TAB ==================== */}
            {activeTab === "ai" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {(aiExpLoading || aiReadLoading) && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <LoadingSkeleton height={240} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                      <LoadingSkeleton height={300} /><LoadingSkeleton height={300} />
                    </div>
                  </div>
                )}
                {!aiExpLoading && !aiReadLoading && (
                <>
                {/* AI Hero Card */}
                <div style={{ background: colors.card, borderRadius: 16, border: `1px solid ${colors.cardBorder}`, overflow: "hidden" }}>
                  <div style={{ padding: "24px 32px", borderBottom: `1px solid ${colors.cardBorder}`, background: "linear-gradient(135deg, #FAFAF8 0%, #F3EEFB 100%)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: 18 }}>✦</span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: colors.aiPurple }}>AI Economic Impact Assessment</span>
                      <span style={{ fontSize: 11, color: colors.textTertiary, marginLeft: "auto" }}>Based on AIOE methodology + Census ACS data</span>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "'Source Serif 4', Georgia, serif", lineHeight: 1.35, color: colors.text, marginBottom: 8 }}>
                      {aiExposure && aiReadiness
                        ? parseFloat(aiExposure.aige_score) > 0.6 && parseFloat(aiReadiness.readiness_score) > 60
                          ? `${jurisdiction?.county_name} faces significant AI disruption but has strong readiness infrastructure`
                          : parseFloat(aiExposure.aige_score) > 0.6
                            ? `${jurisdiction?.county_name} has high AI exposure with gaps in workforce readiness`
                            : parseFloat(aiReadiness.readiness_score) > 60
                              ? `${jurisdiction?.county_name} is well-positioned for the AI transition with moderate exposure`
                              : `${jurisdiction?.county_name} has lower AI exposure but may need to invest in readiness`
                        : `AI impact analysis for ${jurisdiction?.county_name}`}
                    </div>
                    <p style={{ fontSize: 14, lineHeight: 1.65, color: colors.textSecondary, margin: 0 }}>
                      This assessment evaluates how generative AI technologies may reshape the local labor market, measuring both workforce exposure to AI automation and the county&apos;s infrastructure readiness to adapt. Higher exposure isn&apos;t necessarily negative — it depends on whether the workforce is prepared to transition.
                    </p>
                  </div>

                  {/* AI Summary Stats */}
                  {aiExposure && aiReadiness && (
                    <div style={{ padding: "24px 32px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
                      {[
                        { label: "AI Exposure Index", value: (parseFloat(aiExposure.aige_score) * 100).toFixed(0), suffix: "/100", color: exposureLevel.color, sub: `${exposureLevel.label} exposure` },
                        { label: "National percentile", value: `P${parseFloat(aiExposure.aige_percentile).toFixed(0)}`, suffix: "", color: colors.aiPurple, sub: `Top ${(100 - parseFloat(aiExposure.aige_percentile)).toFixed(0)}% nationally` },
                        { label: "Readiness score", value: parseFloat(aiReadiness.readiness_score).toFixed(0), suffix: "/100", color: getTierStyle(aiReadiness.readiness_tier).color, sub: `${aiReadiness.readiness_tier} tier` },
                        { label: "Broadband access", value: `${parseFloat(aiReadiness.broadband_pct).toFixed(0)}%`, suffix: "", color: parseFloat(aiReadiness.broadband_pct) > 85 ? colors.scoreGreen : colors.scoreAmber, sub: "of households" },
                      ].map((stat, i) => (
                        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 16px", borderLeft: i > 0 ? `1px solid ${colors.cardBorder}` : "none" }}>
                          <span style={{ fontSize: 12, color: colors.textSecondary, textTransform: "uppercase" }}>{stat.label}</span>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                            <span style={{ fontSize: 28, fontWeight: 600, fontFamily: "'Source Serif 4', Georgia, serif", color: stat.color, fontVariantNumeric: "tabular-nums" }}>{stat.value}</span>
                            <span style={{ fontSize: 13, color: colors.textSecondary }}>{stat.suffix}</span>
                          </div>
                          <span style={{ fontSize: 12.5, color: colors.textSecondary }}>{stat.sub}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Two-column: Exposure + Readiness */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  {/* Workforce Exposure */}
                  <div style={{ background: colors.card, borderRadius: 12, border: `1px solid ${colors.cardBorder}`, padding: "20px 24px" }}>
                    <div style={{ fontSize: 13, color: colors.textSecondary, textTransform: "uppercase", marginBottom: 4 }}>Workforce exposure</div>
                    <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>
                      {topOccupations.length > 0 ? "Occupations most exposed to AI disruption" : "AI exposure analysis"}
                    </div>
                    {aiExpLoading ? <LoadingSkeleton height={200} /> : topOccupations.length > 0 ? (
                      <HorizontalBarChart
                        items={topOccupations.slice(0, 7).map(o => ({
                          label: o.title || o.occupation || o.name || "Unknown",
                          value: (o.exposure_score || o.score || 0.5) * 100,
                          displayValue: `${((o.exposure_score || o.score || 0.5) * 100).toFixed(0)}`,
                        }))}
                        maxValue={100}
                        accentColor={colors.aiPurple}
                      />
                    ) : (
                      <div style={{ padding: 24, borderRadius: 10, background: colors.neutralBg, textAlign: "center", fontSize: 14, color: colors.textSecondary }}>
                        Occupation exposure data loading...
                      </div>
                    )}
                    {topOccupations.length > 0 && (
                      <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 8, background: colors.aiPurpleLight, fontSize: 13, color: colors.text, lineHeight: 1.5 }}>
                        <strong>What this means:</strong> These occupations in {jurisdiction?.county_name} are most likely to see task-level changes from generative AI. High exposure can mean augmentation (AI assists workers) or displacement (AI replaces tasks).
                      </div>
                    )}
                  </div>

                  {/* AI Readiness */}
                  <div style={{ background: colors.card, borderRadius: 12, border: `1px solid ${colors.cardBorder}`, padding: "20px 24px" }}>
                    <div style={{ fontSize: 13, color: colors.textSecondary, textTransform: "uppercase", marginBottom: 4 }}>AI readiness indicators</div>
                    <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>Infrastructure and workforce preparedness</div>
                    {aiReadLoading ? <LoadingSkeleton height={200} /> : aiReadiness ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {[
                          { label: "Bachelor's degree or higher", value: parseFloat(aiReadiness.bachelors_plus_pct), avg: 33, unit: "%" },
                          { label: "Graduate/professional degree", value: parseFloat(aiReadiness.graduate_plus_pct), avg: 13, unit: "%" },
                          { label: "Broadband internet access", value: parseFloat(aiReadiness.broadband_pct), avg: 87, unit: "%" },
                          { label: "STEM workforce share", value: parseFloat(aiReadiness.stem_workforce_pct), avg: 6.5, unit: "%" },
                        ].map((ind, i) => (
                          <div key={i} style={{ padding: "12px 16px", borderRadius: 10, background: colors.warmGray }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                              <span style={{ fontSize: 13, color: colors.text }}>{ind.label}</span>
                              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                                <span style={{ fontSize: 16, fontWeight: 600, fontFamily: "'Source Serif 4', Georgia, serif", color: ind.value > ind.avg ? colors.scoreGreen : colors.scoreAmber }}>
                                  {ind.value.toFixed(1)}{ind.unit}
                                </span>
                                <span style={{ fontSize: 11, color: colors.textTertiary }}>avg: {ind.avg}{ind.unit}</span>
                              </div>
                            </div>
                            <div style={{ height: 5, background: "#E0DFDA", borderRadius: 3, position: "relative" }}>
                              <div style={{ height: 5, borderRadius: 3, width: `${Math.min(ind.value, 100)}%`, background: ind.value > ind.avg ? colors.scoreGreen : colors.scoreAmber, transition: "width 0.5s" }} />
                              <div style={{ position: "absolute", top: -3, left: `${Math.min(ind.avg, 100)}%`, width: 2, height: 11, background: colors.textTertiary, borderRadius: 1 }} title={`National avg: ${ind.avg}%`} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ padding: 24, borderRadius: 10, background: colors.neutralBg, textAlign: "center", fontSize: 14, color: colors.textSecondary }}>
                        Readiness data loading...
                      </div>
                    )}
                  </div>
                </div>

                {/* Industry Exposure */}
                {topIndustries.length > 0 && (
                  <div style={{ background: colors.card, borderRadius: 12, border: `1px solid ${colors.cardBorder}`, padding: "20px 24px" }}>
                    <div style={{ fontSize: 13, color: colors.textSecondary, textTransform: "uppercase", marginBottom: 4 }}>Industry exposure</div>
                    <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>Local industries most affected by AI adoption</div>
                    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(topIndustries.length, 4)}, 1fr)`, gap: 12 }}>
                      {topIndustries.slice(0, 4).map((ind, i) => {
                        const indScore = ind.exposure_score || ind.score || 0.5;
                        const indLevel = getExposureLevel(indScore);
                        return (
                          <div key={i} style={{ padding: "18px 20px", borderRadius: 10, background: colors.warmGray, display: "flex", flexDirection: "column", gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: colors.text }}>{ind.title || ind.industry || ind.name || ind}</span>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                              <span style={{ fontSize: 24, fontWeight: 600, fontFamily: "'Source Serif 4', Georgia, serif", color: indLevel.color }}>{(indScore * 100).toFixed(0)}</span>
                              <span style={{ fontSize: 12, color: colors.textSecondary }}>/100</span>
                            </div>
                            <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: indLevel.bg, color: indLevel.color, fontWeight: 500, alignSelf: "flex-start" }}>
                              {indLevel.label}
                            </span>
                            {ind.pct_workforce && <span style={{ fontSize: 11, color: colors.textTertiary }}>{(ind.pct_workforce * 100).toFixed(0)}% of local workforce</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* AI Exposure vs Readiness Matrix (state comparison) */}
                {aiStateData.length > 0 && (
                  <div style={{ background: colors.card, borderRadius: 12, border: `1px solid ${colors.cardBorder}`, padding: "20px 24px" }}>
                    <div style={{ fontSize: 13, color: colors.textSecondary, textTransform: "uppercase", marginBottom: 4 }}>State comparison</div>
                    <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>AI exposure vs. readiness across {jurisdiction?.state_name} counties</div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: `2px solid ${colors.cardBorder}` }}>
                            {["Rank", "County", "AI Exposure", "Readiness", "Tier", "Gap"].map(h => (
                              <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500, color: colors.textSecondary, fontSize: 12, textTransform: "uppercase" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {aiStateData.slice(0, 15).map((c, i) => {
                            const isMe = c.fips === fips;
                            const gap = c.readinessScore != null ? c.readinessScore - (c.aigeScore * 100) : null;
                            const tierStyle = getTierStyle(c.readinessTier);
                            return (
                              <tr key={c.fips} style={{ borderBottom: `1px solid ${colors.warmGray}`, background: isMe ? colors.aiPurpleLight : "transparent", cursor: isMe ? "default" : "pointer" }}
                                onClick={() => { if (!isMe) setFips(c.fips); }}>
                                <td style={{ padding: "10px 12px", color: colors.textTertiary, fontVariantNumeric: "tabular-nums" }}>#{i + 1}</td>
                                <td style={{ padding: "10px 12px", fontWeight: isMe ? 600 : 400, color: isMe ? colors.aiPurple : colors.text }}>{c.name}</td>
                                <td style={{ padding: "10px 12px", fontFamily: "'Source Serif 4', Georgia, serif", fontVariantNumeric: "tabular-nums" }}>{(c.aigeScore * 100).toFixed(0)}</td>
                                <td style={{ padding: "10px 12px", fontFamily: "'Source Serif 4', Georgia, serif", fontVariantNumeric: "tabular-nums" }}>{c.readinessScore != null ? c.readinessScore.toFixed(0) : "\u2014"}</td>
                                <td style={{ padding: "10px 12px" }}>
                                  <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 12, background: tierStyle.bg, color: tierStyle.color, fontWeight: 500 }}>{c.readinessTier}</span>
                                </td>
                                <td style={{ padding: "10px 12px", fontWeight: 500, color: gap != null ? (gap > 0 ? colors.positive : colors.caution) : colors.textTertiary }}>
                                  {gap != null ? `${gap > 0 ? "+" : ""}${gap.toFixed(0)}` : "\u2014"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ marginTop: 12, fontSize: 12, color: colors.textTertiary }}>
                      Gap = Readiness Score minus AI Exposure Index. Positive gap means the county is better prepared than exposed.
                    </div>
                  </div>
                )}

                {/* AI Policy Implications */}
                <div style={{ background: colors.card, borderRadius: 12, border: `1px solid ${colors.cardBorder}`, padding: "20px 24px" }}>
                  <div style={{ fontSize: 13, color: colors.textSecondary, textTransform: "uppercase", marginBottom: 4 }}>Policy implications</div>
                  <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>What this means for {jurisdiction?.county_name}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    {[
                      {
                        icon: "🎓", title: "Workforce development",
                        desc: aiReadiness && parseFloat(aiReadiness.bachelors_plus_pct) < 30
                          ? "Priority: Expand post-secondary education access and AI literacy programs. Below-average education attainment increases displacement risk."
                          : "Maintain investment in upskilling programs. Above-average education levels provide a foundation for AI-augmented work.",
                        urgency: aiReadiness && parseFloat(aiReadiness.bachelors_plus_pct) < 30 ? "high" : "moderate",
                      },
                      {
                        icon: "🌐", title: "Digital infrastructure",
                        desc: aiReadiness && parseFloat(aiReadiness.broadband_pct) < 85
                          ? "Critical: Broadband gaps limit workforce ability to access AI tools and remote AI-augmented jobs. Prioritize rural broadband expansion."
                          : "Strong broadband foundation. Focus on digital skills training to maximize infrastructure advantage.",
                        urgency: aiReadiness && parseFloat(aiReadiness.broadband_pct) < 85 ? "high" : "low",
                      },
                      {
                        icon: "🏢", title: "Economic diversification",
                        desc: aiExposure && parseFloat(aiExposure.aige_score) > 0.6
                          ? "High AI exposure in concentrated industries suggests need for economic diversification strategy. Support new sector growth."
                          : "Moderate exposure across industries. Monitor AI adoption trends and support transition planning.",
                        urgency: aiExposure && parseFloat(aiExposure.aige_score) > 0.6 ? "high" : "moderate",
                      },
                    ].map((rec, i) => {
                      const urgencyColor = rec.urgency === "high" ? colors.scoreRed : rec.urgency === "moderate" ? colors.scoreAmber : colors.scoreGreen;
                      const urgencyBg = rec.urgency === "high" ? "#FEF2F2" : rec.urgency === "moderate" ? colors.cautionBg : colors.positiveBg;
                      return (
                        <div key={i} style={{ padding: "18px 20px", borderRadius: 10, background: colors.warmGray, display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 22 }}>{rec.icon}</span>
                            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: urgencyBg, color: urgencyColor, fontWeight: 500 }}>
                              {rec.urgency} priority
                            </span>
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>{rec.title}</span>
                          <span style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 1.5 }}>{rec.desc}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ background: colors.warmGray, borderRadius: 12, padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 13, color: colors.textSecondary }}>
                    Sources: Felten et al. AIOE methodology \u00B7 Census ACS 2023 \u00B7 BLS SOC occupation data
                  </div>
                  <div style={{ fontSize: 12.5, color: colors.aiPurple, fontWeight: 500, padding: "5px 12px", borderRadius: 6, background: colors.aiPurpleLight }}>
                    View AI methodology
                  </div>
                </div>
                </>
                )}
              </div>
            )}

            {/* ==================== ALERTS TAB ==================== */}
            {activeTab === "alerts" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ background: colors.card, borderRadius: 12, border: `1px solid ${colors.cardBorder}`, padding: "24px 28px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 13, color: colors.textSecondary, textTransform: "uppercase", marginBottom: 4 }}>WARN Act filings</div>
                      <div style={{ fontSize: 15, fontWeight: 500 }}>
                        {warnFilings.length > 0 ? `${warnFilings.length} layoff notices filed in ${jurisdiction?.county_name || "this county"}` : `No WARN filings on record for ${jurisdiction?.county_name || "this county"}`}
                      </div>
                    </div>
                    {warnFilings.length > 0 && (
                      <div style={{ padding: "6px 14px", borderRadius: 8, background: colors.cautionBg, fontSize: 13, fontWeight: 500, color: colors.caution }}>
                        {warnFilings.reduce((s, f) => s + (f.employees_affected || 0), 0).toLocaleString()} employees affected
                      </div>
                    )}
                  </div>
                  {warnFilings.length > 0 ? (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: `2px solid ${colors.cardBorder}` }}>
                            {["Company", "Employees", "Type", "Notice date", "Effective"].map(h => (
                              <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500, color: colors.textSecondary, fontSize: 12, textTransform: "uppercase" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {warnFilings.slice(0, 20).map((f, i) => (
                            <tr key={i} style={{ borderBottom: `1px solid ${colors.warmGray}` }}>
                              <td style={{ padding: "10px 12px", fontWeight: 500 }}>{f.company_name}</td>
                              <td style={{ padding: "10px 12px", fontFamily: "'Source Serif 4', Georgia, serif", fontVariantNumeric: "tabular-nums" }}>{f.employees_affected?.toLocaleString()}</td>
                              <td style={{ padding: "10px 12px" }}>
                                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 12, background: f.layoff_type === "Plant Closing" ? colors.cautionBg : colors.neutralBg, color: f.layoff_type === "Plant Closing" ? colors.caution : colors.neutral }}>{f.layoff_type}</span>
                              </td>
                              <td style={{ padding: "10px 12px", color: colors.textSecondary }}>{f.notice_date}</td>
                              <td style={{ padding: "10px 12px", color: colors.textSecondary }}>{f.effective_date || "\u2014"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ padding: 24, borderRadius: 10, background: colors.positiveBg, textAlign: "center", fontSize: 14, color: colors.positive }}>
                      No active WARN filings \u2014 a positive signal for employment stability.
                    </div>
                  )}
                </div>
                <div style={{ background: colors.card, borderRadius: 12, border: `1px solid ${colors.cardBorder}`, padding: "24px 28px" }}>
                  <div style={{ fontSize: 13, color: colors.textSecondary, textTransform: "uppercase", marginBottom: 4 }}>Business activity</div>
                  <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>
                    {bizData.summary?.length > 0 ? "Net business formation is " + (bizData.summary[bizData.summary.length - 1]?.net >= 0 ? "positive" : "declining") : "Business registration data"}
                  </div>
                  {bizData.summary?.length > 0 ? (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                        {[
                          { label: "New registrations", value: bizData.summary.reduce((s, m) => s + m.new, 0), good: true },
                          { label: "Dissolutions", value: bizData.summary.reduce((s, m) => s + m.dissolved, 0), good: false },
                          { label: "Net formation", value: bizData.summary.reduce((s, m) => s + m.net, 0), good: bizData.summary.reduce((s, m) => s + m.net, 0) > 0 },
                        ].map((s, i) => (
                          <div key={i} style={{ padding: "14px 16px", borderRadius: 10, background: colors.warmGray }}>
                            <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>{s.label}</div>
                            <div style={{ fontSize: 24, fontWeight: 600, fontFamily: "'Source Serif 4', Georgia, serif", color: i === 2 ? (s.good ? colors.positive : colors.caution) : colors.text }}>{i === 2 && s.value > 0 ? "+" : ""}{s.value.toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                      <AreaChart data={bizData.summary.map(m => ({ month: m.month.slice(5), net: m.net, newBiz: m.new }))} xKey="month" yKeys={["net"]}
                        colors={[{ line: colors.chartGreen, area: colors.chartGreenArea }]} height={180} />
                      <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 8 }}>Monthly net business formation (new registrations minus dissolutions)</div>
                    </>
                  ) : (
                    <div style={{ padding: 24, borderRadius: 10, background: colors.neutralBg, textAlign: "center", fontSize: 14, color: colors.textSecondary }}>
                      No business registration data available for this county yet.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ==================== INDUSTRY TAB ==================== */}
            {activeTab === "industry" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ background: colors.card, borderRadius: 16, border: `1px solid ${colors.cardBorder}`, overflow: "hidden" }}>
                  <div style={{ padding: "24px 32px", borderBottom: `1px solid ${colors.cardBorder}` }}>
                    <div style={{ fontSize: 13, color: colors.textSecondary, textTransform: "uppercase", marginBottom: 4 }}>Industry composition</div>
                    <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "'Source Serif 4', Georgia, serif", lineHeight: 1.35, marginBottom: 8 }}>
                      {qcewIndustries.length > 0
                        ? `${qcewIndustries[0]?.industry_title} is the largest employer in ${jurisdiction?.county_name}`
                        : `Industry data for ${jurisdiction?.county_name}`}
                    </div>
                    <p style={{ fontSize: 14, color: colors.textSecondary, margin: 0, lineHeight: 1.6 }}>
                      BLS Quarterly Census of Employment & Wages (QCEW) data showing private sector employment by industry.
                      {qcewIndustries.length > 0 && ` ${qcewIndustries.length} industry sectors with ${qcewIndustries.reduce((s,d) => s + d.employment, 0).toLocaleString()} total private sector employees.`}
                    </p>
                  </div>
                  {qcewLoading ? <div style={{ padding: 32 }}><LoadingSkeleton height={300} /></div> : qcewIndustries.length > 0 ? (
                    <div style={{ padding: "24px 32px" }}>
                      {/* Summary stats */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
                        {[
                          { label: "Total employment", value: qcewIndustries.reduce((s,d) => s + d.employment, 0).toLocaleString() },
                          { label: "Establishments", value: qcewIndustries.reduce((s,d) => s + d.establishments, 0).toLocaleString() },
                          { label: "Top sector", value: qcewIndustries[0]?.industry_title?.split(",")[0] || "\u2014" },
                          { label: "Avg weekly wage", value: `$${Math.round(qcewIndustries.reduce((s,d) => s + d.avg_weekly_wage * d.employment, 0) / Math.max(1, qcewIndustries.reduce((s,d) => s + d.employment, 0))).toLocaleString()}` },
                        ].map((s, i) => (
                          <div key={i} style={{ padding: "14px 16px", borderRadius: 10, background: colors.warmGray }}>
                            <div style={{ fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", marginBottom: 4 }}>{s.label}</div>
                            <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "'Source Serif 4', Georgia, serif" }}>{s.value}</div>
                          </div>
                        ))}
                      </div>

                      {/* Industry table */}
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr style={{ borderBottom: `2px solid ${colors.cardBorder}` }}>
                              {["Industry", "Employment", "Share", "Establishments", "Avg weekly wage", "Annual salary", "LQ"].map(h => (
                                <th key={h} style={{ padding: "8px 12px", textAlign: h === "Industry" ? "left" : "right", fontWeight: 500, color: colors.textSecondary, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {qcewIndustries.map((ind, i) => (
                              <tr key={i} style={{ borderBottom: `1px solid ${colors.warmGray}` }}>
                                <td style={{ padding: "10px 12px", fontWeight: 500 }}>{ind.industry_title}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "'Source Serif 4', Georgia, serif", fontVariantNumeric: "tabular-nums" }}>{ind.employment.toLocaleString()}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                                    <div style={{ width: 60, height: 6, background: colors.warmGray, borderRadius: 3 }}>
                                      <div style={{ height: 6, borderRadius: 3, width: `${Math.min(ind.share, 100)}%`, background: colors.accent }} />
                                    </div>
                                    <span style={{ fontVariantNumeric: "tabular-nums", width: 40 }}>{ind.share.toFixed(1)}%</span>
                                  </div>
                                </td>
                                <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{ind.establishments.toLocaleString()}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>${ind.avg_weekly_wage.toLocaleString()}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: ind.annual_wages > 60000 ? colors.positive : colors.textSecondary }}>${ind.annual_wages.toLocaleString()}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                  {ind.location_quotient ? (
                                    <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 12, background: ind.location_quotient > 1.2 ? colors.positiveBg : ind.location_quotient < 0.8 ? colors.cautionBg : colors.neutralBg, color: ind.location_quotient > 1.2 ? colors.positive : ind.location_quotient < 0.8 ? colors.caution : colors.neutral }}>
                                      {ind.location_quotient.toFixed(2)}
                                    </span>
                                  ) : "\u2014"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* AI exposure by industry cross-reference */}
                      {topIndustries.length > 0 && (
                        <div style={{ marginTop: 24, padding: "16px 20px", borderRadius: 10, background: colors.aiPurpleLight, border: `1px solid #E0D4F5` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <span style={{ fontSize: 16 }}>{"\u2728"}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: colors.aiPurple }}>AI disruption risk by sector</span>
                          </div>
                          <p style={{ fontSize: 13, color: colors.textSecondary, margin: "0 0 12px", lineHeight: 1.5 }}>
                            Cross-referencing QCEW employment data with AI exposure scores to identify sectors most at risk of workforce disruption.
                          </p>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                            {topIndustries.map((ind, i) => {
                              const score = (ind.score || 0.5) * 100;
                              const riskColor = score > 65 ? colors.scoreRed : score > 40 ? colors.scoreAmber : colors.scoreGreen;
                              const riskLabel = score > 65 ? "High risk" : score > 40 ? "Moderate risk" : "Lower risk";
                              return (
                                <div key={i} style={{ padding: "12px 14px", borderRadius: 8, background: colors.card }}>
                                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>{ind.title}</div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <div style={{ flex: 1, height: 5, background: "#E0DFDA", borderRadius: 3 }}>
                                      <div style={{ height: 5, borderRadius: 3, width: `${score}%`, background: riskColor }} />
                                    </div>
                                    <span style={{ fontSize: 11, color: riskColor, fontWeight: 500 }}>{riskLabel}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 8, background: colors.warmGray, fontSize: 12, color: colors.textSecondary }}>
                        Source: BLS Quarterly Census of Employment and Wages, Q3 2023. Private sector only. LQ = Location Quotient (values above 1.0 indicate higher concentration than national average).
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: 32 }}>
                      <div style={{ padding: 24, borderRadius: 10, background: colors.neutralBg, textAlign: "center", fontSize: 14, color: colors.textSecondary }}>
                        Industry data is not yet available for {jurisdiction?.county_name}. QCEW data covers major metropolitan and mid-size counties. Check back as we expand coverage.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ==================== GRANTS TAB ==================== */}
            {activeTab === "grants" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ background: colors.card, borderRadius: 16, border: `1px solid ${colors.cardBorder}`, overflow: "hidden" }}>
                  <div style={{ padding: "24px 32px", borderBottom: `1px solid ${colors.cardBorder}` }}>
                    <div style={{ fontSize: 13, color: colors.textSecondary, textTransform: "uppercase", marginBottom: 4 }}>Federal funding</div>
                    <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "'Source Serif 4', Georgia, serif", lineHeight: 1.35, marginBottom: 8 }}>
                      {grantsData.summary?.total_awards > 0
                        ? `$${(grantsData.summary.total_amount / 1000000).toFixed(1)}M in federal grants flowing into ${jurisdiction?.county_name}`
                        : `Federal grant data for ${jurisdiction?.county_name}`}
                    </div>
                    <p style={{ fontSize: 14, color: colors.textSecondary, margin: 0, lineHeight: 1.6 }}>
                      Federal awards and grants from USAspending.gov for FY2024. Includes economic development, workforce, infrastructure, and research funding.
                    </p>
                  </div>
                  {grantsLoading ? <div style={{ padding: 32 }}><LoadingSkeleton height={300} /></div> : grantsData.awards?.length > 0 ? (
                    <div style={{ padding: "24px 32px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
                        {[
                          { label: "Total federal awards", value: grantsData.summary.total_awards.toLocaleString(), sub: "FY2024" },
                          { label: "Total obligations", value: `$${(grantsData.summary.total_amount / 1000000).toFixed(1)}M`, sub: "federal dollars" },
                          { label: "Funding agencies", value: grantsData.summary.agencies?.length || 0, sub: grantsData.summary.agencies?.[0] || "" },
                        ].map((s, i) => (
                          <div key={i} style={{ padding: "16px 18px", borderRadius: 10, background: colors.warmGray }}>
                            <div style={{ fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", marginBottom: 4 }}>{s.label}</div>
                            <div style={{ fontSize: 26, fontWeight: 600, fontFamily: "'Source Serif 4', Georgia, serif", color: colors.accent }}>{s.value}</div>
                            <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{s.sub}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr style={{ borderBottom: `2px solid ${colors.cardBorder}` }}>
                              {["Recipient", "Amount", "Agency", "Description"].map(h => (
                                <th key={h} style={{ padding: "8px 12px", textAlign: h === "Amount" ? "right" : "left", fontWeight: 500, color: colors.textSecondary, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {grantsData.awards.slice(0, 25).map((a, i) => (
                              <tr key={i} style={{ borderBottom: `1px solid ${colors.warmGray}` }}>
                                <td style={{ padding: "10px 12px", fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.recipient}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "'Source Serif 4', Georgia, serif", fontVariantNumeric: "tabular-nums", color: a.amount > 0 ? colors.positive : colors.caution }}>
                                  {a.amount > 0 ? "+" : ""}{a.amount >= 1000000 ? `$${(a.amount / 1000000).toFixed(1)}M` : a.amount >= 1000 ? `$${(a.amount / 1000).toFixed(0)}K` : `$${a.amount.toFixed(0)}`}
                                </td>
                                <td style={{ padding: "10px 12px", color: colors.textSecondary, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.agency}</td>
                                <td style={{ padding: "10px 12px", color: colors.textSecondary, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.description || "\u2014"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 8, background: colors.warmGray, fontSize: 12, color: colors.textSecondary }}>
                        Source: USAspending.gov, FY2024 (Oct 2023 \u2013 Sep 2024). Includes grants, cooperative agreements, and direct payments.
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: 32 }}>
                      <div style={{ padding: 24, borderRadius: 10, background: colors.neutralBg, textAlign: "center", fontSize: 14, color: colors.textSecondary }}>
                        Federal grant data is being compiled for {jurisdiction?.county_name}. Coverage currently includes the top 10 metro areas.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ==================== COMPARE TAB ==================== */}
            {activeTab === "compare" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ background: colors.card, borderRadius: 12, border: `1px solid ${colors.cardBorder}`, padding: "24px 28px" }}>
                  <div style={{ fontSize: 18, fontWeight: 600, fontFamily: "'Source Serif 4', Georgia, serif", marginBottom: 4 }}>
                    {jurisdiction?.state_name || "State"} counties
                  </div>
                  <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 20 }}>
                    {stateData.length} counties ranked by Resilience Score
                  </div>
                  {stateData.length > 0 ? (
                    <div>
                      {stateData.map((county, i) => {
                        const isMe = county.fips === fips;
                        const scoreColor = county.score >= 70 ? colors.scoreGreen : county.score >= 50 ? colors.scoreAmber : colors.scoreRed;
                        return (
                          <div key={county.fips}
                            onClick={() => { if (!isMe) setFips(county.fips); }}
                            style={{
                              display: "flex", alignItems: "center", gap: 12,
                              borderBottom: i < stateData.length - 1 ? `1px solid ${colors.warmGray}` : "none",
                              cursor: isMe ? "default" : "pointer",
                              background: isMe ? colors.accentLight : "transparent",
                              margin: isMe ? "0 -12px" : 0,
                              padding: isMe ? "10px 12px" : "10px 0",
                              borderRadius: isMe ? 8 : 0,
                            }}>
                            <span style={{ width: 28, fontSize: 12, fontWeight: 500, color: colors.textTertiary, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>#{i + 1}</span>
                            <span style={{ flex: 1, fontSize: 13, fontWeight: isMe ? 600 : 400, color: isMe ? colors.accent : colors.text }}>{county.name}</span>
                            <div style={{ width: 100, height: 6, background: colors.warmGray, borderRadius: 3 }}>
                              <div style={{ height: 6, borderRadius: 3, width: `${county.score}%`, background: isMe ? colors.accent : scoreColor, transition: "width 0.5s ease" }} />
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 600, width: 32, textAlign: "right", fontVariantNumeric: "tabular-nums", fontFamily: "'Source Serif 4', Georgia, serif", color: isMe ? colors.accent : scoreColor }}>{Math.round(county.score)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ padding: 24, borderRadius: 10, background: colors.neutralBg, textAlign: "center", fontSize: 14, color: colors.textSecondary }}>
                      No scored counties in {jurisdiction?.state_name || "this state"} yet.
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
