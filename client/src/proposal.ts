// 講習 提案書（提案資料アウトプット【例】と同じ構成）の印刷・テキスト出力。
// 表面 = 見出し帯＋枠付きの各章、裏面 = 提案コマ数・詳細／オープン模試 成績推移（グラフ＋表）。
import { CTestPoint, KomaUnits, MendanFields } from "./api";

export const SUBJECTS = ["英語", "数学", "国語", "理科", "社会"] as const;

// 提案資料【例】のグラフと同じ配色
export const SHEET_COLORS: Record<string, string> = {
  英語: "#6aa84f",
  数学: "#3d85c6",
  国語: "#e04b3c",
  理科: "#f6a700",
  社会: "#9b30d9",
};

export type Paper = "A4" | "A3";

export interface SectionDef { key: keyof MendanFields; label: string; note?: string }

export interface ProposalDoc {
  classroom: string;
  student: string;
  studentName: string;
  targetSchool: string;
  course: string;
  judgement: string;
  sections: SectionDef[];
  fields: MendanFields;
  komaUnits: KomaUnits;
  komaInd: Record<string, string>;
  komaGrp: Record<string, string>;
  komaOther: string;
  ctest: CTestPoint[];
}

export const toInt = (v: unknown): number => {
  const m = /\d+/.exec(String(v ?? ""));
  return m ? parseInt(m[0], 10) : 0;
};

/** 個別の教科合計：単元の配分があればその合計、無ければ入力値 */
export function individualTotal(doc: Pick<ProposalDoc, "komaUnits" | "komaInd">, s: string): number {
  const units = doc.komaUnits[s] ?? [];
  return units.length ? units.reduce((a, u) => a + toInt(u.koma), 0) : toInt(doc.komaInd[s]);
}

export function title(doc: ProposalDoc): string {
  return `${doc.studentName || `生徒${doc.student}`} 様 講習 提案書`;
}

export function subtitle(doc: ProposalDoc): string {
  const parts = [`志望校: ${doc.targetSchool || "—"}`];
  if (doc.course) parts.push(`(学科・コース) ${doc.course}`);
  if (doc.judgement) parts.push(`（判定: ${doc.judgement}）`);
  return parts.join("  ");
}

