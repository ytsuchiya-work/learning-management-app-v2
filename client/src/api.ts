export interface StudentsResp {
  classrooms: string[];
  by_classroom: Record<string, string[]>;
}

export interface CTestPoint {
  label: string;
  year: string;
  英語: number | null;
  数学: number | null;
  国語: number | null;
  理科: number | null;
  社会: number | null;
  合計: number | null;
  偏差値: number | null;
}

export interface PcsUnit {
  教科: string;
  大単元名: string;
  単元名: string;
  問題数: number;
  正解: number;
  部分正解: number;
  不正解: number;
  定着度: "定着" | "一部定着" | "未定着";
}

export interface OverviewRow {
  生徒コード: string;
  英語: number | null;
  数学: number | null;
  国語: number | null;
  理科: number | null;
  社会: number | null;
  "5科合計": number | null;
  is_current: boolean;
}

export interface DashboardResp {
  counts: { ctest: number; pcs: number; ets: number; sss: number };
  ctest_series: CTestPoint[];
  deviation_latest: { 偏差値?: number | null; 合計?: number | null; label?: string };
  pcs_units: PcsUnit[];
  pcs_summary: { 定着: number; 一部定着: number; 未定着: number };
  overview: OverviewRow[];
  subjects: string[];
}

export interface GenieResp {
  answer: string;
  conversation_id: string;
  sql: string | null;
  columns: string[];
  rows: (string | number)[][];
}

export interface MendanFields {
  student_goal_text?: string;
  ctest_summary?: string;
  target_gap?: string;
  ets_eval?: string;
  english_analysis?: string;
  math_analysis?: string;
  other_subjects?: string;
  remarks?: string;
  data_notes?: string;
}

/** 裏面「提案コマ数・詳細」の個別：教科ごとの単元とコマ数 */
export interface KomaUnit { unit: string; koma: number }
export type KomaUnits = Record<string, KomaUnit[]>;

// ──────────────────────────────────────────────
// Session handling
// When the Databricks Apps login session expires, the reverse proxy answers
// API calls with a redirect to the workspace login page (another origin).
// fetch() cannot follow that, so the browser only reports "Failed to fetch".
// We detect this, tell the app (window event), and let the user reload —
// a top-level reload re-authenticates silently while the workspace login is alive.
// ──────────────────────────────────────────────
export const SESSION_EXPIRED = "SESSION_EXPIRED";
export const SESSION_EVENT = "lms:session-expired";

export class SessionExpiredError extends Error {
  constructor() {
    super("ログインの有効期限が切れました。ページを再読み込みしてください（作業内容は保持されます）。");
    this.name = SESSION_EXPIRED;
  }
}

function notifySessionExpired() {
  window.dispatchEvent(new Event(SESSION_EVENT));
}

/** true = session alive, false = expired/redirected, null = network unreachable. */
export async function checkSession(): Promise<boolean | null> {
  try {
    const r = await fetch("/api/whoami", { redirect: "manual", cache: "no-store" });
    if (r.type === "opaqueredirect" || r.status === 401 || r.status === 403 || (r.status >= 300 && r.status < 400)) return false;
    return r.ok;
  } catch {
    return null;
  }
}

/** fetch() that turns an expired login session into a clear error (and retries transient failures once). */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const once = () => fetch(input, { ...init, redirect: "manual" });
  let r: Response;
  try {
    r = await once();
  } catch (e) {
    const alive = await checkSession();
    if (alive === false) { notifySessionExpired(); throw new SessionExpiredError(); }
    if (alive === null) throw new Error("サーバーに接続できません。ネットワークを確認してください。");
    r = await once(); // session is fine → transient failure, retry once
  }
  if (r.type === "opaqueredirect" || r.status === 401) {
    notifySessionExpired();
    throw new SessionExpiredError();
  }
  return r;
}

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let detail = r.statusText || `HTTP ${r.status}`;
    if (r.status === 504) detail = "処理が時間内に終わりませんでした（504）。もう一度お試しください。";
    try {
      detail = (await r.json()).detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return r.json();
}

export const api = {
  whoami: () => apiFetch("/api/whoami").then((r) => j<{ email: string; sp_note: string }>(r)),
  students: () => apiFetch("/api/students").then((r) => j<StudentsResp>(r)),
  dashboard: (classroom: string, student: string, mode: string) =>
    apiFetch(`/api/dashboard?classroom=${classroom}&student=${student}&mode=${encodeURIComponent(mode)}`).then(
      (r) => j<DashboardResp>(r)
    ),
  genieAsk: (message: string, conversation_id: string | null) =>
    apiFetch("/api/genie/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, conversation_id }),
    }).then((r) => j<GenieResp>(r)),
  mendanData: (classroom: string, student: string) =>
    apiFetch(`/api/mendan/data?classroom=${classroom}&student=${student}`).then((r) =>
      j<{ ctest: number; pcs: number; ets: number; sss: number }>(r)
    ),
  mendanGenerate: (body: MendanBody) =>
    apiFetch("/api/mendan/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) =>
      j<MendanResult>(r)
    ),
  sssList: () => apiFetch("/api/sss/list").then((r) => j<{ items: SssItem[] }>(r)),
  prefill: (classroom: string, student: string) =>
    apiFetch(`/api/mendan/prefill?classroom=${classroom}&student=${student}`).then((r) => j<Prefill>(r)),
  terms: (classroom: string) =>
    apiFetch(`/api/terms?classroom=${classroom}`).then((r) =>
      j<{ distinct_terms: number; variant_groups: number; examples: string[][] }>(r)
    ),
};

