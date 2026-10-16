import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CTestPoint, KomaUnits } from "../api";
import { SHEET_COLORS, SUBJECTS, individualTotal, toInt } from "../proposal";

/** 裏面（提案コマ数・詳細／オープン模試 成績推移）の確認・編集。印刷と同じ内容を画面に出す。 */
export default function ProposalBack({ komaUnits, setKomaUnits, komaInd, komaGrp, komaOther, ctest }: {
  komaUnits: KomaUnits;
  setKomaUnits: (u: KomaUnits) => void;
  komaInd: Record<string, string>;
  komaGrp: Record<string, string>;
  komaOther: string;
  ctest: CTestPoint[];
}) {
  const doc = { komaUnits, komaInd };
  const indTotal = SUBJECTS.reduce((a, s) => a + individualTotal(doc, s), 0);
  const grpTotal = SUBJECTS.reduce((a, s) => a + toInt(komaGrp[s]), 0);

  function update(s: string, i: number, patch: Partial<{ unit: string; koma: number }>) {
    const list = [...(komaUnits[s] ?? [])];
    list[i] = { ...list[i], ...patch };
    setKomaUnits({ ...komaUnits, [s]: list });
  }
  function add(s: string) {
    setKomaUnits({ ...komaUnits, [s]: [...(komaUnits[s] ?? []), { unit: "", koma: 1 }] });
  }
  function remove(s: string, i: number) {
    setKomaUnits({ ...komaUnits, [s]: (komaUnits[s] ?? []).filter((_, j) => j !== i) });
  }

  return (
    <div className="card card-pad">
      <div className="card-head">
        <div className="card-title"><span className="dot" />裏面：提案コマ数・詳細 — 編集可能</div>
        <div className="card-note">個別 合計 {indTotal}コマ ／ 集団・その他 合計 {grpTotal}コマ</div>
      </div>

      <div className="koma-subhead"><b>【個別】</b><span>単元はAIが未定着・一部定着の単元から配分した案です</span></div>
      <div className="koma-grid">
        {SUBJECTS.map((s) => {
          const units = komaUnits[s] ?? [];
          const entered = toInt(komaInd[s]);
          const total = individualTotal(doc, s);
          return (
            <div key={s} className="koma-col">
              <div className="koma-col-head">{s}</div>
              {units.map((u, i) => (
                <div key={i} className="koma-row">
                  <input className="input koma-unit" value={u.unit} onChange={(e) => update(s, i, { unit: e.target.value })} />
                  <input className="input koma-num" type="number" min={0} value={u.koma}
                    onChange={(e) => update(s, i, { koma: toInt(e.target.value) })} />
                  <button className="koma-del" title="削除" onClick={() => remove(s, i)}>×</button>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm koma-add" onClick={() => add(s)}>＋ 単元</button>
              <div className="koma-total">{total > 0 ? total : "―"}</div>
              {units.length > 0 && entered > 0 && total !== entered && (
                <span className="badge badge-amber">入力した{entered}コマと違います</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="koma-subhead"><b>【集団・その他】</b><span>生成条件の入力値（変更は上の「提案コマ数」で）</span></div>
      <table className="koma-table">
        <thead><tr>{SUBJECTS.map((s) => <th key={s}>{s}</th>)}</tr></thead>
        <tbody>
          <tr>{SUBJECTS.map((s) => <td key={s}>{toInt(komaGrp[s]) > 0 ? toInt(komaGrp[s]) : "―"}</td>)}</tr>
          <tr><th>5教科以外の提案内容</th><td colSpan={4} style={{ textAlign: "left" }}>{komaOther || "―"}</td></tr>
        </tbody>
      </table>

      <div className="koma-subhead" style={{ marginTop: 22 }}><b>📊 オープン模試 成績推移</b></div>
      {ctest.length === 0 ? (
        <div className="empty" style={{ padding: 16 }}>オープン模試のデータがありません。</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={ctest} margin={{ top: 8, right: 16, left: -8, bottom: 4 }}>
              <CartesianGrid stroke="#eef0f4" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {SUBJECTS.map((s) => (
                <Line key={s} type="linear" dataKey={s} stroke={SHEET_COLORS[s]} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <table className="koma-table ct">
            <thead><tr><th></th>{ctest.map((p) => <th key={p.label + p.year}>{p.label}</th>)}</tr></thead>
            <tbody>
              {SUBJECTS.map((s) => (
                <tr key={s}><th>{s}</th>{ctest.map((p, i) => <td key={i}>{(p[s as keyof CTestPoint] as number | null) ?? "―"}</td>)}</tr>
              ))}
              <tr><th>5科合計</th>{ctest.map((p, i) => <td key={i}>{p.合計 ?? "―"}</td>)}</tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