const esc = (s: string) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Line chart (0〜100点) as inline SVG, like the sheet's chart. Gaps where a score is missing. */
export function chartSvg(points: CTestPoint[], w = 700, h = 300): string {
  if (!points.length) return "";
  const L = 46, R = 16, T = 34, B = 34;
  const iw = w - L - R, ih = h - T - B;
  const x = (i: number) => L + (points.length === 1 ? iw / 2 : (iw * i) / (points.length - 1));
  const y = (v: number) => T + ih - (ih * Math.max(0, Math.min(100, v))) / 100;
  const out: string[] = [];
  for (let v = 0; v <= 100; v += 10) {
    out.push(`<line x1="${L}" x2="${w - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e3e6ea" stroke-width="1"/>`);
    out.push(`<text x="${L - 6}" y="${y(v) + 3.5}" font-size="10" text-anchor="end" fill="#555">${v}</text>`);
  }
  out.push(`<text x="12" y="${T + ih / 2}" font-size="10" fill="#555" transform="rotate(-90 12 ${T + ih / 2})" text-anchor="middle">点数（100点満点）</text>`);
  points.forEach((p, i) => {
    out.push(`<text x="${x(i)}" y="${h - 12}" font-size="10.5" text-anchor="middle" fill="#333">${esc(p.label)}</text>`);
  });
  SUBJECTS.forEach((s) => {
    const c = SHEET_COLORS[s];
    let seg: string[] = [];
    const flush = () => {
      if (seg.length > 1) out.push(`<polyline points="${seg.join(" ")}" fill="none" stroke="${c}" stroke-width="2"/>`);
      seg = [];
    };
    points.forEach((p, i) => {
      const v = p[s as keyof CTestPoint] as number | null;
      if (v == null) { flush(); return; }
      seg.push(`${x(i)},${y(v)}`);
      out.push(`<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${c}"/>`);
    });
    flush();
  });
  const lw = 58, lx0 = w / 2 - (lw * SUBJECTS.length) / 2;
  SUBJECTS.forEach((s, i) => {
    const lx = lx0 + i * lw;
    out.push(`<circle cx="${lx}" cy="14" r="4.5" fill="${SHEET_COLORS[s]}"/><text x="${lx + 9}" y="18" font-size="11" fill="#333">${s}</text>`);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%">${out.join("")}</svg>`;
}

function backSide(doc: ProposalDoc): string {
  const units = SUBJECTS.map((s) => doc.komaUnits[s] ?? []);
  const nRows = Math.max(10, ...units.map((u) => u.length));
  const indTotal = SUBJECTS.reduce((a, s) => a + individualTotal(doc, s), 0);
  const grpTotal = SUBJECTS.reduce((a, s) => a + toInt(doc.komaGrp[s]), 0);
  const dash = (n: number) => (n > 0 ? String(n) : "―");

  const indRows: string[] = [];
  for (let r = 0; r < nRows; r++) {
    indRows.push(`<tr>${units.map((u) => {
      const it = u[r];
      return `<td class="unit">${it ? esc(it.unit) : ""}</td><td class="koma">${it ? toInt(it.koma) : ""}</td>`;
    }).join("")}</tr>`);
  }
  const ctRows = SUBJECTS.map((s) => `<tr><th>${s}</th>${doc.ctest.map((p) => {
    const v = p[s as keyof CTestPoint] as number | null;
    return `<td>${v == null ? "―" : v}</td>`;
  }).join("")}</tr>`).join("");
  const totRow = `<tr><th>5科合計</th>${doc.ctest.map((p) => `<td>${p.合計 == null ? "―" : p.合計}</td>`).join("")}</tr>`;

  return `
  <div class="band">📋 提案コマ数・詳細</div>
  <div class="subhead"><b>【個別】</b><span class="sum">合計 ${indTotal}コマ</span></div>
  <table class="koma">
    <tr>${SUBJECTS.map((s) => `<th colspan="2" class="subj">${s}</th>`).join("")}</tr>
    <tr>${SUBJECTS.map(() => `<th class="small">単元名</th><th class="small k">コマ数</th>`).join("")}</tr>
    ${indRows.join("")}
    <tr class="total">${SUBJECTS.map((s) => `<td colspan="2">${dash(individualTotal(doc, s))}</td>`).join("")}</tr>
  </table>
  <div class="subhead"><b>【集団・その他】</b><span class="sum">合計 ${grpTotal}コマ</span></div>
  <table class="koma">
    <tr>${SUBJECTS.map((s) => `<th class="subj">${s}</th>`).join("")}</tr>
    <tr class="total">${SUBJECTS.map((s) => `<td>${dash(toInt(doc.komaGrp[s]))}</td>`).join("")}</tr>
    <tr><th class="small">5教科以外の提案内容</th><td colspan="4" class="unit">${esc(doc.komaOther)}</td></tr>
  </table>
  <div class="band">📊 オープン模試 成績推移</div>
  ${doc.ctest.length ? `<div class="chart">${chartSvg(doc.ctest)}</div>
  <table class="ct"><tr><th></th>${doc.ctest.map((p) => `<th>${esc(p.label)}</th>`).join("")}</tr>${ctRows}${totRow}</table>`
    : `<p class="empty">オープン模試のデータがありません。</p>`}`;
}

export function buildProposalHtml(doc: ProposalDoc, paper: Paper): string {
  const sec = doc.sections.map((f) => {
    const body = (doc.fields[f.key] ?? "").trim();
    return `<section><h2>【${esc(f.label)}】${f.note ? `<span class="note">${esc(f.note)}</span>` : ""}</h2>
      <div class="body">${body ? esc(body).replace(/\n/g, "<br>") : "&nbsp;"}</div></section>`;
  }).join("");
  // 1面1ページに収める：用紙の印字領域（余白10mm）に合わせ、はみ出す面だけ文字を縮める
  const [pw, ph] = paper === "A3" ? [297, 420] : [210, 297];
  const fs = paper === "A3" ? 15 : 11;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title(doc))}</title>
  <style>
    @page { size: ${paper} portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    .page { width: ${pw - 20}mm; font-size: ${fs}px; }
    body { font-family: "Hiragino Kaku Gothic ProN","Noto Sans JP",Arial,sans-serif; color:#1b1b1b; margin:0; }
    .page { break-after: page; }
    .page:last-child { break-after: auto; }
    .head { background:#1f3864; color:#fff; padding:0.6em 0.9em; }
    .head h1 { font-size:1.9em; margin:0; letter-spacing:0.02em; }
    .head .sub { font-size:1.05em; margin-top:0.2em; color:#dfe6f2; }
    section { border:1px solid #9aa3ad; margin-top:0.7em; padding:0.35em 0.6em 0.5em; break-inside:avoid; }
    h2 { font-size:1.1em; margin:0 0 0.3em; }
    h2 .note { font-size:0.82em; font-weight:normal; color:#666; margin-left:1.2em; }
    .body { font-size:1em; line-height:1.6; min-height:2.2em; }
    .band { background:#1f3864; color:#fff; text-align:center; font-weight:bold; font-size:1.3em; padding:0.4em; margin-top:0.9em; }
    .band:first-child { margin-top:0; }
    .subhead { display:flex; justify-content:space-between; margin:0.6em 0 0.2em; font-size:1.05em; }
    .subhead .sum { color:#1f3864; font-weight:bold; }
    table { border-collapse:collapse; width:100%; }
    table.koma { table-layout:fixed; }
    table.koma th, table.koma td { border:1px solid #9aa3ad; padding:0.15em 0.3em; font-size:0.9em; }
    table.koma th.subj { background:#dce3ee; font-size:1em; }
    table.koma th.small { background:#f1f4f8; font-size:0.78em; }
    table.koma th.k, table.koma td.koma { width:2.6em; text-align:center; }
    table.koma td.unit { height:1.55em; }
    table.koma tr.total td { text-align:center; font-weight:bold; font-size:1.25em; background:#f1f4f8; }
    .chart { border:1px solid #c9ced4; margin-top:0.5em; padding:0.3em; }
    table.ct { margin-top:0.4em; }
    table.ct th, table.ct td { border:1px solid #9aa3ad; text-align:center; padding:0.2em; font-size:0.95em; }
    table.ct tr:first-child th { background:#1f3864; color:#fff; }
    table.ct th:first-child { background:#f1f4f8; width:5.5em; }
    .empty { color:#888; }
  </style></head><body>
  <div class="page">
    <div class="head"><h1>${esc(title(doc))}</h1><div class="sub">${esc(subtitle(doc))}</div></div>
    ${sec}
  </div>
  <div class="page">${backSide(doc)}</div>
  <script>
    function fitPages() {
      const limit = ${ph - 20} * 96 / 25.4;
      document.querySelectorAll(".page").forEach((pg) => {
        let f = ${fs};
        while (pg.scrollHeight > limit && f > 6) { f -= 0.25; pg.style.fontSize = f + "px"; }
      });
    }
    window.onload = () => { fitPages(); if (!window.__noPrint) window.print(); };
  </script>
  </body></html>`;
}

/** Plain-text version for download (表面＋裏面). */
export function proposalText(doc: ProposalDoc): string {
  const front = doc.sections
    .map((f) => `【${f.label}】${f.note ? `   ${f.note}` : ""}\n${(doc.fields[f.key] ?? "").trim()}`)
    .join("\n\n");
  const ind = SUBJECTS.map((s) => {
    const us = doc.komaUnits[s] ?? [];
    const t = individualTotal(doc, s);
    return `${s}: ${t > 0 ? `${t}コマ` : "―"}${us.length ? `（${us.map((u) => `${u.unit} ${u.koma}`).join("、")}）` : ""}`;
  }).join("\n");
  const grp = SUBJECTS.map((s) => `${s}: ${toInt(doc.komaGrp[s]) > 0 ? `${toInt(doc.komaGrp[s])}コマ` : "―"}`).join("\n");
  const ct = doc.ctest.length
    ? ["時期\t" + SUBJECTS.join("\t") + "\t5科合計",
       ...doc.ctest.map((p) => [p.label, ...SUBJECTS.map((s) => (p[s as keyof CTestPoint] as number | null) ?? "―"), p.合計 ?? "―"].join("\t"))].join("\n")
    : "（データなし）";
  const indTotal = SUBJECTS.reduce((a, s) => a + individualTotal(doc, s), 0);
  const grpTotal = SUBJECTS.reduce((a, s) => a + toInt(doc.komaGrp[s]), 0);
  return `${title(doc)}\n${subtitle(doc)}\n\n${front}\n\n` +
    `━━ 裏面 ━━\n📋 提案コマ数・詳細\n【個別】合計 ${indTotal}コマ\n${ind}\n\n【集団・その他】合計 ${grpTotal}コマ\n${grp}\n` +
    `5教科以外の提案内容: ${doc.komaOther || "―"}\n\n📊 オープン模試 成績推移\n${ct}\n`;
}