export interface MendanResult {
  fields?: MendanFields;
  free_text?: string;
  raw_response?: string;
  sources?: Record<string, string[]>;
  used_sources?: string[];
  ets_parsed?: boolean;
  sss_parsed?: boolean;
  ref_used?: string[];
  koma_units?: KomaUnits;
  ets_date?: string;
  ctest_table?: CTestPoint[];
}

export interface SssItem {
  classroom: string;
  student: string;
  file_name: string;
  file_path: string;
  label: string;
  school: string;
  term: string;
  grade: string;
  teachers: string;
  target: string;
  compat: string;
  course: string;
  proposal: string;
  report: string;
}

export type MendanBody = {
  classroom: string; student: string; tone: string;
  target_school: string; current_dev: string; target_dev: string;
  mode: "structured" | "free";
  ref_sss: string[];
  student_name: string; course: string; judgement: string;
  school_tests: Record<string, { score: string; target: string }>;
  koma_individual: Record<string, string>;
  koma_group: Record<string, string>;
  koma_other: string;
};

/**
 * Generate via WebSocket (bypasses the 120s Databricks Apps proxy timeout so
 * long Opus generations complete). Falls back to the HTTP endpoint on failure.
 */
export function mendanGenerateWS(body: MendanBody): Promise<MendanResult> {
  return wsCall<MendanResult>("/api/mendan/ws", body);
}

export interface Revision {
  key: string;
  label: string;
  before: string;
  after: string;
  reason: string;
}

export type ReviseBody = {
  classroom: string; student: string;
  question: string; answer: string; sql?: string | null;
  columns?: string[]; rows?: (string | number)[][];
  sections: { key: string; label: string; text: string }[];
};

/** Propose edits to existing sections from a Genie finding (WS, HTTP fallback). */
export async function reviseWithGenie(body: ReviseBody): Promise<{ revisions: Revision[] }> {
  try {
    return await wsCall<{ revisions: Revision[] }>("/api/mendan/revise/ws", body);
  } catch (e: any) {
    if (e?.message !== "ws-unavailable") throw e;
    const r = await apiFetch("/api/mendan/revise", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return j<{ revisions: Revision[] }>(r);
  }
}

export interface Prefill {
  target_school: string;
  current_dev: string;
  target_dev: string;
  sources: Partial<Record<"target_school" | "current_dev" | "target_dev", string>>;
}

/** One request/response over a WebSocket (bypasses the 120s Apps proxy timeout). */
export interface AgentProgress { kind: "progress"; icon: string; text: string }

export interface AgentResult {
  answer: string;
  conversation_id: string | null;
  sqls: { title: string; sql: string }[];
  file_searches: number;
}

/** Genie Agent mode (tables + Volume files). Streams progress, ~2–3 min. */
export function genieAgentAsk(
  message: string, conversation_id: string | null, onProgress: (p: AgentProgress) => void
): Promise<AgentResult> {
  return wsCall<AgentResult>("/api/genie/agent/ws", { message, conversation_id }, onProgress);
}

async function wsCall<T>(path: string, body: unknown, onProgress?: (p: AgentProgress) => void): Promise<T> {
  try {
    return await wsCallRaw<T>(path, body, onProgress);
  } catch (e: any) {
    if (e?.message === "ws-unavailable") {
      // The socket could not open: an expired login is the usual reason.
      const alive = await checkSession();
      if (alive === false) { notifySessionExpired(); throw new SessionExpiredError(); }
    }
    throw e;
  }
}

function wsCallRaw<T>(path: string, body: unknown, onProgress?: (p: AgentProgress) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let opened = false;
    // "ws-unavailable" = socket never opened → caller may fall back to HTTP.
    const fail = () => new Error(opened ? "生成中に接続が切れました。もう一度お試しください。" : "ws-unavailable");
    try {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}${path}`);
      const timer = setTimeout(() => {
        if (!settled) { settled = true; try { ws.close(); } catch { /* */ } reject(new Error("生成がタイムアウトしました（10分）")); }
      }, 600000);
      ws.onopen = () => { opened = true; ws.send(JSON.stringify(body)); };
      ws.onmessage = (ev) => {
        if (settled) return;
        let data: T & { error?: string; kind?: string };
        try {
          data = JSON.parse(ev.data);
        } catch (e) {
          settled = true; clearTimeout(timer); try { ws.close(); } catch { /* */ }
          reject(e as Error);
          return;
        }
        if (data.kind === "progress") { onProgress?.(data as unknown as AgentProgress); return; }
        settled = true;
        clearTimeout(timer);
        try { ws.close(); } catch { /* */ }
        if (data.error) reject(new Error(data.error));
        else resolve(data);
      };
      ws.onerror = () => {
        if (!settled) { settled = true; clearTimeout(timer); reject(fail()); }
      };
      ws.onclose = () => {
        if (!settled) { settled = true; clearTimeout(timer); reject(fail()); }
      };
    } catch {
      reject(new Error("ws-unavailable"));
    }
  });
}

export const SUBJECT_COLORS: Record<string, string> = {
  英語: "#2563eb",
  数学: "#f97316",
  国語: "#16a34a",
  理科: "#dc2626",
  社会: "#9333ea",
};
