import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { api, DashboardResp, SUBJECT_COLORS } from "../api";

const MASTERY_COLOR: Record<string, string> = {
  定着: "#10b981",
  一部定着: "#f59e0b",
  未定着: "#ef4444",
};

function KpiCard({ icon, label, value, unit, color, foot }: {
  icon: string; label: string; value: string | number; unit?: string; color: string; foot: string;
}) {
  return (
    <div className="kpi" style={{ ["--accent-c" as string]: color }}>
      <div className="kpi-label"><span className="kpi-icon">{icon}</span>{label}</div>
      <div className="kpi-value" style={{ color }}>
        {value}{unit && <span className="kpi-unit">{unit}</span>}
      </div>
      <div className="kpi-foot">{foot}</div>
    </div>
  );
}

export default function Dashboard({ classroom, student, mode, onCreateMendan }: {
  classroom: string; student: string; mode: string; onCreateMendan?: () => void;
}) {
  const [data, setData] = useState<DashboardResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("すべて");

  useEffect(() => {
    if (!classroom || !student) return;
    setLoading(true);
    setErr("");
    setData(null);
    setSubjectFilter("すべて");
    api.dashboard(classroom, student, mode)
      .then(setData)
      .catch((e) => setErr(String(e.message || e)))
      .finally(() => setLoading(false));
  }, [classroom, student, mode]);

  const subjects = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.pcs_units.map((u) => u.教科)));
  }, [data]);

  const filteredUnits = useMemo(() => {
    if (!data) return [];
    return subjectFilter === "すべて"
      ? data.pcs_units
      : data.pcs_units.filter((u) => u.教科 === subjectFilter);
  }, [data, subjectFilter]);

  if (!classroom || !student)
    return <div className="info-box"><div className="big">👈</div>サイドバーから教室と生徒を選択してください。</div>;

  if (loading)
    return (
      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 96 }} />)}
      </div>
    );

  if (err) return <div className="error-box"><div className="big">⚠️</div>データ取得エラー: {err}</div>;
  if (!data) return null;

  const { counts, ctest_series, deviation_latest, pcs_summary } = data;
  const hasC = counts.ctest > 0;
  const hasP = counts.pcs > 0;
  const unitCount = pcs_summary.定着 + pcs_summary.一部定着 + pcs_summary.未定着;

  const masterySegments = (u: typeof filteredUnits[number]) => {
    const t = u.問題数 || 1;
    return { c: (u.正解 / t) * 100, p: (u.部分正解 / t) * 100, i: (u.不正解 / t) * 100 };
  };

  // 面談準備サマリー（気づき）
  const last = ctest_series[ctest_series.length - 1];
  const subjVals = last
    ? (["英語", "数学", "国語", "理科", "社会"] as const)
        .map((s) => ({ s, v: last[s] }))
        .filter((x) => x.v != null)
    : [];
  const best = subjVals.length ? subjVals.reduce((a, b) => (b.v! > a.v! ? b : a)) : null;
  const worst = subjVals.length ? subjVals.reduce((a, b) => (b.v! < a.v! ? b : a)) : null;
  const masteryPct = unitCount ? Math.round((pcs_summary.定着 / unitCount) * 100) : 0;

  return (
    <div className="grid" style={{ gap: 20 }}>
      {/* 面談準備 callout */}
      <div className="prep-callout">
        <div className="prep-main">
          <div className="prep-title">📌 面談準備サマリー</div>
          <div className="prep-text">
            {best && worst ? (
              <>直近模試は <b>{best.s} {best.v}点</b> が強み、<b>{worst.s} {worst.v}点</b> が課題。
              最新5科偏差値 <b>{deviation_latest.偏差値 ?? "—"}</b>、PCS定着率 <b>{masteryPct}%</b>（{hasP ? `${unitCount}単元中${pcs_summary.定着}定着` : "データなし"}）。</>
            ) : (
              <>この生徒の模試データは限定的です。保有データを確認のうえ面談資料を作成してください。</>
            )}
          </div>
        </div>
        {onCreateMendan && (
          <button className="btn btn-primary" onClick={onCreateMendan}>📋 この生徒の面談資料を作成 →</button>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-4">
        <KpiCard icon="📝" label="オープン模試" value={counts.ctest} unit="回" color="#4f46e5"
          foot={deviation_latest.label ? `最新 ${deviation_latest.label}` : "記録なし"} />
        <KpiCard icon="📈" label="最新 5科偏差値" value={deviation_latest.偏差値 ?? "—"} color="#0ea5e9"
          foot={deviation_latest.合計 != null ? `5科合計 ${deviation_latest.合計} 点` : "データなし"} />
        <KpiCard icon="📚" label="PCS 単元数" value={unitCount} unit="単元" color="#16a34a"
          foot={`定着 ${pcs_summary.定着}／一部 ${pcs_summary.一部定着}／未 ${pcs_summary.未定着}`} />
        <KpiCard icon="📄" label="診断資料" value={counts.ets + counts.sss} unit="件" color="#9333ea"
          foot={`ETS ${counts.ets}／SSS ${counts.sss}`} />
      </div>

      {/* Score trend */}
      <div className="card card-pad">
        <div className="card-head">
          <div className="card-title"><span className="dot" />オープン模試 教科別得点推移</div>
          <div className="card-note">出典: c_test_results ／ 単位: 点（0–100）</div>
        </div>
        {hasC ? (
          <>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={ctest_series} margin={{ top: 8, right: 16, left: -8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#e5e8f0" }} />
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={38} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e8f0", fontSize: 13 }} />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
                {(["英語", "数学", "国語", "理科", "社会"] as const).map((s) => (
                  <Line key={s} type="monotone" dataKey={s} stroke={SUBJECT_COLORS[s]}
                    strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </>
        ) : (
          <div className="empty"><div className="big">📭</div>この生徒のオープン模試データはありません。</div>
        )}
      </div>

      {/* Total + mastery distribution */}
      <div className="grid grid-2">
        <div className="card card-pad">
          <div className="card-head">
            <div className="card-title"><span className="dot" />5科合計 推移</div>
            <div className="card-note">単位: 点（0–500）</div>
          </div>
          {hasC ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={ctest_series} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#e5e8f0" }} />
                <YAxis domain={[0, 500]} tickLine={false} axisLine={false} width={38} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e8f0", fontSize: 13 }} cursor={{ fill: "#f3f4fb" }} />
                <Bar dataKey="合計" fill="#4f46e5" radius={[6, 6, 0, 0]} maxBarSize={46} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty"><div className="big">📭</div>データなし</div>
          )}
        </div>

        <div className="card card-pad">
          <div className="card-head">
            <div className="card-title"><span className="dot" />5科偏差値 推移</div>
            <div className="card-note">基準線: 偏差値 50</div>
          </div>
          {hasC ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={ctest_series} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#e5e8f0" }} />
                <YAxis domain={[25, 75]} tickLine={false} axisLine={false} width={38} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e8f0", fontSize: 13 }} />
                <ReferenceLine y={50} stroke="#9aa1b4" strokeDasharray="4 4" label={{ value: "50", fontSize: 11, fill: "#9aa1b4" }} />
                <Line type="monotone" dataKey="偏差値" stroke="#0ea5e9" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty"><div className="big">📭</div>データなし</div>
          )}
        </div>
      </div>

      {/* PCS mastery */}
      <div className="card card-pad">
        <div className="card-head">
          <div className="card-title"><span className="dot" />PCS 単元別定着度</div>
          <div className="legend">
            <span className="legend-item"><span className="legend-swatch" style={{ background: MASTERY_COLOR.定着 }} />定着</span>
            <span className="legend-item"><span className="legend-swatch" style={{ background: MASTERY_COLOR.一部定着 }} />一部定着</span>
            <span className="legend-item"><span className="legend-swatch" style={{ background: "#e5e8f0" }} />未定着</span>
          </div>
        </div>
        {hasP ? (
          <>
            <div className="filter-pills" style={{ marginBottom: 14 }}>
              {["すべて", ...subjects].map((s) => (
                <button key={s} className={`pill ${subjectFilter === s ? "active" : ""}`}
                  onClick={() => setSubjectFilter(s)}>{s}</button>
              ))}
            </div>
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              {filteredUnits.map((u, idx) => {
                const seg = masterySegments(u);
                const color = MASTERY_COLOR[u.定着度];
                return (
                  <div className="mastery-row" key={idx}>
                    <div className="mastery-label">
                      <div className="mastery-unit">{u.単元名}</div>
                      <div className="mastery-sub">{u.教科}・{u.大単元名}</div>
                    </div>
                    <div className="mastery-bar">
                      <span className="seg-c" style={{ width: `${seg.c}%` }} />
                      <span className="seg-p" style={{ width: `${seg.p}%` }} />
                      <span className="seg-i" style={{ width: `${seg.i}%` }} />
                    </div>
                    <span className="badge" style={{ background: `${color}1a`, color, minWidth: 72, justifyContent: "center" }}>
                      {u.定着度}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="empty"><div className="big">📭</div>この生徒のPCSデータはありません。</div>
        )}
      </div>

      {/* Classroom overview (admin only) */}
      {mode === "管理者" && data.overview.length > 0 && (
        <div className="card card-pad">
          <div className="card-head">
            <div className="card-title"><span className="dot" />🏫 教室全体の概要（最高点）</div>
            <div className="card-note">選択中の生徒をハイライト ／ 5科合計 降順</div>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>生徒コード</th>
                  {(["英語", "数学", "国語", "理科", "社会"] as const).map((s) => <th key={s} className="num">{s}</th>)}
                  <th className="num">5科合計</th>
                </tr>
              </thead>
              <tbody>
                {data.overview.map((r) => (
                  <tr key={r.生徒コード} className={r.is_current ? "highlight" : ""}>
                    <td style={{ fontWeight: r.is_current ? 700 : 400 }}>
                      {r.生徒コード}{r.is_current && " ●"}
                    </td>
                    {(["英語", "数学", "国語", "理科", "社会"] as const).map((s) => (
                      <td key={s} className="num">{r[s] ?? "—"}</td>
                    ))}
                    <td className="num" style={{ fontWeight: 700 }}>{r["5科合計"] ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
