import { useEffect, useState, useMemo } from "react";
import "./App.css";
import axios from "axios";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface FoodItem {
  name: string;
  portion_grams: number;
  energy_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface ParsedJson {
  meal_type?: string;
  items?: FoodItem[];
  total_estimated_kcal?: number;
}

interface FoodEntry {
  id: string;
  timestamp: string;
  imagePathOrUrl: string;
  captionText?: string | null;
  aiParsedJson?: ParsedJson | null;
}

interface StatsResponse {
  totalMeals: number;
  totalKcal: number;
  foodEntries: FoodEntry[];
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const rangeOptions = [1, 7, 14, 30];

// Small helper: group by date + sum kcal
function useDailyTotals(stats: StatsResponse | null) {
  return useMemo(() => {
    if (!stats) return [];

    const map: Record<
      string,
      { date: string; totalKcal: number; meals: number }
    > = {};

    for (const entry of stats.foodEntries) {
      const d = new Date(entry.timestamp);
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD

      const json = entry.aiParsedJson || {};
      const kcal = json.total_estimated_kcal || 0;

      if (!map[key]) {
        map[key] = {
          date: key,
          totalKcal: 0,
          meals: 0,
        };
      }
      map[key].totalKcal += kcal;
      map[key].meals += 1;
    }

    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [stats]);
}

function friendlyDayLabel(dateStr: string) {
  const today = new Date();
  const target = new Date(dateStr);

  const todayKey = today.toISOString().slice(0, 10);
  const targetKey = target.toISOString().slice(0, 10);

  if (targetKey === todayKey) return "Today";

  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  if (targetKey === yesterdayKey) return "Yesterday";

  return target.toLocaleDateString();
}

function groupMealsByDate(stats: StatsResponse | null) {
  if (!stats) return [];

  const map: Record<
    string,
    { date: string; totalKcal: number; entries: FoodEntry[] }
  > = {};

  for (const entry of stats.foodEntries) {
    const d = new Date(entry.timestamp);
    const key = d.toISOString().slice(0, 10);

    const json = entry.aiParsedJson || {};
    const kcal = json.total_estimated_kcal || 0;

    if (!map[key]) {
      map[key] = { date: key, totalKcal: 0, entries: [] };
    }
    map[key].totalKcal += kcal;
    map[key].entries.push(entry);
  }

  return Object.values(map)
    .sort((a, b) => b.date.localeCompare(a.date)) // most recent day first
    .map((day) => ({
      ...day,
      entries: day.entries.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
    }));
}


function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [rangeDays, setRangeDays] = useState<number>(1);
  const groupedMeals = useMemo(() => groupMealsByDate(stats), [stats]);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.expand();
    tg?.ready?.();

    const user = tg?.initDataUnsafe?.user;
    const urlParams = new URLSearchParams(window.location.search);
    const debugUserId = urlParams.get("telegramUserId");

    let telegramUserId: number | null = null;

    if (user && user.id) {
      telegramUserId = user.id;
    } else if (debugUserId) {
      telegramUserId = Number(debugUserId);
    }

    if (!telegramUserId || Number.isNaN(telegramUserId)) {
      setError("Cannot detect Telegram user. Open this from the bot.");
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        setLoading(true);

        const res = await axios.get<StatsResponse>(`${API_BASE}/api/stats/n`, {
          params: {
            telegramUserId: telegramUserId.toString(),
            days: rangeDays,
          },
        });

        setStats(res.data);
        setLoading(false);
      } catch (err: any) {
        console.error("Failed to load stats", err);
        setError(
          err?.response?.data?.error ||
          "Failed to load stats. Please try again."
        );
        setLoading(false);
      }
    };

    fetchStats();
  }, [rangeDays]);


  const dailyTotals = useDailyTotals(stats);

  const avgKcalPerDay =
    dailyTotals.length > 0
      ? Math.round(
        dailyTotals.reduce((sum, d) => sum + d.totalKcal, 0) /
        dailyTotals.length
      )
      : 0;

  const avgMealsPerDay =
    dailyTotals.length > 0
      ? (
        dailyTotals.reduce((sum, d) => sum + d.meals, 0) / dailyTotals.length
      ).toFixed(1)
      : "0.0";

  // ---------- RENDER STATES ----------

  if (loading) {
    return (
      <>
        <div className="app-header">
          <div>
            <div className="app-title">Nutrition overview</div>
            <div className="app-subtitle">
              Loading your recent meals and calories…
            </div>
          </div>
        </div>

        <div className="card">
          <h2>📊 Nutrition stats</h2>
          <p>Loading…</p>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <div className="app-header">
          <div>
            <div className="app-title">🍽 Nutrition overview</div>
            <div className="app-subtitle">Something went wrong</div>
          </div>
        </div>

        <div className="card">
          <h2>📊 Nutrition stats</h2>
          <p style={{ color: "#f97373" }}>{error}</p>
        </div>
      </>
    );
  }

  if (!stats) {
    return (
      <>
        <div className="app-header">
          <div>
            <div className="app-title">🍽 Nutrition overview</div>
            <div className="app-subtitle">No stats yet</div>
          </div>
        </div>

        <div className="card">
          <h2>📊 Nutrition stats</h2>
          <p>No data available yet. Log a few meals first.</p>
        </div>
      </>
    );
  }

  // ---------- MAIN DASHBOARD ----------

  return (
    <>
      <div className="app-header">
        <div>
          <div className="app-title">Nutrition overview</div>
          <div className="app-subtitle">
            Last {rangeDays || 7} days, based on AI-estimated calories.
          </div>
        </div>
        <div
          style={{
            display: "inline-flex",
            padding: 4,
            borderRadius: 999,
            background: "#020617",
            border: "1px solid #1f2937",
            gap: 4,
          }}
        >
          {rangeOptions.map((days) => {
            const active = rangeDays === days;
            return (
              <button
                key={days}
                type="button"
                onClick={() => setRangeDays(days)}
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "4px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                  background: active ? "#4f46e5" : "transparent",
                  color: active ? "#e5e7eb" : "#9ca3af",
                }}
              >
                {days}d
              </button>
            );
          })}
        </div>

      </div>

      {/* Summary cards */}
      <div className="card card-grid">
        <div className="card-sm">
          <div className="card-title">Meals logged</div>
          <div className="card-value">{stats.totalMeals}</div>
          <div className="small">Total entries with photos</div>
        </div>
        <div className="card-sm">
          <div className="card-title">Total kcal</div>
          <div className="card-value">{stats.totalKcal}</div>
          <div className="small">Sum of estimated calories</div>
        </div>
        <div className="card-sm">
          <div className="card-title">Per day</div>
          <div className="card-value">{avgKcalPerDay} kcal</div>
          <div className="small">{avgMealsPerDay} meals / day</div>
        </div>
      </div>

      {/* Daily calories chart */}
      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <div>
            <div className="card-title">Daily calories</div>
            <div className="small">
              Bar height = total kcal per day, tap to inspect.
            </div>
          </div>
        </div>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyTotals}>

              <defs>
                <linearGradient id="kcalGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#312e81" stopOpacity={0.7} />
                </linearGradient>

                <linearGradient id="kcalHighlight" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity={1} />
                  <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.9} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => d.slice(5)}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: "#020617",
                  borderRadius: 8,
                  border: "1px solid #374151",
                  fontSize: 12,
                }}
                labelFormatter={(d) => `Date: ${d}`}
                formatter={(value: any) => [`${value} kcal`, "Total"]}
              />

              <Bar
                dataKey="totalKcal"
                radius={[6, 6, 0, 0]}
                fill="url(#kcalGradient)"
                activeBar={{ fill: "url(#kcalHighlight)" }}
              />
            </BarChart>
          </ResponsiveContainer>

        </div>
      </div>

      {/* Meals list */}
      {/* Recent meals */}
      <div className="card">
        <div className="recent-header">
          <div>
            <div className="card-title">Recent meals</div>
            <div className="small">
              Grouped by day. Tap a card to quickly review what you ate.
            </div>
          </div>
        </div>

        {groupedMeals.length === 0 && (
          <div className="small" style={{ marginTop: 8 }}>
            No meals logged yet. Send a meal photo to your bot to get started.
          </div>
        )}

        <div className="recent-days">
          {groupedMeals.map((day) => {
            const label = friendlyDayLabel(day.date);
            return (
              <div key={day.date} className="recent-day">
                <div className="recent-day-header">
                  <div className="recent-day-title">{label}</div>
                  <div className="recent-day-kcal">
                    {day.totalKcal ? `${day.totalKcal} kcal` : "—"}
                  </div>
                </div>

                <div className="recent-day-meals">
                  {day.entries.map((entry) => {
                    const ts = new Date(entry.timestamp);
                    const json: ParsedJson = entry.aiParsedJson || {};
                    const items = json.items || [];
                    const totalKcal = json.total_estimated_kcal;

                    const mainLabel =
                      json.meal_type?.[0]?.toUpperCase() || "" +
                      json.meal_type?.slice(1) || "Meal";

                    // simple macro sums
                    const totals = items.reduce(
                      (acc, i) => {
                        acc.protein += i.protein_g || 0;
                        acc.carbs += i.carbs_g || 0;
                        acc.fat += i.fat_g || 0;
                        return acc;
                      },
                      { protein: 0, carbs: 0, fat: 0 }
                    );

                    return (
                      <button
                        key={entry.id}
                        className="meal-row"
                        type="button"
                      // future: onClick → open details
                      >
                        <div className="meal-row-main">
                          <div className="meal-row-left">
                            <div className="meal-row-time">
                              {ts.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                            <div className="meal-row-text">
                              <div className="meal-row-title">
                                {mainLabel}
                                {entry.captionText
                                  ? ` · ${entry.captionText}`
                                  : ""}
                              </div>
                              {items.length > 0 && (
                                <div className="meal-row-items small">
                                  {items
                                    .map(
                                      (i) =>
                                        `${i.name} (${i.portion_grams}g)`
                                    )
                                    .join(" • ")}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="meal-row-right">
                            {typeof totalKcal === "number" && (
                              <div className="meal-row-kcal">
                                {totalKcal} kcal
                              </div>
                            )}
                            <div className="macro-badges">
                              <span className="macro-pill">
                                P {Math.round(totals.protein)}g
                              </span>
                              <span className="macro-pill">
                                C {Math.round(totals.carbs)}g
                              </span>
                              <span className="macro-pill">
                                F {Math.round(totals.fat)}g
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default App;
