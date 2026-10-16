export type JumpTab = "dashboard" | "mendan";

export interface Jump {
  tab: JumpTab;
  classroom?: string;
  student?: string;
  mode?: "管理者" | "保護者";
}

interface Step {
  no: number;
  title: string;
  who: string;
  show: string[];
  talk: string;
  jump: Jump;
  jumpLabel: string;
}

// デモで使う推奨生徒
// 2209/230015: 模試6回分＋ETSあり → 推移が見やすい
// 2209/250020: ETS＋本人の講習SSSあり → 面談資料の見せ場
export const STEPS: Step[] = [
  {
    no: 1,
    title: "成績ダッシュボードで生徒の状況をつかむ",
    who: "教室長（管理者モード）",
    show: [
      "面談準備サマリー：強み・課題・偏差値・PCS定着率を1行で把握",
      "模試の教科別推移と5科偏差値（基準線50）",
      "PCS単元別の定着度（教科で絞り込み）",
      "教室全体の比較表（管理者のみ表示）",
    ],
    talk: "これまでは模試・PCS・ETSを別々に開いて状況を確認していました。ここでは1画面で、面談で話すべき点が分かります。",
    jump: { tab: "dashboard", classroom: "2209", student: "230015", mode: "管理者" },
    jumpLabel: "生徒 2209/230015 で開く",
  },
  {
    no: 2,
    title: "面談資料タブへ移り、使うデータの出どころを確認する",
    who: "教室長",
    show: [
      "ダッシュボードの「この生徒の面談資料を作成 →」で移動",
      "保有データ（Cテスト／PCS／ETS／講習SSS）の件数",
      "データソース一覧：テーブルとVolumeをUnity Catalogで一元管理",
      "用語マスター：PCS単元名の表記ゆれ（例：1次関数／一次関数）を自動検出",
    ],
    talk: "どのデータを根拠にしたかが常に見えます。表記ゆれも検出できるので、用語マスター整備の足がかりになります。",
    jump: { tab: "mendan", classroom: "2209", student: "250020", mode: "管理者" },
    jumpLabel: "生徒 2209/250020 で開く",
  },
  {
    no: 3,
    title: "参考にする先生の講習SSSを選ぶ",
    who: "教室長",
    show: [
      "本人の講習SSSは自動で反映",
      "他校舎・他の室長が作ったSSSから最大3件を選択",
      "選んだシートの目標設定の立て方・単元とコマ数の示し方・保護者への伝え方を適用",
      "参考シートの数値や志望校は転記しない",
    ],
    talk: "講習SSSを面談用に作り直す手間をなくします。うまい室長の書き方を、他の教室でもそのまま使えます。",
    jump: { tab: "mendan", classroom: "2209", student: "250020", mode: "管理者" },
    jumpLabel: "面談資料タブを開く",
  },
  {
    no: 4,
    title: "講習 提案書を生成する（定型／自由フォーマット）",
    who: "教室長",
    show: [
      "志望校・現状偏差値は講習SSSと模試から自動入力（生徒名・学科コース・判定・提案コマ数・定期テストなど資料にない項目は手入力）",
      "定型：提案資料【例】と同じ構成（目標＋1〜6章＋備考、各章「・」4行）で、保護者向けの言葉で出力",
      "自由：生徒に合わせた構成でMarkdown出力",
      "ETS診断PDFは ai_parse_document() で読み取り、学習特性・行動評価に反映",
      "画面では各項目に参照したテーブル・ドキュメントを表示（印刷版は「※PCS・オープン模試の結果より分析」などの注記）",
    ],
    talk: "根拠が項目ごとに付くので、「この数字はどこから？」に即答できます。LLMは Unity Catalog のモデルサービス経由で呼び出しています。",
    jump: { tab: "mendan", classroom: "2209", student: "250020", mode: "管理者" },
    jumpLabel: "面談資料タブを開く",
  },
  {
    no: 5,
    title: "Genie に追加質問して、既存のセクションを直す",
    who: "教室長",
    show: [
      "右側の「Genie に追加質問」で自由に質問（例：教室平均との比較）",
      "「📂 ファイルも検索（Agent モード）」をオンにすると、ETS 診断 PDF などの資料も調べて出典付きで回答（2〜3分）",
      "生成されたSQL・調べた手順・出典を確認",
      "「✏️ この結果で資料を修正」で、関係するセクションの修正案を作成",
      "セクションごとに変更前・変更後（差分つき）を見て、承認か却下を選ぶ",
    ],
    talk: "AI の修正をそのまま入れず、教室長がセクションごとに確認してから反映します。承認した箇所には Genie の質問が出典として付きます。",
    jump: { tab: "mendan", classroom: "2209", student: "250020", mode: "管理者" },
    jumpLabel: "面談資料タブを開く",
  },
  {
    no: 6,
    title: "仕上げて配布する",
    who: "教室長 → 保護者",
    show: [
      "本文はその場で編集",
      "「両面で印刷 / PDF」で表面（本文）・裏面（提案コマ数表と模試の推移グラフ・表）を出力（A4縦／A3縦）",
      "テキスト／Markdownでダウンロード",
      "保護者モードでは担当者用メモを非表示",
    ],
    talk: "表面・裏面の講習提案書が数分で揃います。10月の保護者面談で、そのまま使える形を目指しています。",
    jump: { tab: "mendan", classroom: "2209", student: "250020", mode: "保護者" },
    jumpLabel: "保護者モードで開く",
  },
];

