// Minimal, safe Markdown → HTML (headings / bold / lists / tables / links / paragraphs).
// Input is always escaped first; only the constructs below are turned into tags.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(s: string): string {
  let out = esc(s.replace(/\\\[/g, "[").replace(/\\\]/g, "]")); // Genie escapes citation brackets: \[[1](url)\]
  // Citations from Genie Agent mode: [[1](url)] → superscript [1]
  out = out.replace(/\[\[(\d+)\]\((https?:\/\/[^\s)]+)\)\]/g,
    (_m, n, url) => `<sup class="cite"><a href="${url}" target="_blank" rel="noopener noreferrer">[${n}]</a></sup>`);
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, text, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`);
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return out;
}

export function renderMarkdown(md: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let table: string[][] = [];
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const flushTable = () => {
    if (!table.length) return;
    const [h, ...rows] = table;
    out.push(`<table><thead><tr>${h.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${
      rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    table = [];
  };
  // A table row sometimes has the next sentence glued to it ("| a | b |文章…"): split it off.
  const lines = md.split("\n").flatMap((ln) => {
    const t = ln.trim();
    const last = t.lastIndexOf("|");
    return t.startsWith("|") && last > 0 && last < t.length - 1 ? [t.slice(0, last + 1), t.slice(last + 1)] : [ln];
  });
  for (const line of lines) {
    const t = line.trim();
    if (/^\|.*\|$/.test(t)) {
      closeList();
      if (/^\|\s*:?-{3,}/.test(t)) continue;
      table.push(t.slice(1, -1).split("|").map((c) => c.trim()));
      continue;
    }
    flushTable();
    if (!t) { closeList(); continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    if (h) { closeList(); const lv = Math.min(h[1].length + 1, 5); out.push(`<h${lv}>${inline(h[2])}</h${lv}>`); continue; }
    const ul = /^[-*・]\s+(.*)$/.exec(t);
    const ol = /^\d+[.)]\s+(.*)$/.exec(t);
    if (ul || ol) {
      const kind = ul ? "ul" : "ol";
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${inline(t)}</p>`);
  }
  closeList();
  flushTable();
  return out.join("");
}
