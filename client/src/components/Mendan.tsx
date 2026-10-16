import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  api, CTestPoint, KomaUnits, MendanBody, MendanFields, MendanResult, Prefill, Revision, SssItem,
  mendanGenerateWS, reviseWithGenie,
} from "../api";
import GenieChat, { GenieMsg, genieKey } from "./GenieChat";
import ProposalBack from "./ProposalBack";
import { loadState, saveState } from "../persist";
import { renderMarkdown } from "../md";
import { Paper, ProposalDoc, SUBJECTS, SectionDef, buildProposalHtml, proposalText, subtitle, title, toInt } from "../proposal";

// 見出しと注記は提案資料アウトプット【例】と同じ。note "ets" は診断の実施時期で置き換える
const FIELD_LABELS: { key: keyof MendanFields; label: string; note?: string; admin?: boolean }[] = [
  { key: "student_goal_text", label: "目標" },
  { key: "ctest_summary", label: "1. 全体成績推移 (オープン模試分析)" },
  { key: "target_gap", label: "2. 志望校ギャップ・課題" },
  { key: "ets_eval", label: "3. 学習特性・行動評価 (ETS)", note: "ets" },
  { key: "english_analysis", label: "4. 英語：現状分析", note: "※PCS・オープン模試の結果より分析" },
  { key: "math_analysis", label: "5. 数学：現状分析", note: "※PCS・オープン模試の結果より分析" },
  { key: "other_subjects", label: "6. 他教科の所見" },
  { key: "remarks", label: "備考" },
  { key: "data_notes", label: "📝 担当者用メモ（非印刷）", admin: true },
];

const TONES = ["① 励まし重視", "② 標準", "③ 率直に伝える"];

type SchoolTests = Record<string, { score: string; target: string }>;
const MAX_REF = 3;

const DATASOURCES = [
  { t: "c_test_results", d: "オープン模試（Cテスト）得点・偏差値", k: "table" },
  { t: "pcs_results", d: "単元別 正答率（PCS）", k: "table" },
  { t: "ets_metadata ＋ Volume /ets", d: "ETS やる気度診断テスト（PDF）", k: "volume" },
  { t: "sss_metadata ＋ Volume /sss", d: "講習SSS（室長作成の面談シート xlsx）", k: "volume" },
];

type Mode = "structured" | "free";

type Decision = "pending" | "approved" | "rejected";

interface ProposalItem extends Revision {
  decision: Decision;
}

/** One Genie answer → proposed edits to existing sections, reviewed per section. */
interface Proposal {
  id: string;          // genieKey of the answer
  question: string;
  status: "loading" | "ready" | "error";
  error?: string;
  items: ProposalItem[];
}

interface Section { key: string; label: string; text: string }

/** What we keep per student across reloads. */
interface MendanSaved {
  fields: MendanFields | null;
  freeText: string | null;
  sources: Record<string, string[]>;
  usedSources: string[];
  etsParsed: boolean;
  sssParsed: boolean;
  refUsed: string[];
  proposals: Proposal[];
  refSss: string[];
  genMode: Mode;
  tone: string;
  targetSchool: string;
  currentDev: string;
  targetDev: string;
  studentName: string;
  course: string;
  judgement: string;
  schoolTests: SchoolTests;
  komaInd: Record<string, string>;
  komaGrp: Record<string, string>;
  komaOther: string;
  komaUnits: KomaUnits;
  etsDate: string;
  ctestTable: CTestPoint[];
}

/** Split free-form Markdown into sections at `## ` headings. */
function splitMd(md: string): Section[] {
  const lines = md.split("\n");
  const out: Section[] = [];
  let cur: { label: string; head: string | null; body: string[] } = { label: "冒頭", head: null, body: [] };
  const push = () => {
    if (cur.head !== null || cur.body.join("").trim()) {
      out.push({ key: `md_${out.length}`, label: cur.label, text: cur.body.join("\n").trim() });
    }
  };
  for (const ln of lines) {
    const m = /^##\s+(.*)$/.exec(ln.trim());
    if (m) { push(); cur = { label: m[1].trim(), head: ln, body: [] }; } else cur.body.push(ln);
  }
  push();
  return out;
}

function joinMd(sections: Section[]): string {
  return sections.map((s) => (s.label === "冒頭" && s.key === "md_0" ? s.text : `## ${s.label}\n${s.text}`)).join("\n\n");
}

