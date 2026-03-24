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
        // Get count of counties scoring higher (for rank calculation)
        const { count: higherCount } = await supabase
          .from("resilience_scores")
          .select("fips_code", { count: "exact", head: true })
          .gt("overall_score", currentScore);
        const { count: totalCount } = await supabase
          .from("resilience_scores")
          .select("fips_code", { count: "exact", head: true });
        setRank((higherCount || 0) + 1);
        setTotal(totalCount || 0);

        // Fetch peers: counties with similar scores (±8 points)
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

        // Find current county position and show ±4 peers
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
        if (error) {
          console.error(error);
          return;
        }
        if (rows && rows.length > 0) {
          const sum = rows.reduce(
            (s, r) => s + parseFloat(r.unemployment_rate),
            0
          );
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
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }
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
    } catch (e) {
      console.error(e);
    }
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
        // Monthly summary
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
// DESIGN SYSTEM
// ============================================================
const colors = {
  bg: "#FAFAF8",
  card: "#FFFFFF",
  cardBorder: "#E8E6E1",
  text: "#1A1A18",
  textSecondary: "#6B6B66",
  textTertiary: "#9C9A92",
  accent: "#1B6B4A",
  accentLight: "#E8F5EE",
  accentMid: "#3DA07A",
  scoreGreen: "#1B8F5A",
  scoreAmber: "#C17A1A",
  scoreRed: "#C43D3D",
  chartBlue: "#2B6CB0",
  chartBlueLine: "#3B82C4",
  chartBlueArea: "rgba(43, 108, 176, 0.08)",
  chartPeerLine: "#C4A23B",
  chartPeerDash: "4 3",
  chartGreen: "#2D8A5E",
  chartGreenArea: "rgba(45, 138, 94, 0.08)",
  chartCoral: "#C45B3B",
  chartCoralArea: "rgba(196, 91, 59, 0.06)",
  positive: "#1B7A4A",
  positiveBg: "#ECFAF2",
  caution: "#A06B1A",
  cautionBg: "#FFF8EC",
  neutral: "#5A6B7A",
  neutralBg: "#F0F2F5",
  warmGray: "#F5F4F1",
};

