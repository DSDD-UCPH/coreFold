import { GREENFOLD_BASE_URL } from "../domain/exporters/greenfoldA3m";

export const TIPS_TITLE = "coreFold: Protein minification for co-folding";

export const TIPS_INTRO =
  "coreFold is intended for focused co-folding predictions. Protein minification reduces the sequence to the structural context required for the region of interest, while removing regions that may add computational cost and/or introduce poorly constrained outcomes. Note that this tool is not intended to produce an experimentally stable standalone protein construct, but rather a structurally focused input for co-folding methods.";

export type Tip = {
  id: string;
  headline: string;
  body: string;
  /** Rendered as a trailing link after the body text. */
  link?: { label: string; href: string };
};

export const TIPS: Tip[] = [
  {
    id: "low-confidence",
    headline: "Remove irrelevant low-confidence regions.",
    body: "Long regions with low pLDDT are good candidates for trimming, particularly disordered or poorly resolved termini. Note that low pLDDT should be interpreted as low confidence in the predicted structure, not automatically as disorder.",
  },
  {
    id: "region-of-interest",
    headline: "Identify the region of interest first.",
    body: "Always preserve the complete structural context and nearby supporting structure required for the segment or interaction being evaluated, e.g. binding sites, interfaces, or catalytic sites.",
  },
  {
    id: "biological-question",
    headline: "Minify according to the biological question.",
    body: "For extracellular interactions, preserve the relevant extracellular region; for intracellular interactions, preserve the corresponding intracellular context. Apply the same principle to ligand-binding or active-site studies.",
  },
  {
    id: "binding-site-intrusion",
    headline: "Watch for low-confidence regions entering binding sites.",
    body: "Flexible termini or internal segments can occasionally be placed into pockets or interfaces by the model. If such placement is poorly supported and biologically irrelevant, removing the segment can produce cleaner co-folding results.",
  },
  {
    id: "folding-units",
    headline: "Preserve stable folding units.",
    body: "Prefer boundaries between domains or within flexible loops. Avoid cutting through helices, sheets, conserved structural elements, or the immediate surroundings of the region of interest. Dark-blue regions with high confidence/pLDDT are more likely to retain their local fold, including when separated by a split or connected by a linker.",
  },
  {
    id: "structural-context",
    headline: "Keep structural context around the target.",
    body: "Do not trim directly at an interface or binding-site boundary. Retaining surrounding folded structure helps preserve the native geometry of the region being studied.",
  },
  {
    id: "internal-deletions",
    headline: "Handle long internal deletions carefully.",
    body: "Non-contiguous retained regions can be modelled as separate chains or connected with a linker. Based on the sequence distance between the retained regions and the intervening structure, decide whether splitting or linking is the more appropriate representation.",
  },
  {
    id: "native-msas",
    headline: "Prefer native MSAs.",
    body: "Start from the full-length wild-type multiple sequence alignment and remove columns corresponding to deleted sequence. For human proteins, ready-to-use full-length alignments are available through greenFold via the export buttons or at",
    link: { label: GREENFOLD_BASE_URL, href: GREENFOLD_BASE_URL },
  },
  {
    id: "compare-alternatives",
    headline: "Compare alternative minifications when uncertain.",
    body: "Testing nearby boundaries or alternative split/linker configurations can be more informative than relying on a single construct.",
  },
  {
    id: "check-structure",
    headline: "Check the retained structure.",
    body: "Compare the minified prediction with the full-length or reference structure and confirm that the local fold and region of interest remain consistent.",
  },
];

/** Tips surfaced as headlines on the start page, before any protein is loaded. */
export const START_PAGE_TIP_IDS = ["region-of-interest", "low-confidence", "folding-units"];

export const START_PAGE_TIPS = START_PAGE_TIP_IDS.map((id) => {
  const tip = TIPS.find((candidate) => candidate.id === id);
  if (!tip) throw new Error(`Unknown tip id: ${id}`);
  return tip;
});