const PAINS = [
  { icon: "👤", t: "ノウハウが属人化", d: "面談資料は教室長の経験とExcelテンプレートで作成。スーパーバイザーに依存している。" },
  { icon: "🔁", t: "講習SSSの作り直し", d: "室長ごとにロジックが違う講習SSSを、保護者面談用に別途作り直している。" },
  { icon: "🧩", t: "データがばらばら", d: "PCS・模試・ETS・SSSがサイロ化。ローカルにダウンロードして手作業で加工している。" },
  { icon: "📅", t: "10月の面談で本番活用", d: "現状はGeminiで試行中。根拠が説明できる資料を短期間で作りたい。" },
];

const POINTS = [
  { t: "Unity Catalog で一元管理", d: "テーブル・PDF/Excel（Volume）・LLM（モデルサービス）の権限を1か所で管理。" },
  { t: "紙・PDFもデータに", d: "ETS診断PDFを ai_parse_document() で構造化し、分析に使える形にする。" },
  { t: "根拠が見えるAI", d: "面談資料の各項目に参照データ、Genieの回答に生成SQLを表示。" },
  { t: "室長ノウハウの再利用", d: "良い講習SSSの書き方を、他の教室の資料づくりにも適用。" },
  { t: "全教室への展開", d: "Databricks Apps はユーザー数課金ではないため、約1,800教室に広げやすい。" },
];

const NEXT = [
  "取れているデータ／取れていないデータの棚卸し",
  "アウトプットイメージ（A3ペライチ・スプレッドシート）の具体化",
  "将来：会計・KPIデータ（奉行クラウド、Biz Forecast、Oracle on EC2 など）の統合",
  "将来：面談中の会話をもとにしたリアルタイム提案",
];

export default function Scenario({ onJump }: { onJump: (j: Jump) => void }) {
  return (
    <div className="grid" style={{ gap: 20 }}>
      <div className="scn-hero">
        <div className="scn-kicker">デモシナリオ</div>
        <div className="scn-title">保護者面談資料を「作り直さない」仕組みへ</div>
        <div className="scn-sub">
          模試・PCS・ETS・講習SSSを Unity Catalog に集め、ダッシュボードで状況を把握し、
          AI で面談資料を下書きする。教室長は確認と編集だけに集中できます。
        </div>
        <button className="btn btn-primary" onClick={() => onJump(STEPS[0].jump)}>▶ ステップ1から始める</button>
      </div>

      <div className="card card-pad">
        <div className="card-head">
          <div className="card-title"><span className="dot" />いまの課題（お打ち合わせより）</div>
        </div>
        <div className="grid grid-4" style={{ gap: 14 }}>
          {PAINS.map((p) => (
            <div key={p.t} className="scn-pain">
              <div className="scn-pain-icon">{p.icon}</div>
              <div className="scn-pain-t">{p.t}</div>
              <div className="scn-pain-d">{p.d}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-pad">
        <div className="card-head">
          <div className="card-title"><span className="dot" />デモの流れ</div>
          <div className="card-note">各ステップのボタンで該当画面へ移動します</div>
        </div>
        <div className="scn-steps">
          {STEPS.map((s) => (
            <div key={s.no} className="scn-step">
              <div className="scn-no">{s.no}</div>
              <div className="scn-body">
                <div className="scn-step-head">
                  <div>
                    <div className="scn-step-t">{s.title}</div>
                    <div className="scn-who">操作する人：{s.who}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => onJump(s.jump)}>{s.jumpLabel} →</button>
                </div>
                <ul className="scn-show">
                  {s.show.map((x) => <li key={x}>{x}</li>)}
                </ul>
                <div className="scn-talk">💬 {s.talk}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card card-pad">
          <div className="card-head">
            <div className="card-title"><span className="dot" />Databricks で実現しているポイント</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {POINTS.map((p) => (
              <div key={p.t} className="scn-point"><b>{p.t}</b><span>{p.d}</span></div>
            ))}
          </div>
        </div>
        <div className="card card-pad">
          <div className="card-head">
            <div className="card-title"><span className="dot" />次のステップ</div>
          </div>
          <ul className="scn-next">
            {NEXT.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Thin guide strip shown at the top of the dashboard / mendan tabs. */
export function ScenarioGuide({ steps, onOpenScenario }: { steps: number[]; onOpenScenario: () => void }) {
  const items = STEPS.filter((s) => steps.includes(s.no));
  return (
    <div className="scn-guide">
      <span className="scn-guide-label">🎬 デモの流れ</span>
      <div className="scn-guide-steps">
        {items.map((s) => (
          <span key={s.no} className="scn-guide-step"><b>{s.no}</b>{s.title}</span>
        ))}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={onOpenScenario}>シナリオ全体を見る</button>
    </div>
  );
}
