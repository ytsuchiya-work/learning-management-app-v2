import { useRef, useState, useEffect } from "react";
import { api, AgentProgress, genieAgentAsk } from "../api";
import { loadState, saveState } from "../persist";
import { renderMarkdown } from "../md";

export interface GenieMsg {
  role: "user" | "assistant";
  content: string;
  question?: string;
  sql?: string | null;
  columns?: string[];
  rows?: (string | number)[][];
  error?: boolean;
  /** Answer produced by Genie Agent mode (tables + Volume files). */
  agent?: boolean;
  steps?: AgentProgress[];
  sqls?: { title: string; sql: string }[];
  fileSearches?: number;
}

/** Round long floats (e.g. -23.599999999) for display. */
export function fmtCell(v: unknown): string {
  const s = String(v ?? "");
  return /^-?\d+\.\d{3,}$/.test(s) ? String(Math.round(Number(s) * 10) / 10) : s;
}

function boldHtml(s: string): string {
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

const DEFAULT_SUGGESTIONS = [
  "生徒210029の数学の得点推移は？",
  "教室2209で5科合計が最も高い生徒は？",
  "英語の偏差値が50を超えた生徒は？",
];

interface Stored { messages: GenieMsg[]; convId: string | null; agentConvId?: string | null; agentMode?: boolean }

export default function GenieChat({
  compact = false,
  title = "Genie チャットボット",
  suggestions = DEFAULT_SUGGESTIONS,
  agentSuggestions,
  enableAgent = false,
  onAction,
  actionLabel = "✏️ この結果で資料を修正",
  doneLabel = "✓ 修正案を作成済み",
  actionDisabledHint,
  doneKeys,
  storageKey,
}: {
  /** When set, the conversation is kept across reloads under this key. */
  storageKey?: string;
  compact?: boolean;
  title?: string;
  suggestions?: string[];
  /** Suggestions shown while Agent mode is on. */
  agentSuggestions?: string[];
  /** Show the 「ファイルも検索（Agentモード）」 switch. */
  enableAgent?: boolean;
  /** When given, each answer gets an action button (e.g. revise the document). */
  onAction?: (msg: GenieMsg) => void;
  actionLabel?: string;
  doneLabel?: string;
  /** If set, the action is disabled and this hint is shown instead. */
  actionDisabledHint?: string;
  doneKeys?: Set<string>;
}) {
  const [messages, setMessages] = useState<GenieMsg[]>([]);
  const [input, setInput] = useState("");
  const [convId, setConvId] = useState<string | null>(null);
  const [agentConvId, setAgentConvId] = useState<string | null>(null);
  const [agentMode, setAgentMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<AgentProgress[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [restoredKey, setRestoredKey] = useState<string | undefined>(undefined);

  // Load / switch the stored conversation when the key changes
  useEffect(() => {
    if (!storageKey) return;
    const s = loadState<Stored>(storageKey);
    setMessages(s?.messages ?? []);
    setConvId(s?.convId ?? null);
    setAgentConvId(s?.agentConvId ?? null);
    setAgentMode(enableAgent && !!s?.agentMode);
    setRestoredKey(storageKey);
  }, [storageKey, enableAgent]);

  useEffect(() => {
    if (storageKey && restoredKey === storageKey) saveState<Stored>(storageKey, { messages, convId, agentConvId, agentMode });
  }, [storageKey, restoredKey, messages, convId, agentConvId, agentMode]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, live]);

  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: q, agent: agentMode }]);
    setBusy(true);
    setLive([]);
    try {
      if (agentMode) {
        const steps: AgentProgress[] = [];
        const r = await genieAgentAsk(q, agentConvId, (p) => { steps.push(p); setLive([...steps]); });
        setAgentConvId(r.conversation_id);
        setMessages((m) => [...m, {
          role: "assistant", content: r.answer, question: q, agent: true,
          steps, sqls: r.sqls, fileSearches: r.file_searches,
        }]);
      } else {
        const r = await api.genieAsk(q, convId);
        setConvId(r.conversation_id);
        setMessages((m) => [...m, {
          role: "assistant", content: r.answer, question: q, sql: r.sql, columns: r.columns, rows: r.rows,
        }]);
      }
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `エラーが発生しました: ${e.message || e}`, error: true }]);
    } finally {
      setBusy(false);
      setLive([]);
    }
  }

  const shownSuggestions = agentMode && agentSuggestions ? agentSuggestions : suggestions;

  return (
    <div className="card card-pad">
      <div className="card-head">
        <div className="card-title"><span className="dot" />{title}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => { setMessages([]); setConvId(null); setAgentConvId(null); }} disabled={busy}>
          🔄 会話をリセット
        </button>
      </div>

      {enableAgent && (
        <div className={`agent-switch ${agentMode ? "on" : ""}`}>
          <label>
            <input type="checkbox" checked={agentMode} disabled={busy} onChange={(e) => setAgentMode(e.target.checked)} />
            <span className="agent-switch-t">📂 ファイルも検索（Agent モード）</span>
          </label>
          <span className="agent-switch-d">
            {agentMode
              ? "テーブルに加えて、Volume の資料（ETS 診断 PDF など）も調べて回答します。回答まで2〜3分かかります。"
              : "オフ：テーブルだけを SQL で調べます（数十秒）。"}
          </span>
        </div>
      )}

      <div className={`chat-wrap ${compact ? "compact" : ""}`}>
        <div className="chat-scroll" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="chat-empty">
              <div className="big">{agentMode ? "📂" : "💬"}</div>
              <div style={{ fontWeight: 600, color: "#1b2234", fontSize: 16 }}>
                {compact ? "Genie に聞いた結果で、資料のセクションを修正できます" : "成績データに質問してみましょう"}
              </div>
              <div style={{ marginTop: 6 }}>
                {agentMode ? "Agent モードは、テーブルと資料ファイルを何段階かに分けて調べ、出典付きで回答します。"
                  : "自然言語で質問すると、Genie が SQL を生成して回答します。"}
              </div>
              <div className="suggestions">
                {shownSuggestions.map((s) => (
                  <button key={s} className="suggestion" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            const key = genieKey(m);
            const done = doneKeys?.has(key);
            return (
              <div key={i} className={`msg ${m.role === "user" ? "user" : ""}`}>
                <div className={`msg-avatar ${m.role === "user" ? "me" : "bot"}`}>
                  {m.role === "user" ? "🧑" : m.agent ? "📂" : "✨"}
                </div>
                <div style={{ minWidth: 0 }}>
                  {m.role === "assistant" && m.agent && !m.error ? (
                    <div className="msg-bubble agent-answer">
                      <div className="agent-tag">Agent モード ・ SQL {m.sqls?.length ?? 0} 回 ・ ファイル検索 {m.fileSearches ?? 0} 回</div>
                      <div className="md-view" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                    </div>
                  ) : (
                    <div
                      className="msg-bubble"
                      style={m.error ? { borderColor: "#f5b5b5", background: "#fdeaea" } : undefined}
                      dangerouslySetInnerHTML={{ __html: boldHtml(m.content) }}
                    />
                  )}

                  {m.agent && m.steps && m.steps.length > 0 && (
                    <details className="agent-steps">
                      <summary>🔍 調べた手順（{m.steps.length}）</summary>
                      <ol>{m.steps.map((s, si) => <li key={si}><span>{s.icon}</span>{s.text}</li>)}</ol>
                      {m.sqls && m.sqls.length > 0 && (
                        <details className="sql-box">
                          <summary className="sql-head">⚙️ 実行された SQL（{m.sqls.length}）</summary>
                          {m.sqls.map((q, qi) => <div key={qi} className="sql-code"><b>-- {q.title}</b>{"\n"}{q.sql.trim()}</div>)}
                        </details>
                      )}
                    </details>
                  )}

                  {m.sql && (
                    <details className="sql-box" open={!compact}>
                      <summary className="sql-head">⚙️ 生成された SQL</summary>
                      <div className="sql-code">{m.sql}</div>
                    </details>
                  )}

                  {m.columns && m.columns.length > 0 && m.rows && m.rows.length > 0 && (
                    <div className="tbl-wrap" style={{ marginTop: 10, maxHeight: compact ? 220 : 300, overflowY: "auto" }}>
                      <table>
                        <thead>
                          <tr>{m.columns.map((c) => <th key={c}>{c}</th>)}</tr>
                        </thead>
                        <tbody>
                          {m.rows.slice(0, 100).map((row, ri) => (
                            <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{fmtCell(cell)}</td>)}</tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {m.role === "assistant" && !m.error && (
                    <div className="msg-foot">
                      <span className="disclaimer" style={{ marginTop: 0 }}>
                        {m.agent
                          ? "⚠️ 複数のデータから推論した回答です。出典と手順を確認してください。"
                          : "⚠️ AI による生成結果です。元データで確認してください。"}
                      </span>
                      {onAction && (
                        <button
                          className={`btn btn-sm ${done ? "btn-ghost" : "btn-primary"}`}
                          disabled={done || !!actionDisabledHint}
                          title={actionDisabledHint}
                          onClick={() => onAction(m)}
                        >
                          {done ? doneLabel : actionLabel}
                        </button>
                      )}
                      {onAction && actionDisabledHint && !done && (
                        <span className="action-hint">{actionDisabledHint}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {busy && (
            <div className="msg">
              <div className="msg-avatar bot">{agentMode ? "📂" : "✨"}</div>
              <div className="msg-bubble">
                <span className="dots-typing"><span /><span /><span /></span>
                <span style={{ marginLeft: 8, color: "#9aa1b4", fontSize: 13 }}>
                  {agentMode ? `Genie（Agent モード）が調べています… ${elapsed}秒` : "Genie が回答を生成中…"}
                </span>
                {agentMode && live.length > 0 && (
                  <ol className="agent-live">
                    {live.slice(-6).map((s, si) => <li key={si}><span>{s.icon}</span>{s.text}</li>)}
                  </ol>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="chat-input-row">
          <textarea
            className="chat-input"
            rows={1}
            placeholder={agentMode ? "例: 同じような成績の他の生徒が、志望校に向けて効果的だった取り組みは？" : "質問を入力してください（例: 生徒210029の数学の推移は？）"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); }
            }}
            disabled={busy}
          />
          <button className="btn btn-primary" onClick={() => send(input)} disabled={busy || !input.trim()}>
            {busy ? <span className="spinner" /> : "送信"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function genieKey(m: GenieMsg) {
  return `${m.question ?? ""}::${m.content}`;
}