// ============================================================
// CHART COMPONENT
// ============================================================
function AreaChart({
  data,
  xKey,
  yKeys,
  colors: chartColors,
  height = 220,
  peerKey,
  peerColor,
  peerDash,
}) {
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  if (!data || data.length < 2) return null;

  const padL = 48,
    padR = 16,
    padT = 16,
    padB = 32;
  const w = 600,
    h = height;
  const cw = w - padL - padR,
    ch = h - padT - padB;

  const allVals = data
    .flatMap((d) =>
      yKeys.map((k) => d[k]).concat(peerKey ? [d[peerKey]] : [])
    )
    .filter((v) => v != null);
  const niceMin = Math.floor(Math.min(...allVals) * 10) / 10;
  const niceMax = Math.ceil(Math.max(...allVals) * 10) / 10;
  const niceRange = niceMax - niceMin || 1;

  const xScale = (i) => padL + (i / (data.length - 1)) * cw;
  const yScale = (v) => padT + ch - ((v - niceMin) / niceRange) * ch;

  const makePath = (key) =>
    data
      .map(
        (d, i) =>
          `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(d[key]).toFixed(1)}`
      )
      .join(" ");

  const makeArea = (key) =>
    `${makePath(key)} L${xScale(data.length - 1).toFixed(1)},${(padT + ch).toFixed(1)} L${padL},${(padT + ch).toFixed(1)} Z`;

  const ticks = 5;
  const yTicks = Array.from(
    { length: ticks },
    (_, i) => niceMin + (niceRange / (ticks - 1)) * i
  );
  const xLabelInterval = Math.ceil(data.length / 6);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      onMouseMove={(e) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mx = ((e.clientX - rect.left) / rect.width) * w;
        const idx = Math.round(((mx - padL) / cw) * (data.length - 1));
        if (idx >= 0 && idx < data.length) setHover(idx);
      }}
      onMouseLeave={() => setHover(null)}
    >
      {yTicks.map((v, i) => (
        <g key={i}>
          <line
            x1={padL}
            y1={yScale(v)}
            x2={w - padR}
            y2={yScale(v)}
            stroke={colors.cardBorder}
            strokeWidth="0.5"
          />
          <text
            x={padL - 6}
            y={yScale(v)}
            textAnchor="end"
            dominantBaseline="central"
            fill={colors.textSecondary}
            fontSize="11.5"
            fontFamily="'DM Sans', system-ui"
          >
            {v.toFixed(1)}
          </text>
        </g>
      ))}
      {data.map((d, i) =>
        i % xLabelInterval === 0 || i === data.length - 1 ? (
          <text
            key={i}
            x={xScale(i)}
            y={h - 6}
            textAnchor="middle"
            fill={colors.textSecondary}
            fontSize="11"
            fontFamily="'DM Sans', system-ui"
          >
            {d[xKey]}
          </text>
        ) : null
      )}
      {yKeys.map((key, ki) => (
        <path
          key={`area-${key}`}
          d={makeArea(key)}
          fill={chartColors[ki]?.area || "transparent"}
        />
      ))}
      {peerKey && (
        <path
          d={makePath(peerKey)}
          fill="none"
          stroke={peerColor}
          strokeWidth="1.5"
          strokeDasharray={peerDash}
          opacity="0.6"
        />
      )}
      {yKeys.map((key, ki) => (
        <path
          key={`line-${key}`}
          d={makePath(key)}
          fill="none"
          stroke={chartColors[ki]?.line || colors.chartBlue}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {hover !== null && (
        <g>
          <line
            x1={xScale(hover)}
            y1={padT}
            x2={xScale(hover)}
            y2={padT + ch}
            stroke={colors.textTertiary}
            strokeWidth="0.5"
            strokeDasharray="3 2"
          />
          {yKeys.map((key, ki) => (
            <circle
              key={key}
              cx={xScale(hover)}
              cy={yScale(data[hover][key])}
              r="4"
              fill={chartColors[ki]?.line || colors.chartBlue}
              stroke={colors.card}
              strokeWidth="2"
            />
          ))}
          {peerKey && data[hover][peerKey] != null && (
            <circle
              cx={xScale(hover)}
              cy={yScale(data[hover][peerKey])}
              r="3"
              fill={peerColor}
              stroke={colors.card}
              strokeWidth="2"
            />
          )}
        </g>
      )}
    </svg>
  );
}

// ============================================================
// SCORE RING COMPONENT
// ============================================================
function ScoreRing({ score, size = 110, trend, trendDelta }) {
  const strokeW = 8;
  const r = (size - strokeW) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const scoreColor =
    score >= 70
      ? colors.scoreGreen
      : score >= 50
        ? colors.scoreAmber
        : colors.scoreRed;
  const trendColor =
    trend === "improving"
      ? colors.positive
      : trend === "declining"
        ? colors.caution
        : colors.neutral;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}
    >
      <div style={{ position: "relative", width: size, height: size }}>
        <svg
          width={size}
          height={size}
          style={{ transform: "rotate(-90deg)" }}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={colors.warmGray}
            strokeWidth={strokeW}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={scoreColor}
            strokeWidth={strokeW}
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s ease" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: 32,
              fontWeight: 600,
              color: scoreColor,
              lineHeight: 1,
              fontFamily: "'Source Serif 4', Georgia, serif",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {score}
          </span>
          <span
            style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}
          >
            of 100
          </span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 10px",
          borderRadius: 12,
          background:
            trend === "improving"
              ? colors.positiveBg
              : trend === "declining"
                ? colors.cautionBg
                : colors.neutralBg,
        }}
      >
        <span style={{ fontSize: 11, color: trendColor }}>
          {trend === "improving" ? "\u25B2" : trend === "declining" ? "\u25BC" : "\u2014"}
        </span>
        <span style={{ fontSize: 12, fontWeight: 500, color: trendColor }}>
          {trendDelta > 0 ? "+" : ""}
          {parseFloat(trendDelta || 0).toFixed(1)} pts
        </span>
      </div>
    </div>
  );
}