/** Character-level diff (LCS). Returns null when texts are too long to diff. */
function diffChars(a: string, b: string): { t: "eq" | "del" | "ins"; s: string }[] | null {
  const n = a.length, m = b.length;
  if (n * m > 4_000_000) return null;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { t: "eq" | "del" | "ins"; s: string }[] = [];
  const add = (t: "eq" | "del" | "ins", c: string) => {
    const last = out[out.length - 1];
    if (last && last.t === t) last.s += c; else out.push({ t, s: c });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { add("eq", a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { add("del", a[i]); i++; }
    else { add("ins", b[j]); j++; }
  }
  while (i < n) add("del", a[i++]);
  while (j < m) add("ins", b[j++]);
  return out;
}

function DiffView({ before, after }: { before: string; after: string }) {
  const d = useMemo(() => diffChars(before, after), [before, after]);
  return (
    <div className="diff-grid">
      <div className="diff-col">
        <div className="diff-head before">変更前</div>
        <div className="diff-body">
          {d ? d.filter((x) => x.t !== "ins").map((x, i) =>
            <span key={i} className={x.t === "del" ? "d-del" : undefined}>{x.s}</span>) : before}
        </div>
      </div>
      <div className="diff-col">
        <div className="diff-head after">変更後</div>
        <div className="diff-body">
          {d ? d.filter((x) => x.t !== "del").map((x, i) =>
            <span key={i} className={x.t === "ins" ? "d-ins" : undefined}>{x.s}</span>) : after}
        </div>
      </div>
    </div>
  );
}

export default function Mendan({ classroom, student, mode: viewMode }: {
  classroom: string; student: string; mode: string;
}) {
  const [status, setStatus] = useState<{ ctest: number; pcs: number; ets: number; sss: number } | null>(null);
  const [terms, setTerms] = useState<{ distinct_terms: number; variant_groups: number; examples: string[][] } | null>(null);
  const [sssItems, setSssItems] = useState<SssItem[] | null>(null);
  const [refSss, setRefSss] = useState<string[]>([]);
  const [genMode, setGenMode] = useState<Mode>("structured");
  const [tone, setTone] = useState(TONES[0]);
  const [targetSchool, setTargetSchool] = useState("");
  const [currentDev, setCurrentDev] = useState("");
  const [targetDev, setTargetDev] = useState("");
  // 提案書の見出し・裏面に載せる、データに無い情報（教室長が入力）
  const [studentName, setStudentName] = useState("");
  const [course, setCourse] = useState("");
  const [judgement, setJudgement] = useState("");
  const [schoolTests, setSchoolTests] = useState<SchoolTests>({});
  const [showTeiki, setShowTeiki] = useState(false);
  const [komaInd, setKomaInd] = useState<Record<string, string>>({});
  const [komaGrp, setKomaGrp] = useState<Record<string, string>>({});
  const [komaOther, setKomaOther] = useState("");
  const [komaUnits, setKomaUnits] = useState<KomaUnits>({});
  const [etsDate, setEtsDate] = useState("");
  const [ctestTable, setCtestTable] = useState<CTestPoint[]>([]);
  const [paper, setPaper] = useState<Paper>("A3");
  const [generating, setGenerating] = useState(false);
  const [fields, setFields] = useState<MendanFields | null>(null);
  const [freeText, setFreeText] = useState<string | null>(null);
  const [freeEditing, setFreeEditing] = useState(false);
  const [sources, setSources] = useState<Record<string, string[]>>({});
  const [usedSources, setUsedSources] = useState<string[]>([]);
  const [etsParsed, setEtsParsed] = useState(false);
  const [sssParsed, setSssParsed] = useState(false);
  const [refUsed, setRefUsed] = useState<string[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!generating) return;
    setElapsed(0);
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [generating]);

  useEffect(() => {
    api.sssList().then((r) => setSssItems(r.items)).catch(() => setSssItems([]));
  }, []);

  const storeKey = `mendan:${classroom}:${student}`;
  // Key whose saved state has been loaded into React state. Saving is only
  // allowed once it matches storeKey, so switching students never writes the
  // previous student's work under the new student's key.
  const [restoredKey, setRestoredKey] = useState("");

  useEffect(() => {
    if (!classroom || !student) return;
    setStatus(null); setErr(""); setPrefill(null);
    // Restore in-progress work for this student (survives a reload after session expiry)
    const s = loadState<MendanSaved>(storeKey);
    setFields(s?.fields ?? null);
    setFreeText(s?.freeText ?? null);
    setRaw(null);
    setSources(s?.sources ?? {});
    setUsedSources(s?.usedSources ?? []);
    setEtsParsed(!!s?.etsParsed); setSssParsed(!!s?.sssParsed); setRefUsed(s?.refUsed ?? []);
    setProposals((s?.proposals ?? []).filter((p) => p.status === "ready"));
    setRefSss(s?.refSss ?? []);
    setGenMode(s?.genMode ?? "structured");
    setTone(s?.tone ?? TONES[0]);
    setTargetSchool(s?.targetSchool ?? ""); setCurrentDev(s?.currentDev ?? ""); setTargetDev(s?.targetDev ?? "");
    setStudentName(s?.studentName ?? ""); setCourse(s?.course ?? ""); setJudgement(s?.judgement ?? "");
    setSchoolTests(s?.schoolTests ?? {});
    setKomaInd(s?.komaInd ?? {}); setKomaGrp(s?.komaGrp ?? {}); setKomaOther(s?.komaOther ?? "");
    setKomaUnits(s?.komaUnits ?? {}); setEtsDate(s?.etsDate ?? ""); setCtestTable(s?.ctestTable ?? []);
    setRestoredKey(storeKey);
    api.mendanData(classroom, student).then(setStatus).catch(() => {});
    api.terms(classroom).then(setTerms).catch(() => {});
    // 志望校・偏差値: 資料（講習SSS・模試）にあれば自動入力、なければ手入力
    api.prefill(classroom, student).then((p) => {
      setPrefill(p);
      if (!s) { // don't overwrite values the user already had
        setTargetSchool(p.target_school);
        setCurrentDev(p.current_dev);
        setTargetDev(p.target_dev);
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroom, student]);

  useEffect(() => {
    if (restoredKey !== storeKey || !classroom || !student) return;
    saveState<MendanSaved>(storeKey, {
      fields, freeText, sources, usedSources, etsParsed, sssParsed, refUsed,
      proposals: proposals.filter((p) => p.status === "ready"),
      refSss, genMode, tone, targetSchool, currentDev, targetDev,
      studentName, course, judgement, schoolTests, komaInd, komaGrp, komaOther, komaUnits, etsDate, ctestTable,
    });
  }, [restoredKey, storeKey, classroom, student, fields, freeText, sources, usedSources, etsParsed, sssParsed,
      refUsed, proposals, refSss, genMode, tone, targetSchool, currentDev, targetDev,
      studentName, course, judgement, schoolTests, komaInd, komaGrp, komaOther, komaUnits, etsDate, ctestTable]);

  const ownSss = useMemo(
    () => (sssItems ?? []).find((s) => s.classroom === classroom && s.student === student) ?? null,
    [sssItems, classroom, student]
  );
  const otherSss = useMemo(
    () => (sssItems ?? []).filter((s) => !(s.classroom === classroom && s.student === student)),
    [sssItems, classroom, student]
  );
  const proposedKeys = useMemo(() => new Set(proposals.map((p) => p.id)), [proposals]);
  const pendingKeys = useMemo(
    () => new Set(proposals.flatMap((p) => p.items.filter((it) => it.decision === "pending").map((it) => it.key))),
    [proposals]
  );

  function toggleRef(path: string) {
    setRefSss((cur) => cur.includes(path) ? cur.filter((p) => p !== path) : cur.length >= MAX_REF ? cur : [...cur, path]);
  }

  // Sections of the current document (structured fields, or ## sections of free text)
  function currentSections(): Section[] {
    if (fields) {
      return FIELD_LABELS.filter((f) => !f.admin).map((f) => ({ key: f.key, label: f.label, text: fields[f.key] ?? "" }));
    }
    if (freeText != null) return splitMd(freeText);
    return [];
  }

  async function reviseFromGenie(m: GenieMsg) {
    const id = genieKey(m);
    if (proposedKeys.has(id)) return;
    const sections = currentSections();
    if (!sections.length) return;
    const question = m.question ?? "";
    setProposals((ps) => [{ id, question, status: "loading", items: [] }, ...ps]);
    try {
      const r = await reviseWithGenie({
        classroom, student, question, answer: m.content, sql: m.sql,
        columns: m.columns, rows: m.rows, sections,
      });
      setProposals((ps) => ps.map((p) => p.id === id
        ? { ...p, status: "ready", items: r.revisions.map((rv) => ({ ...rv, decision: "pending" as Decision })) }
        : p));
    } catch (e: any) {
      setProposals((ps) => ps.map((p) => p.id === id ? { ...p, status: "error", error: String(e.message || e) } : p));
    }
  }

  function decide(pid: string, key: string, decision: Decision) {
    const prop = proposals.find((p) => p.id === pid);
    const item = prop?.items.find((it) => it.key === key);
    if (!prop || !item || item.decision !== "pending") return;
    if (decision === "approved") {
      const genieSrc = `Genie → ${prop.question}`;
      if (fields) {
        setFields((f) => (f ? { ...f, [key]: item.after } : f));
        setSources((s) => ({ ...s, [key]: [...(s[key] ?? []).filter((x) => x !== genieSrc), genieSrc] }));
      } else if (freeText != null) {
        setFreeText((ft) => (ft == null ? ft : joinMd(splitMd(ft).map((s) => (s.key === key ? { ...s, text: item.after } : s)))));
        setUsedSources((u) => (u.includes(genieSrc) ? u : [...u, genieSrc]));
      }
      setSaved(false);
    }
    setProposals((ps) => ps.map((p) => p.id === pid
      ? { ...p, items: p.items.map((it) => (it.key === key ? { ...it, decision } : it)) }
      : p));
  }

  function decideAll(pid: string, decision: Decision) {
    const prop = proposals.find((p) => p.id === pid);
    prop?.items.filter((it) => it.decision === "pending").forEach((it) => decide(pid, it.key, decision));
  }

  async function generate() {
    // Keep the current document until the new one arrives, so a failed request
    // (or a reload mid-generation) never loses work.
    setGenerating(true); setErr(""); setFreeEditing(false);
    const body: MendanBody = {
      classroom, student, tone, target_school: targetSchool,
      current_dev: currentDev, target_dev: targetDev, mode: genMode, ref_sss: refSss,
      student_name: studentName, course, judgement, school_tests: schoolTests,
      koma_individual: komaInd, koma_group: komaGrp, koma_other: komaOther,
    };
    try {
      let r: MendanResult;
      try {
        r = await mendanGenerateWS(body); // bypasses 120s proxy limit
      } catch (e: any) {
        if (e?.message !== "ws-unavailable") throw e;
        r = await api.mendanGenerate(body); // fallback only when WS can't open
      }
      setSources(r.sources ?? {});
      setUsedSources(r.used_sources ?? []);
      setEtsParsed(!!r.ets_parsed);
      setSssParsed(!!r.sss_parsed);
      setRefUsed(r.ref_used ?? []);
      setKomaUnits(r.koma_units ?? {});
      setEtsDate(r.ets_date ?? "");
      setCtestTable(r.ctest_table ?? []);
      setFields(r.fields ?? null);
      setFreeText(!r.fields && typeof r.free_text === "string" ? r.free_text : null);
      setRaw(!r.fields && typeof r.free_text !== "string" ? r.raw_response ?? "" : null);
      setProposals([]); // proposals referred to the previous text
      setSaved(false);
    } catch (e: any) {
      setErr(String(e.message || e));
    } finally {
      setGenerating(false);
    }
  }

  function noteFor(note?: string): string | undefined {
    if (note !== "ets") return note;
    return etsDate ? `※最新のETSは${etsDate}時点のデータです。` : undefined;
  }

  // Printed sections carry parent-friendly notes, not table names (the screen keeps the source chips).
  const printSections: SectionDef[] = FIELD_LABELS.filter((f) => !f.admin)
    .map((f) => ({ key: f.key, label: f.label, note: noteFor(f.note) }));

  function proposalDoc(): ProposalDoc | null {
    if (!fields) return null;
    return {
      classroom, student, studentName, targetSchool, course, judgement,
      sections: printSections, fields, komaUnits, komaInd, komaGrp, komaOther, ctest: ctestTable,
    };
  }

  function downloadStructured() {
    const doc = proposalDoc();
    if (!doc) return;
    download(proposalText(doc), `講習提案書_${classroom}_${student}.txt`, "text/plain");
  }

  function downloadFree() {
    if (freeText == null) return;
    const src = usedSources.length ? `\n\n---\n参照データ: ${usedSources.join(" / ")}` : "";
    download(freeText + src, `面談資料_${classroom}_${student}.md`, "text/markdown");
  }

  function download(text: string, name: string, mime: string) {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  }

  function printProposal() {
    const doc = proposalDoc();
    if (!doc) return;
    const w = window.open("", "_blank");
    if (w) { w.document.write(buildProposalHtml(doc, paper)); w.document.close(); }
  }

  if (!classroom || !student)
    return <div className="info-box"><div className="big">👈</div>サイドバーから教室と生徒を選択してください。</div>;

  const visibleFields = FIELD_LABELS.filter((f) => !f.admin || viewMode === "管理者");
  const hasResult = !!fields || freeText != null || !!raw;
  const genieSuggestions = [
    `生徒${student}の英語と数学の得点推移は？`,
    `教室${classroom}の平均と比べて生徒${student}の5科合計はどう？`,
    `生徒${student}の未定着単元が多い大単元トップ5は？`,
  ];
  const profile = [
    status && currentDev ? `5科偏差値${currentDev}` : "",
    targetSchool ? `志望校は${targetSchool}` : "",
  ].filter(Boolean).join("、");
  const who = `生徒${student}（教室${classroom}${profile ? "、" + profile : ""}）`;
  const agentSuggestions = [
    `${who}と同じような成績の他の生徒が、志望校に向けて行って効果的だったことは何？`,
    `${who}のETS診断の結果から、面談で伝えるべき強みと声かけのポイントは？`,
    `${who}と似た弱点を持つ生徒のETS診断に共通する特徴は？`,
  ];

  return (
    <div className="grid" style={{ gap: 20 }}>
      {/* data status + SSOT */}
      <div className="grid grid-2">
        <div className="card card-pad">
          <div className="card-head">
            <div className="card-title"><span className="dot" />保有データ</div>
            <div className="card-note">教室 {classroom} ／ 生徒 {student}</div>
          </div>
          {status ? (
            <div className="grid grid-4" style={{ gap: 12 }}>
              <DataStat icon="📝" label="Cテスト" value={status.ctest} unit="回" />
              <DataStat icon="📚" label="PCS" value={status.pcs} unit="単元" />
              <DataStat icon="📄" label="ETS" value={status.ets} unit="件" />
              <DataStat icon="📋" label="講習SSS" value={status.sss} unit="件" />
            </div>
          ) : (
            <div className="skeleton" style={{ height: 90 }} />
          )}
        </div>

        <div className="card card-pad">
          <div className="card-head">
            <div className="card-title"><span className="dot" />データソース（Unity Catalog = SSOT）</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {DATASOURCES.map((s) => (
              <div key={s.t} className="ds-row">
                <span className={`ds-badge ${s.k}`}>{s.k === "volume" ? "Volume" : "Table"}</span>
                <code className="ds-name">{s.t}</code>
                <span className="ds-desc">{s.d}</span>
              </div>
            ))}
            {terms && (
              <div className="term-note">
                🔤 用語マスター: 単元名 <b>{terms.distinct_terms}</b> 種 ／ 表記ゆれ <b>{terms.variant_groups}</b> 件検出
                {terms.examples.length > 0 && (
                  <span className="term-ex">例: {terms.examples.slice(0, 2).map((g) => g.join(" ≒ ")).join(" ， ")}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* reference SSS picker */}
      <div className="card card-pad">
        <div className="card-head">
          <div className="card-title"><span className="dot" />参考にする講習SSS（他の先生の面談シート）</div>
          <div className="card-note">最大 {MAX_REF} 件まで選択 ／ 選択中 {refSss.length} 件</div>
        </div>
        <div className="sss-lead">
          室長ごとに書き方が異なる講習SSSを、面談資料として作り直す手間を省きます。
          参考にしたい先生のシートを選ぶと、その<b>目標設定の立て方・提案（単元とコマ数）の組み立て・保護者への伝え方</b>をこの生徒の資料に適用します。
          参考シートの数値や志望校は転記しません。
        </div>
        {ownSss && (
          <div className="sss-own">
            <span className="badge badge-green">本人のSSS・自動で反映</span>
            <b>{ownSss.label}</b>
            <span className="sss-meta">志望: {ownSss.target || "—"}</span>
          </div>
        )}
        {sssItems == null ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : otherSss.length === 0 ? (
          <div className="empty" style={{ padding: 20 }}>参考にできる講習SSSがありません。</div>
        ) : (
          <div className="sss-grid">
            {otherSss.map((s) => {
              const on = refSss.includes(s.file_path);
              const disabled = !on && refSss.length >= MAX_REF;
              return (
                <button
                  key={s.file_path}
                  className={`sss-card ${on ? "on" : ""}`}
                  disabled={disabled}
                  onClick={() => toggleRef(s.file_path)}
                  title={s.proposal}
                >
                  <div className="sss-top">
                    <span className={`sss-check ${on ? "on" : ""}`}>{on ? "✓" : ""}</span>
                    <span className="sss-school">{s.school.split(/\s+/).pop()}</span>
                    <span className="badge badge-neutral">{s.term}</span>
                  </div>
                  <div className="sss-teacher">担当: {s.teachers || "—"}</div>
                  <div className="sss-meta">{s.grade} ／ 志望: {s.target || "—"}</div>
                  <div className="sss-prop">{s.proposal || "（室長提案の記載なし）"}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* generation conditions */}
      <div className="card card-pad">
        <div className="card-head">
          <div className="card-title"><span className="dot" />生成条件</div>
        </div>
        <div className="grid grid-2" style={{ gap: 16, alignItems: "end" }}>
          <div className="grid" style={{ gap: 12 }}>
            <div className="field">
              <label>出力モード</label>
              <div className="mode-toggle light">
                <button className={`mode-btn ${genMode === "structured" ? "active" : ""}`} onClick={() => setGenMode("structured")}>
                  📄 定型（講習 提案書）
                </button>
                <button className={`mode-btn ${genMode === "free" ? "active" : ""}`} onClick={() => setGenMode("free")}>
                  ✍️ 自由フォーマット
                </button>
              </div>
            </div>
            <div className="field">
              <label>文章トーン</label>
              <select className="input-select" value={tone} onChange={(e) => setTone(e.target.value)}>
                {TONES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid" style={{ gap: 12 }}>
            <div className="field">
              <label>志望校</label>
              <input className="input" value={targetSchool} onChange={(e) => setTargetSchool(e.target.value)} placeholder="例: ○○高校" />
              <PrefillHint p={prefill} k="target_school" value={targetSchool} />
            </div>
            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="field">
                <label>現状偏差値</label>
                <input className="input" value={currentDev} onChange={(e) => setCurrentDev(e.target.value)} placeholder="例: 45" />
                <PrefillHint p={prefill} k="current_dev" value={currentDev} />
              </div>
              <div className="field">
                <label>目標偏差値</label>
                <input className="input" value={targetDev} onChange={(e) => setTargetDev(e.target.value)} placeholder="例: 55" />
                <PrefillHint p={prefill} k="target_dev" value={targetDev} />
              </div>
            </div>
          </div>
        </div>

        {/* 提案書の見出し・裏面に載せる情報（データに無いので教室長が入力） */}
        <div className="cond-sub">
          <div className="cond-sub-title">提案書の見出し <span className="pf-hint">データに無い情報です。手入力してください</span></div>
          <div className="grid grid-3" style={{ gap: 12 }}>
            <div className="field">
              <label>生徒名（「○○ 様 講習 提案書」）</label>
              <input className="input" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder={`未入力なら「生徒${student}」`} />
            </div>
            <div className="field">
              <label>学科・コース</label>
              <input className="input" value={course} onChange={(e) => setCourse(e.target.value)} placeholder="例: 未来探究" />
            </div>
            <div className="field">
              <label>判定</label>
              <input className="input" value={judgement} onChange={(e) => setJudgement(e.target.value)} placeholder="例: B判定" />
            </div>
          </div>
        </div>

        <div className="cond-sub">
          <div className="cond-sub-title">
            提案コマ数（裏面） <span className="pf-hint">個別のコマ数を入れた教科は、AIが未定着・一部定着の単元に配分します</span>
          </div>
          <table className="koma-table input-table">
            <thead><tr><th></th>{SUBJECTS.map((s) => <th key={s}>{s}</th>)}<th>合計</th></tr></thead>
            <tbody>
              {([["個別", komaInd, setKomaInd], ["集団・その他", komaGrp, setKomaGrp]] as const).map(([lb, val, set]) => (
                <tr key={lb}>
                  <th>{lb}</th>
                  {SUBJECTS.map((s) => (
                    <td key={s}>
                      <input className="input koma-num" type="number" min={0} value={val[s] ?? ""} placeholder="―"
                        onChange={(e) => set({ ...val, [s]: e.target.value })} />
                    </td>
                  ))}
                  <td className="koma-sum">{SUBJECTS.reduce((a, s) => a + toInt(val[s]), 0)}コマ</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="field" style={{ marginTop: 10 }}>
            <label>5教科以外の提案内容</label>
            <input className="input" value={komaOther} onChange={(e) => setKomaOther(e.target.value)} placeholder="例: リスニング・スピーキング" />
          </div>
        </div>

        <div className="cond-sub">
          <button className="cond-toggle" onClick={() => setShowTeiki((v) => !v)}>
            {showTeiki ? "▾" : "▸"} 学校の定期テスト（任意）
            <span className="pf-hint">入力すると 1・2章で点数と目標との差にふれます
              {Object.values(schoolTests).some((t) => t.score || t.target) ? "（入力あり）" : ""}</span>
          </button>
          {showTeiki && (
            <table className="koma-table input-table">
              <thead><tr><th></th>{SUBJECTS.map((s) => <th key={s}>{s}</th>)}</tr></thead>
              <tbody>
                {(["score", "target"] as const).map((k) => (
                  <tr key={k}>
                    <th>{k === "score" ? "点数" : "目標"}</th>
                    {SUBJECTS.map((s) => (
                      <td key={s}>
                        <input className="input koma-num" type="number" min={0} max={100} value={schoolTests[s]?.[k] ?? ""}
                          onChange={(e) => setSchoolTests({
                            ...schoolTests,
                            [s]: { score: schoolTests[s]?.score ?? "", target: schoolTests[s]?.target ?? "", [k]: e.target.value },
                          })} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <button className="btn btn-primary" style={{ marginTop: 16, width: "100%" }} onClick={generate} disabled={generating}>
          {generating
            ? <><span className="spinner" />生成中… {elapsed}秒（ETS/SSS解析＋Opus生成。2〜4分ほどかかります）</>
            : `📝 ${genMode === "structured" ? "講習 提案書" : "面談資料"}を生成${refSss.length ? `（参考SSS ${refSss.length}件を適用）` : ""}`}
        </button>
      </div>

      {err && <div className="error-box"><div className="big">⚠️</div>生成エラー: {err}</div>}

      {/* work area: result (left) + Genie (right) */}
      <div className="mendan-work">
        <div className="grid" style={{ gap: 20, alignContent: "start" }}>
          {generating && !hasResult && (
            <div className="card card-pad">
              <div className="skeleton" style={{ height: 20, width: "40%", marginBottom: 14 }} />
              <div className="skeleton" style={{ height: 90, marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 90 }} />
            </div>
          )}
          {generating && hasResult && (
            <div className="regen-note">
              <span className="spinner dark" />再生成中です（{elapsed}秒）。完了すると下の資料が新しい内容に置き換わります。失敗した場合は今の資料がそのまま残ります。
            </div>
          )}

          {!generating && !hasResult && (
            <div className="card card-pad">
              <div className="empty">
                <div className="big">📝</div>
                「面談資料を生成」を押すと、ここに資料が表示されます。<br />
                生成後は、右の Genie に聞いた結果で各セクションを修正できます（変更前・変更後を確認して承認）。
              </div>
            </div>
          )}

          {/* Genie-driven revision proposals: review per section */}
          {proposals.map((p) => {
            const pending = p.items.filter((it) => it.decision === "pending").length;
            return (
              <div key={p.id} className="card card-pad review-card">
                <div className="card-head">
                  <div>
                    <div className="card-title"><span className="dot" />Genie の結果による修正案</div>
                    <div className="review-q">質問：{p.question}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {p.status === "ready" && pending > 0 && (
                      <>
                        <span className="card-note">未確認 {pending} 件</span>
                        <button className="btn btn-ghost btn-sm" onClick={() => decideAll(p.id, "rejected")}>すべて却下</button>
                        <button className="btn btn-primary btn-sm" onClick={() => decideAll(p.id, "approved")}>すべて承認</button>
                      </>
                    )}
                    {(p.status !== "loading" && pending === 0) && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setProposals((ps) => ps.filter((x) => x.id !== p.id))}>閉じる</button>
                    )}
                  </div>
                </div>

                {p.status === "loading" && (
                  <div className="review-loading"><span className="spinner dark" />どのセクションをどう直すべきか検討しています…</div>
                )}
                {p.status === "error" && <div className="error-box" style={{ padding: 16 }}>修正案の作成に失敗しました: {p.error}</div>}
                {p.status === "ready" && p.items.length === 0 && (
                  <div className="empty" style={{ padding: 16 }}>この結果で直すべきセクションは見つかりませんでした。</div>
                )}

                {p.items.map((it) => (
                  <div key={it.key} className={`review-item ${it.decision}`}>
                    <div className="review-item-head">
                      <div>
                        <div className="review-label">{it.label}</div>
                        {it.reason && <div className="review-reason">変更理由：{it.reason}</div>}
                      </div>
                      {it.decision === "pending" ? (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => decide(p.id, it.key, "rejected")}>✕ 却下</button>
                          <button className="btn btn-primary btn-sm" onClick={() => decide(p.id, it.key, "approved")}>✓ 承認して反映</button>
                        </div>
                      ) : (
                        <span className={`badge ${it.decision === "approved" ? "badge-green" : "badge-neutral"}`}>
                          {it.decision === "approved" ? "✓ 承認済み（資料に反映）" : "却下（変更なし）"}
                        </span>
                      )}
                    </div>
                    {it.decision === "pending" && <DiffView before={it.before} after={it.after} />}
                  </div>
                ))}
              </div>
            );
          })}

          {/* structured result */}
          {fields && (
            <div className="card card-pad">
              <div className="card-head">
                <div className="card-title"><span className="dot" />表面：講習 提案書 — 編集可能</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {saved && <span className="badge badge-green">✓ 保存しました</span>}
                  <button className="btn btn-ghost btn-sm" onClick={() => setSaved(true)}>💾 保存</button>
                  <select className="input-select paper-select" value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
                    <option value="A3">A3縦</option>
                    <option value="A4">A4縦</option>
                  </select>
                  <button className="btn btn-ghost btn-sm" onClick={printProposal}>🖨 両面で印刷 / PDF</button>
                  <button className="btn btn-primary btn-sm" onClick={downloadStructured}>📥 ダウンロード</button>
                </div>
              </div>
              <GenNote etsParsed={etsParsed} sssParsed={sssParsed} refUsed={refUsed} />
              {(() => {
                const d = proposalDoc();
                return d && (
                  <div className="proposal-head">
                    <div className="ph-title">{title(d)}</div>
                    <div className="ph-sub">{subtitle(d)}</div>
                  </div>
                );
              })()}
              <div className="grid" style={{ gap: 16 }}>
                {visibleFields.map((f) => (
                  <div className="field" key={f.key}>
                    <label>
                      {f.admin ? f.label : `【${f.label}】`}
                      {noteFor(f.note) && <span className="field-note">{noteFor(f.note)}</span>}
                      {f.key === "remarks" && <span className="field-note">教室長が記入する欄です</span>}
                      {f.admin && <span className="badge badge-neutral" style={{ marginLeft: 8 }}>社内のみ</span>}
                      {pendingKeys.has(f.key) && <span className="badge badge-amber" style={{ marginLeft: 8 }}>修正案あり（上で確認）</span>}
                    </label>
                    <AutoTextarea
                      className="input"
                      style={{ minHeight: 90, background: f.admin ? "#f8f9fc" : undefined }}
                      value={fields[f.key] ?? ""}
                      onChange={(e) => { setFields({ ...fields, [f.key]: e.target.value }); setSaved(false); }}
                    />
                    {(sources[f.key] ?? []).length > 0 && (
                      <div className="src-row">
                        <span className="src-ico">🔗 参照データ:</span>
                        {sources[f.key].map((s, i) => <span className="src-chip" key={i}>{s}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {fields && (
            <ProposalBack
              komaUnits={komaUnits}
              setKomaUnits={(u) => { setKomaUnits(u); setSaved(false); }}
              komaInd={komaInd}
              komaGrp={komaGrp}
              komaOther={komaOther}
              ctest={ctestTable}
            />
          )}

          {/* free-form result */}
          {freeText != null && (
            <div className="card card-pad">
              <div className="card-head">
                <div className="card-title"><span className="dot" />生成結果（自由フォーマット）</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setFreeEditing((v) => !v)}>
                    {freeEditing ? "👁 プレビュー" : "✏️ 編集"}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(freeText)}>📋 コピー</button>
                  <button className="btn btn-primary btn-sm" onClick={downloadFree}>📥 .md ダウンロード</button>
                </div>
              </div>
              <GenNote etsParsed={etsParsed} sssParsed={sssParsed} refUsed={refUsed} />
              {freeEditing ? (
                <textarea className="input" style={{ minHeight: 460, fontFamily: "monospace", fontSize: 13 }}
                  value={freeText} onChange={(e) => setFreeText(e.target.value)} />
              ) : (
                <div className="md-view" dangerouslySetInnerHTML={{ __html: renderMarkdown(freeText) }} />
              )}
              {usedSources.length > 0 && (
                <div className="src-row" style={{ marginTop: 14 }}>
                  <span className="src-ico">🔗 参照データ:</span>
                  {usedSources.map((s, i) => <span className="src-chip" key={i}>{s}</span>)}
                </div>
              )}
            </div>
          )}

          {raw && (
            <div className="card card-pad">
              <div className="card-title" style={{ marginBottom: 12 }}><span className="dot" />生成テキスト</div>
              <textarea className="input" style={{ minHeight: 400 }} value={raw} onChange={(e) => setRaw(e.target.value)} />
            </div>
          )}

        </div>

        {/* Genie panel (sticky) */}
        <div className="mendan-genie">
          <GenieChat
            compact
            title="🔎 Genie に追加質問"
            suggestions={genieSuggestions}
            enableAgent
            agentSuggestions={agentSuggestions}
            onAction={reviseFromGenie}
            actionLabel="✏️ この結果で資料を修正"
            doneLabel="✓ 修正案を作成済み"
            actionDisabledHint={hasResult && !raw ? undefined : "先に面談資料を生成してください"}
            doneKeys={proposedKeys}
            storageKey={`genie:${classroom}:${student}`}
          />
        </div>
      </div>
    </div>
  );
}

/** Shows where a pre-filled value came from, or that manual input is needed. */
function PrefillHint({ p, k, value }: {
  p: Prefill | null; k: "target_school" | "current_dev" | "target_dev"; value: string;
}) {
  if (!p) return <span className="pf-hint">資料を確認中…</span>;
  const src = p.sources[k];
  const auto = p[k];
  if (src && value === auto) return <span className="pf-hint auto">✓ 自動入力：{src}</span>;
  if (src && value !== auto) return <span className="pf-hint">✏️ 手入力で変更（資料の値: {auto}）</span>;
  return <span className="pf-hint manual">資料に記載なし — 手入力してください</span>;
}

/** Textarea that grows with its content (no inner scrolling while reading). */
function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 4}px`;
  }, [props.value]);
  return <textarea ref={ref} {...props} style={{ ...props.style, overflow: "hidden", resize: "vertical" }} />;
}

function GenNote({ etsParsed, sssParsed, refUsed }: { etsParsed: boolean; sssParsed: boolean; refUsed: string[] }) {
  return (
    <div className="disclaimer" style={{ marginBottom: 14, flexWrap: "wrap", gap: 6 }}>
      ⚠️ AI による生成結果です。配布前に内容を必ず確認・編集してください。画面では各項目に参照したテーブル／ドキュメントを表示し、印刷版には保護者向けの注記だけを載せます。
      {etsParsed && <span className="badge badge-green">✓ ETS診断PDFを解析して反映</span>}
      {sssParsed && <span className="badge badge-green">✓ 本人の講習SSSを反映</span>}
      {refUsed.map((r) => <span key={r} className="badge badge-amber">📎 参考SSS: {r}</span>)}
    </div>
  );
}

function DataStat({ icon, label, value, unit }: {
  icon: string; label: string; value: string | number; unit?: string;
}) {
  return (
    <div style={{ background: "#f8f9fc", border: "1px solid #e5e8f0", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, color: "#6b7389", fontWeight: 600 }}>{icon} {label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
        {value}{unit && <span style={{ fontSize: 13, color: "#9aa1b4", marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  );
}
