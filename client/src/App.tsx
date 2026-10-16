import { useEffect, useMemo, useState } from "react";
import { api, StudentsResp, SESSION_EVENT, checkSession } from "./api";
import { loadState, saveState } from "./persist";
import Dashboard from "./components/Dashboard";
import Mendan from "./components/Mendan";
import Scenario, { Jump, ScenarioGuide } from "./components/Scenario";

type Tab = "scenario" | "dashboard" | "mendan";
type Mode = "管理者" | "保護者";

const TABS: { id: Tab; icon: string; label: string; sub: string }[] = [
  { id: "scenario", icon: "🎬", label: "デモシナリオ", sub: "課題・デモの流れ・見どころ" },
  { id: "dashboard", icon: "📊", label: "成績ダッシュボード", sub: "得点推移・単元定着度・教室比較" },
  { id: "mendan", icon: "📋", label: "保護者面談資料", sub: "講習SSS・ETS・Genie を使った面談資料の作成" },
];

interface UiState { classroom: string; student: string; mode: Mode; tab: Tab; showGuide: boolean }

export default function App() {
  const saved = loadState<UiState>("ui");
  const [students, setStudents] = useState<StudentsResp | null>(null);
  const [classroom, setClassroom] = useState<string>("");
  const [student, setStudent] = useState<string>("");
  const [mode, setMode] = useState<Mode>(saved?.mode ?? "管理者");
  const [tab, setTab] = useState<Tab>(saved?.tab ?? "scenario");
  const [showGuide, setShowGuide] = useState(saved?.showGuide ?? true);
  const [email, setEmail] = useState<string>("");
  const [loadErr, setLoadErr] = useState<string>("");
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    api.whoami().then((r) => setEmail(r.email)).catch(() => {});
    api
      .students()
      .then((r) => {
        setStudents(r);
        if (r.classrooms.length) {
          // Restore the previous selection after a reload, if still valid
          const c = saved && r.by_classroom[saved.classroom] ? saved.classroom : r.classrooms[0];
          const list = r.by_classroom[c] ?? [];
          setClassroom(c);
          setStudent(saved && list.includes(saved.student) ? saved.student : list[0] ?? "");
        }
      })
      .catch((e) => setLoadErr(String(e.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (classroom && student) saveState<UiState>("ui", { classroom, student, mode, tab, showGuide });
  }, [classroom, student, mode, tab, showGuide]);

  // Login session: react to failures, and check proactively every 3 minutes
  useEffect(() => {
    const onExpired = () => setSessionExpired(true);
    window.addEventListener(SESSION_EVENT, onExpired);
    const id = setInterval(async () => {
      if ((await checkSession()) === false) setSessionExpired(true);
    }, 180000);
    const onFocus = async () => { if ((await checkSession()) === false) setSessionExpired(true); };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(SESSION_EVENT, onExpired);
      window.removeEventListener("focus", onFocus);
      clearInterval(id);
    };
  }, []);

  const studentList = useMemo(
    () => (students && classroom ? students.by_classroom[classroom] ?? [] : []),
    [students, classroom]
  );

  function onClassroom(c: string) {
    setClassroom(c);
    setStudent(students?.by_classroom[c]?.[0] ?? "");
  }

  function jump(j: Jump) {
    if (j.classroom && students?.by_classroom[j.classroom]) {
      setClassroom(j.classroom);
      const list = students.by_classroom[j.classroom];
      setStudent(j.student && list.includes(j.student) ? j.student : list[0] ?? "");
    }
    if (j.mode) setMode(j.mode);
    setTab(j.tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">🎓</div>
          <div>
            <div className="brand-title">生徒成績管理</div>
            <div className="brand-sub">Learning Management v2（提案書準拠）</div>
          </div>
        </div>

        <div className="side-group">
          <span className="side-label">教室コード</span>
          <select className="select" value={classroom} onChange={(e) => onClassroom(e.target.value)}>
            {students?.classrooms.map((c) => (
              <option key={c} value={c}>
                教室 {c}
              </option>
            ))}
          </select>
        </div>

        <div className="side-group">
          <span className="side-label">生徒コード</span>
          <select className="select" value={student} onChange={(e) => setStudent(e.target.value)}>
            {studentList.map((s) => (
              <option key={s} value={s}>
                生徒 {s}
              </option>
            ))}
          </select>
        </div>

        <div className="side-group">
          <span className="side-label">表示モード</span>
          <div className="mode-toggle">
            {(["管理者", "保護者"] as Mode[]).map((m) => (
              <button
                key={m}
                className={`mode-btn ${mode === m ? "active" : ""}`}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="side-group">
          <span className="side-label">デモガイド</span>
          <div className="mode-toggle">
            <button className={`mode-btn ${showGuide ? "active" : ""}`} onClick={() => setShowGuide(true)}>表示</button>
            <button className={`mode-btn ${!showGuide ? "active" : ""}`} onClick={() => setShowGuide(false)}>非表示</button>
          </div>
        </div>

        <div className="side-footer">
          {loadErr ? (
            <span style={{ color: "#ff9a9a" }}>接続エラー: {loadErr}</span>
          ) : (
            <>
              現在の選択
              <br />
              <span className="side-chip">
                🏫 教室 {classroom || "—"} ／ 👤 生徒 {student || "—"}
              </span>
            </>
          )}
        </div>
      </aside>

      <main className="main">
        {sessionExpired && (
          <div className="session-banner">
            <span>🔒 ログインの有効期限が切れました。再読み込みすると自動で再ログインします（作成中の資料・Genie の会話は保持されます）。</span>
            <button className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>再読み込みして続ける</button>
          </div>
        )}
        <div className="topbar">
          <div>
            <div className="page-title">
              {active.icon} {active.label}
            </div>
            <div className="page-sub">{active.sub}</div>
          </div>
          <div className="user-badge" title="このアプリへのサインインユーザー">
            <div className="user-avatar">{(email || "?").charAt(0).toUpperCase()}</div>
            {email || "ゲスト"}
          </div>
        </div>

        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="content">
          {showGuide && tab === "dashboard" && <ScenarioGuide steps={[1, 2]} onOpenScenario={() => setTab("scenario")} />}
          {showGuide && tab === "mendan" && <ScenarioGuide steps={[2, 3, 4, 5, 6]} onOpenScenario={() => setTab("scenario")} />}
          {tab === "scenario" && <Scenario onJump={jump} />}
          {tab === "dashboard" && (
            <Dashboard classroom={classroom} student={student} mode={mode} onCreateMendan={() => setTab("mendan")} />
          )}
          {tab === "mendan" && <Mendan classroom={classroom} student={student} mode={mode} />}
        </div>
      </main>
    </div>
  );
}