// ============================================================
// LOADING SKELETON
// ============================================================
function LoadingSkeleton({ height = 200 }) {
  return (
    <div
      style={{
        height,
        borderRadius: 12,
        background: `linear-gradient(90deg, ${colors.warmGray} 25%, #EEEDEA 50%, ${colors.warmGray} 75%)`,
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite",
      }}
    >
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}

// ============================================================
// HELPERS
// ============================================================
const MONTH_ABBR = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function fmtMonth(year, month) {
  return `${MONTH_ABBR[month]} ${String(year).slice(2)}`;
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
  const { score: resilienceScore, loading: sLoading } =
    useResilienceScore(fips);
  const score = resilienceScore ? parseFloat(resilienceScore.overall_score) : null;
  const { peers, rank: peerRank, total: peerTotal, loading: pLoading } = usePeerScores(fips, score);
  const { results: searchResults, search, searching } = useCountySearch();

  const latestLaus = lausData.length > 0 ? lausData[lausData.length - 1] : null;
  const threeMonthAgo =
    lausData.length >= 4 ? lausData[lausData.length - 4] : null;
  const nationalAvg = useNationalAverage(latestLaus?.year, latestLaus?.month);

  const isLoading = jLoading || sLoading; // Don't show skeleton when just changing time period

  const chartData = lausData.map((d) => ({
    month: fmtMonth(d.year, d.month),
    rate: parseFloat(d.unemployment_rate),
    laborForce: d.labor_force,
  }));

  const chartDataWithPeer = chartData.map((d) => ({
    ...d,
    peer: nationalAvg || d.rate + 0.5,
  }));

  const lfNow = latestLaus?.labor_force;
  const lfFirst = lausData.length > 0 ? lausData[0].labor_force : null;
  const lfChange = lfNow && lfFirst ? lfNow - lfFirst : 0;

  const { briefing } = useAiBriefing(fips);
  const { warnFilings } = useWarnFilings(fips);
  const { bizData } = useBusinessActivity(fips);
  const { stateData } = useStateComparison(jurisdiction?.state_abbr);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "labor", label: "Labor market" },
    { id: "alerts", label: "Alerts" + (warnFilings.length > 0 ? ` (${warnFilings.length})` : "") },
    { id: "compare", label: "Compare" },
  ];

  const scoreComponents = resilienceScore
    ? [
        {
          label: "Unemployment vs national",
          score: parseFloat(resilienceScore.unemployment_score),
          weight: 30,
        },
        {
          label: "Unemployment trend (3mo)",
          score: parseFloat(resilienceScore.unemployment_trend_score),
          weight: 15,
        },
        {
          label: "Labor force size",
          score: parseFloat(resilienceScore.labor_force_score),
          weight: 10,
        },
        {
          label: "Labor force trend",
          score: parseFloat(resilienceScore.job_posting_score),
          weight: 10,
        },
        {
          label: "Business formation",
          score: parseFloat(resilienceScore.business_formation_score),
          weight: 15,
        },
        {
          label: "WARN activity",
          score: parseFloat(resilienceScore.warn_activity_score),
          weight: 20,
        },
      ]
    : [];

  return (
    <div
      style={{
        fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
        background: colors.bg,
        minHeight: "100vh",
        color: colors.text,
      }}
    >
      {/* Header */}
      <header
        style={{
          background: colors.card,
          borderBottom: `1px solid ${colors.cardBorder}`,
          padding: "0 28px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect
                x="2"
                y="16"
                width="4.5"
                height="6"
                rx="1.2"
                fill={colors.accent}
                opacity="0.4"
              />
              <rect
                x="9.75"
                y="10"
                width="4.5"
                height="12"
                rx="1.2"
                fill={colors.accent}
                opacity="0.7"
              />
              <rect
                x="17.5"
                y="4"
                width="4.5"
                height="18"
                rx="1.2"
                fill={colors.accent}
              />
            </svg>
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: colors.text,
              }}
            >
              Resilience{" "}
              <span style={{ fontWeight: 400, color: colors.textSecondary }}>
                IQ
              </span>
            </span>
          </div>
          <div
            style={{ width: 1, height: 24, background: colors.cardBorder }}
          />
          <nav
            style={{
              display: "flex",
              gap: 2,
              height: 56,
              alignItems: "stretch",
            }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "0 14px",
                  fontSize: 13,
                  fontWeight: 500,
                  color:
                    activeTab === tab.id ? colors.text : colors.textTertiary,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  borderBottom: `2px solid ${activeTab === tab.id ? colors.accent : "transparent"}`,
                  borderTop: "2px solid transparent",
                  transition: "all 0.15s ease",
                  fontFamily: "inherit",
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background: colors.scoreGreen,
              }}
            />
            <span style={{ fontSize: 11.5, color: colors.textTertiary }}>
              {latestLaus
                ? `Updated ${fmtMonth(latestLaus.year, latestLaus.month)}`
                : "Loading..."}
            </span>
          </div>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px 6px 10px",
                borderRadius: 8,
                border: `1px solid ${colors.cardBorder}`,
                background: colors.bg,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <div style={{ textAlign: "left" }}>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: colors.text,
                    lineHeight: 1.2,
                  }}
                >
                  {jurisdiction?.county_name || "Loading..."}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: colors.textTertiary,
                    lineHeight: 1.2,
                  }}
                >
                  {jurisdiction
                    ? `${jurisdiction.state_abbr} \u00B7 FIPS ${fips}`
                    : ""}
                </div>
              </div>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path
                  d="M2.5 4L5 6.5L7.5 4"
                  stroke={colors.textTertiary}
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {searchOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: 4,
                  width: 300,
                  background: colors.card,
                  borderRadius: 10,
                  border: `1px solid ${colors.cardBorder}`,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                  zIndex: 100,
                  overflow: "hidden",
                }}
              >
                <input
                  autoFocus
                  placeholder="Search counties..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    search(e.target.value);
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "none",
                    borderBottom: `1px solid ${colors.cardBorder}`,
                    fontSize: 14,
                    fontFamily: "inherit",
                    outline: "none",
                    background: "transparent",
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ maxHeight: 240, overflowY: "auto" }}>
                  {searching && (
                    <div
                      style={{
                        padding: "12px 16px",
                        fontSize: 13,
                        color: colors.textTertiary,
                      }}
                    >
                      Searching...
                    </div>
                  )}
                  {searchResults.map((r) => (
                    <div
                      key={r.fips_code}
                      onClick={() => {
                        setFips(r.fips_code);
                        setSearchOpen(false);
                        setSearchQuery("");
                      }}
                      style={{
                        padding: "10px 16px",
                        cursor: "pointer",
                        fontSize: 13,
                        borderBottom: `1px solid ${colors.warmGray}`,
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = colors.warmGray)
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <span style={{ fontWeight: 500 }}>{r.county_name}</span>
                      <span style={{ color: colors.textTertiary }}>
                        {r.state_abbr} \u00B7 {r.fips_code}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "24px 24px 64px",
        }}
      >
        {/* Time period selector */}
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
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <LoadingSkeleton height={180} />
            <div
              className="grid-4"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 16,
              }}
            >
              {[1, 2, 3, 4].map((i) => (
                <LoadingSkeleton key={i} height={110} />
              ))}
            </div>
            <div
              className="grid-2"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 20,
              }}
            >
              <LoadingSkeleton height={260} />
              <LoadingSkeleton height={260} />
            </div>
          </div>
        ) : (
          <>
            {activeTab === "overview" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 20,
                }}
              >
                {/* Hero */}
                <div
                  style={{
                    background: colors.card,
                    borderRadius: 16,
                    border: `1px solid ${colors.cardBorder}`,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "28px 32px 24px",
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      gap: 28,
                      alignItems: "center",
                      borderBottom: `1px solid ${colors.cardBorder}`,
                    }}
                  >
                    {score !== null && (
                      <ScoreRing
                        score={Math.round(score)}
                        trend={resilienceScore?.trend || "new"}
                        trendDelta={resilienceScore?.trend_delta}
                      />
                    )}
                    <div style={{ display: "flex", gap: 1, height: 68 }}>
                      {[
                        {
                          label: "Unemployment",
                          value: latestLaus
                            ? `${parseFloat(latestLaus.unemployment_rate).toFixed(1)}%`
                            : "\u2014",
                          sub: nationalAvg
                            ? `vs ${nationalAvg}% national`
                            : "",
                          good:
                            latestLaus && nationalAvg
                              ? parseFloat(latestLaus.unemployment_rate) <
                                nationalAvg
                              : true,
                        },
                        {
                          label: "Labor force",
                          value: lfNow ? lfNow.toLocaleString() : "\u2014",
                          sub:
                            lfChange !== 0
                              ? `${lfChange > 0 ? "+" : ""}${lfChange.toLocaleString()} over ${lausData.length}mo`
                              : "",
                          good: lfChange >= 0,
                        },
                        {
                          label: "Employed",
                          value: latestLaus
                            ? parseInt(latestLaus.employed).toLocaleString()
                            : "\u2014",
                          sub: latestLaus
                            ? `${((latestLaus.employed / latestLaus.labor_force) * 100).toFixed(1)}% participation`
                            : "",
                          good: true,
                        },
                        {
                          label: "Unemployed",
                          value: latestLaus
                            ? parseInt(latestLaus.unemployed).toLocaleString()
                            : "\u2014",
                          sub: threeMonthAgo
                            ? `${parseInt(latestLaus.unemployed) < parseInt(threeMonthAgo.unemployed) ? "\u25BC" : "\u25B2"} from 3mo ago`
                            : "",
                          good: threeMonthAgo
                            ? parseInt(latestLaus.unemployed) <=
                              parseInt(threeMonthAgo.unemployed)
                            : true,
                        },
                      ].map((stat, i) => (
                        <div
                          key={i}
                          style={{
                            flex: 1,
                            padding: "0 18px",
                            borderLeft:
                              i > 0
                                ? `1px solid ${colors.cardBorder}`
                                : "none",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              color: colors.textSecondary,
                              textTransform: "uppercase",
                              marginBottom: 5,
                            }}
                          >
                            {stat.label}
                          </span>
                          <span
                            style={{
                              fontSize: 22,
                              fontWeight: 600,
                              fontFamily: "'Source Serif 4', Georgia, serif",
                              fontVariantNumeric: "tabular-nums",
                              lineHeight: 1,
                            }}
                          >
                            {stat.value}
                          </span>
                          <span
                            style={{
                              fontSize: 12.5,
                              color: stat.good
                                ? colors.positive
                                : colors.caution,
                              fontWeight: 500,
                              marginTop: 4,
                            }}
                          >
                            {stat.sub}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                        padding: "8px 20px",
                        borderLeft: `1px solid ${colors.cardBorder}`,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          color: colors.textSecondary,
                          textTransform: "uppercase",
                        }}
                      >
                        Peer rank
                      </span>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 3,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 28,
                            fontWeight: 600,
                            fontFamily: "'Source Serif 4', Georgia, serif",
                            color: colors.accent,
                          }}
                        >
                          {peerRank || "\u2014"}
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            color: colors.textSecondary,
                          }}
                        >
                          of {peerTotal.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Briefing */}
                  <div style={{ padding: "22px 32px 28px" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 12,
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                      >
                        <circle
                          cx="7"
                          cy="7"
                          r="6"
                          stroke={colors.accent}
                          strokeWidth="1.2"
                        />
                        <circle cx="7" cy="7" r="2" fill={colors.accent} />
                        <path
                          d="M7 1V3M7 11V13M1 7H3M11 7H13"
                          stroke={colors.accent}
                          strokeWidth="0.8"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: colors.accent,
                        }}
                      >
                        {briefing ? "AI economic briefing" : "Economic briefing"}
                      </span>
                      {briefing && (
                        <span style={{ fontSize: 11, color: colors.textTertiary, marginLeft: "auto" }}>
                          Powered by Claude
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 600,
                        color: colors.text,
                        lineHeight: 1.35,
                        fontFamily: "'Source Serif 4', Georgia, serif",
                        marginBottom: 12,
                      }}
                    >
                      {briefing
                        ? briefing.headline
                        : latestLaus && threeMonthAgo
                        ? parseFloat(latestLaus.unemployment_rate) <
                          parseFloat(threeMonthAgo.unemployment_rate)
                          ? `Unemployment is trending down in ${jurisdiction?.county_name}`
                          : `Unemployment is holding steady in ${jurisdiction?.county_name}`
                        : `Economic overview for ${jurisdiction?.county_name}`}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        lineHeight: 1.75,
                        color: colors.textSecondary,
                      }}
                    >
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
                                  <span style={{ color: colors.accent }}>•</span> {insight}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <p style={{ margin: 0 }}>
                            {jurisdiction?.county_name}&apos;s unemployment rate
                            stands at{" "}
                            {latestLaus
                              ? parseFloat(latestLaus.unemployment_rate).toFixed(1)
                              : "\u2014"}%
                            {nationalAvg
                              ? `, ${parseFloat(latestLaus?.unemployment_rate) < nationalAvg ? "below" : "above"} the national average of ${nationalAvg}%`
                              : ""}.
                            The labor force is {lfNow?.toLocaleString()} with{" "}
                            {latestLaus ? parseInt(latestLaus.employed).toLocaleString() : "\u2014"} employed.
                            {lfChange > 0 ? ` The labor force has grown by ${lfChange.toLocaleString()} over the past ${lausData.length} months.` : ""}
                          </p>
                          <p style={{ margin: "12px 0 0" }}>
                            The Resilience Score of {score !== null ? Math.round(score) : "\u2014"}/100
                            reflects the county&apos;s overall economic health relative to peer jurisdictions.
                            {resilienceScore?.trend === "new" ? " This is the first score calculation. Future updates will show trend direction." : ""}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Metric cards */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 16,
                  }}
                >
                  {[
                    {
                      label: "Unemployment rate",
                      value: latestLaus
                        ? `${parseFloat(latestLaus.unemployment_rate).toFixed(1)}%`
                        : "\u2014",
                      sub: threeMonthAgo
                        ? `${Math.abs(parseFloat(latestLaus.unemployment_rate) - parseFloat(threeMonthAgo.unemployment_rate)).toFixed(1)} pts from 3mo ago`
                        : "",
                      good: threeMonthAgo
                        ? parseFloat(latestLaus.unemployment_rate) <=
                          parseFloat(threeMonthAgo.unemployment_rate)
                        : true,
                      context: nationalAvg
                        ? `National avg: ${nationalAvg}%`
                        : "",
                    },
                    {
                      label: "Labor force",
                      value: lfNow ? lfNow.toLocaleString() : "\u2014",
                      sub:
                        lfChange !== 0
                          ? `${lfChange > 0 ? "+" : ""}${lfChange.toLocaleString()} over ${lausData.length}mo`
                          : "",
                      good: lfChange >= 0,
                      context: latestLaus
                        ? `${((latestLaus.employed / latestLaus.labor_force) * 100).toFixed(0)}% participation`
                        : "",
                    },
                    {
                      label: "Score components",
                      value: scoreComponents
                        .filter((c) => c.score >= 70)
                        .length.toString(),
                      sub: `of ${scoreComponents.length} above 70`,
                      good:
                        scoreComponents.filter((c) => c.score >= 70).length >=
                        3,
                      context:
                        scoreComponents.length > 0
                          ? `Weakest: ${scoreComponents.reduce((a, b) => (a.score < b.score ? a : b)).label}`
                          : "",
                    },
                    {
                      label: "Peer standing",
                      value: peerRank ? `#${peerRank.toLocaleString()}` : "\u2014",
                      sub: `of ${peerTotal.toLocaleString()} counties`,
                      good: peerRank ? peerRank <= peerTotal * 0.5 : true,
                      context: peerRank ? `Top ${((peerRank / peerTotal) * 100).toFixed(0)}% nationally` : "",
                    },
                  ].map((card, i) => (
                    <div
                      key={i}
                      style={{
                        background: colors.card,
                        borderRadius: 12,
                        border: `1px solid ${colors.cardBorder}`,
                        padding: "20px 22px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12.5,
                          color: colors.textSecondary,
                        }}
                      >
                        {card.label}
                      </div>
                      <span
                        style={{
                          fontSize: 30,
                          fontWeight: 600,
                          lineHeight: 1,
                          fontFamily: "'Source Serif 4', Georgia, serif",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {card.value}
                      </span>
                      <div
                        style={{
                          fontSize: 13,
                          color: card.good
                            ? colors.positive
                            : colors.caution,
                          fontWeight: 500,
                        }}
                      >
                        {card.sub}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: colors.textSecondary,
                          marginTop: 2,
                        }}
                      >
                        {card.context}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Charts */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 20,
                  }}
                >
                  <div
                    style={{
                      background: colors.card,
                      borderRadius: 12,
                      border: `1px solid ${colors.cardBorder}`,
                      padding: "20px 24px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        color: colors.textSecondary,
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                    >
                      Unemployment rate
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 500,
                        marginBottom: 12,
                      }}
                    >
                      {latestLaus && nationalAvg
                        ? parseFloat(latestLaus.unemployment_rate) <
                          nationalAvg
                          ? "Below national average"
                          : "Tracking national average"
                        : "Monthly trend"}{" "}
                      <span style={{ fontWeight: 400, color: colors.textTertiary, fontSize: 12 }}>({timePeriod}mo)</span>
                    </div>
                    <AreaChart
                      data={chartDataWithPeer}
                      xKey="month"
                      yKeys={["rate"]}
                      colors={[
                        {
                          line: colors.chartBlueLine,
                          area: colors.chartBlueArea,
                        },
                      ]}
                      peerKey="peer"
                      peerColor={colors.chartPeerLine}
                      peerDash={colors.chartPeerDash}
                      height={200}
                    />
                    <div
                      style={{
                        display: "flex",
                        gap: 16,
                        marginTop: 8,
                        fontSize: 12.5,
                        color: colors.textSecondary,
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <span
                          style={{
                            width: 18,
                            height: 2.5,
                            background: colors.chartBlueLine,
                            display: "inline-block",
                            borderRadius: 1,
                          }}
                        ></span>
                        {jurisdiction?.county_name || "County"}
                      </span>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <span
                          style={{
                            width: 18,
                            height: 2.5,
                            background: colors.chartPeerLine,
                            display: "inline-block",
                            borderRadius: 1,
                          }}
                        ></span>
                        National average
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      background: colors.card,
                      borderRadius: 12,
                      border: `1px solid ${colors.cardBorder}`,
                      padding: "20px 24px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        color: colors.textSecondary,
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                    >
                      Peer comparison
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 500,
                        marginBottom: 16,
                      }}
                    >
                      Resilience score vs. similar counties
                    </div>
                    {peers
                      .sort((a, b) => b.score - a.score)
                      .map((county, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: "8px 0",
                            borderBottom:
                              i < peers.length - 1
                                ? `1px solid ${colors.warmGray}`
                                : "none",
                            cursor: county.isCurrent
                              ? "default"
                              : "pointer",
                          }}
                          onClick={() => {
                            if (!county.isCurrent) setFips(county.fips);
                          }}
                        >
                          <span
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 11,
                              fontSize: 11,
                              fontWeight: 500,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: county.isCurrent
                                ? colors.accent
                                : colors.warmGray,
                              color: county.isCurrent
                                ? "#fff"
                                : colors.textTertiary,
                            }}
                          >
                            {i + 1}
                          </span>
                          <span
                            style={{
                              flex: 1,
                              fontSize: 13,
                              fontWeight: county.isCurrent ? 600 : 400,
                              color: county.isCurrent
                                ? colors.text
                                : colors.textSecondary,
                            }}
                          >
                            {county.name}
                          </span>
                          <div
                            style={{
                              width: 120,
                              height: 6,
                              background: colors.warmGray,
                              borderRadius: 3,
                            }}
                          >
                            <div
                              style={{
                                height: 6,
                                borderRadius: 3,
                                width: `${county.score}%`,
                                background: county.isCurrent
                                  ? colors.accent
                                  : colors.textTertiary,
                              }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              width: 28,
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                              color: county.isCurrent
                                ? colors.accent
                                : colors.textSecondary,
                            }}
                          >
                            {Math.round(county.score)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Score breakdown */}
                {scoreComponents.length > 0 && (
                  <div
                    style={{
                      background: colors.card,
                      borderRadius: 12,
                      border: `1px solid ${colors.cardBorder}`,
                      padding: "20px 24px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        color: colors.textSecondary,
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                    >
                      Score breakdown
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 500,
                        marginBottom: 16,
                      }}
                    >
                      How your Resilience Score is calculated
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: 12,
                      }}
                    >
                      {scoreComponents.map((comp, i) => {
                        const compColor =
                          comp.score >= 70
                            ? colors.scoreGreen
                            : comp.score >= 50
                              ? colors.scoreAmber
                              : colors.scoreRed;
                        return (
                          <div
                            key={i}
                            style={{
                              padding: "16px 18px",
                              borderRadius: 10,
                              background: colors.warmGray,
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 13,
                                  color: colors.text,
                                }}
                              >
                                {comp.label}
                              </span>
                              <span
                                style={{
                                  fontSize: 12,
                                  color: colors.textSecondary,
                                }}
                              >
                                {comp.weight}%
                              </span>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "baseline",
                                gap: 4,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 26,
                                  fontWeight: 600,
                                  color: compColor,
                                  fontFamily:
                                    "'Source Serif 4', Georgia, serif",
                                  fontVariantNumeric: "tabular-nums",
                                }}
                              >
                                {Math.round(comp.score)}
                              </span>
                              <span
                                style={{
                                  fontSize: 13,
                                  color: colors.textSecondary,
                                }}
                              >
                                /100
                              </span>
                            </div>
                            <div
                              style={{
                                height: 5,
                                background: "#E0DFDA",
                                borderRadius: 3,
                              }}
                            >
                              <div
                                style={{
                                  height: 5,
                                  borderRadius: 3,
                                  width: `${comp.score}%`,
                                  background: compColor,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div
                  style={{
                    background: colors.warmGray,
                    borderRadius: 12,
                    padding: "16px 24px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{ fontSize: 13, color: colors.textSecondary }}
                  >
                    Data: BLS LAUS (monthly) \u00B7 Algorithm v1 \u00B7{" "}
                    {lausData.length} months loaded
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: colors.accent,
                      fontWeight: 500,
                      padding: "5px 12px",
                      borderRadius: 6,
                      background: colors.accentLight,
                    }}
                  >
                    View methodology
                  </div>
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
                    style={{ fontSize: 12.5, color: colors.accent, fontWeight: 500, padding: "5px 12px", borderRadius: 6, background: colors.accentLight, border: "none", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Export CSV
                  </button>
                </div>
              </div>
            )}

            {activeTab === "labor" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 20,
                }}
              >
                <div
                  style={{
                    background: colors.card,
                    borderRadius: 12,
                    border: `1px solid ${colors.cardBorder}`,
                    padding: "24px 28px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 600,
                      fontFamily: "'Source Serif 4', Georgia, serif",
                      marginBottom: 4,
                    }}
                  >
                    Labor market deep dive
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: colors.textSecondary,
                      marginBottom: 20,
                    }}
                  >
                    {lausData.length}-month trend for{" "}
                    {jurisdiction?.county_name}
                  </div>
                  <AreaChart
                    data={chartDataWithPeer}
                    xKey="month"
                    yKeys={["rate"]}
                    colors={[
                      {
                        line: colors.chartBlueLine,
                        area: colors.chartBlueArea,
                      },
                    ]}
                    peerKey="peer"
                    peerColor={colors.chartPeerLine}
                    peerDash={colors.chartPeerDash}
                    height={280}
                  />
                </div>
                <div
                  style={{
                    background: colors.card,
                    borderRadius: 12,
                    border: `1px solid ${colors.cardBorder}`,
                    padding: "24px 28px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      marginBottom: 16,
                    }}
                  >
                    Labor force over time
                  </div>
                  <AreaChart
                    data={chartData.map((d) => ({
                      ...d,
                      lf: d.laborForce / 1000,
                    }))}
                    xKey="month"
                    yKeys={["lf"]}
                    colors={[
                      {
                        line: colors.chartGreen,
                        area: colors.chartGreenArea,
                      },
                    ]}
                    height={200}
                  />
                </div>
              </div>
            )}

            {activeTab === "alerts" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* WARN Filings */}
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
                              <td style={{ padding: "10px 12px", color: colors.textSecondary }}>{f.effective_date || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ padding: 24, borderRadius: 10, background: colors.positiveBg, textAlign: "center", fontSize: 14, color: colors.positive }}>
                      No active WARN filings — a positive signal for employment stability.
                    </div>
                  )}
                </div>
                {/* Business Activity */}
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
                      <AreaChart
                        data={bizData.summary.map(m => ({ month: m.month.slice(5), net: m.net, newBiz: m.new }))}
                        xKey="month" yKeys={["net"]}
                        colors={[{ line: colors.chartGreen, area: colors.chartGreenArea }]}
                        height={180}
                      />
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
                              display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
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
                      No scored counties in {jurisdiction?.state_name || "this state"} yet. Scores are calculated after BLS data is ingested.
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
