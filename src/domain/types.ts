export const APP_NAME = "coreFold";
export const APP_TAGLINE = "Protein minification for co-folding";
export const ALGORITHM_VERSION = "Minification algorithm v1.1";

export const WINDOW_SIZE = 5 as const;
export const DEFAULT_PLDDT_THRESHOLD = 50;
export const DEFAULT_MIN_CANDIDATE_LENGTH = 30;
export const DEFAULT_MIN_TERMINAL_CANDIDATE_LENGTH = 15;
export const ANGSTROM_PER_RESIDUE = 3.8;
export const FLEXIBILITY_MULTIPLIER = 1.3;
export const HUMAN_TAXONOMY_ID = 9606;
export const SHARE_QUERY_PARAM = "greenfold";
export const SHARE_QUERY_MAX_LENGTH = 8000;
export const MINIFIED_LENGTH_FLOOR = 1;

export const PLDDT_COLORS = {
  veryHigh: "#0053D6",
  high: "#65CBF3",
  low: "#FFDB13",
  veryLow: "#FF7D45",
} as const;

export type ResidueIndex = number;

export type Vec3 = { x: number; y: number; z: number };

export type UniProtFeatureType =
  "domain" | "chain" | "peptide" | "signal" | "region" | "motif" | "compositional_bias";

export const SELECTABLE_FEATURE_TYPES: UniProtFeatureType[] = [
  "chain",
  "signal",
  "peptide",
  "domain",
];

export const FEATURE_TYPE_LABEL: Record<UniProtFeatureType, string> = {
  domain: "Domain",
  chain: "Chain",
  peptide: "Peptide",
  signal: "Signal",
  region: "Region",
  motif: "Motif",
  compositional_bias: "Compositional bias",
};

export type UniProtFeature = {
  id: string;
  type: UniProtFeatureType;
  start: ResidueIndex;
  end: ResidueIndex;
  description?: string;
  evidence?: unknown;
};

export type ProteinRecord = {
  accession: string;
  entryName: string;
  gene?: string;
  proteinName?: string;
  organismName: string;
  organismId?: number;
  sequence: string;
  length: number;
  features: UniProtFeature[];
};

export type StructureRecord = {
  source: "alphafold_db";
  entryId: string;
  coordinateUrl: string;
  mmcifText: string;
  plddt: number[];
  ca: Array<Vec3 | null>;
};

export type ConstructKind = "full_length" | "domain" | "restored_final";

export type Construct = {
  kind: ConstructKind;
  start: ResidueIndex;
  end: ResidueIndex;
  featureId?: string;
  label: string;
};

export type EditSource = "automatic" | "user" | "share_link";
export type EditStatus = "applied" | "pending" | "rejected";

export type BaseEdit = {
  id: string;
  source: EditSource;
  status: EditStatus;
  candidateId?: string;
};

export type DeletionEdit = BaseEdit & {
  type: "deletion";
  start: ResidueIndex;
  end: ResidueIndex;
};

export type ReplacementEdit = BaseEdit & {
  type: "replacement";
  start: ResidueIndex;
  end: ResidueIndex;
  insertedSequence: string;
  recommendedSequence?: string;
  anchorDistanceAngstrom?: number;
};

export type SubstitutionEdit = BaseEdit & {
  type: "substitution";
  position: ResidueIndex;
  fromAA: string;
  toAA: string;
};

export type Edit = DeletionEdit | ReplacementEdit | SubstitutionEdit;

export type Interval = {
  start: ResidueIndex;
  end: ResidueIndex;
};

export type CandidateClass = "n_terminal" | "c_terminal" | "internal" | "entire_construct";

export type AutoRecommendation =
  | "terminal_delete"
  | "internal_review"
  | "not_beneficial"
  | "geometry_unavailable"
  | "not_actionable";

export type InternalGeometry = {
  leftAnchor: ResidueIndex;
  rightAnchor: ResidueIndex;
  distanceAngstrom: number;
  minimumLinkerLength: number;
  recommendedLinkerLength: number;
  recommendedLinker: string;
  linkerToDeletionRatio: number;
  netReduction: number;
};

export type Candidate = {
  id: string;
  start: ResidueIndex;
  end: ResidueIndex;
  length: number;
  class: CandidateClass;
  meanPlddt: number;
  minPlddt: number;
  maxPlddt: number;
  annotationFeatureIds: string[];
  autoRecommendation: AutoRecommendation;
  internal?: InternalGeometry;
};

export type AnalysisSettings = {
  plddtThreshold: number;
  minimumCandidateLength: number;
  minimumTerminalCandidateLength: number;
  windowSize: typeof WINDOW_SIZE;
};

export type ResidueMapStatus = "retained" | "deleted" | "inserted" | "substituted";

export type ResidueMapRow = {
  uniprotPosition: number | null;
  uniprotAA: string | null;
  status: ResidueMapStatus;
  minifiedPosition: number | null;
  minifiedAA: string | null;
  editId: string | null;
};

export type Selection = {
  start: ResidueIndex;
  end: ResidueIndex;
  source: "sequence" | "structure" | "candidate_panel" | "focus";
  at?: number;
};

export type AnalysisInput = {
  sequence: string;
  plddt: number[];
  ca?: Array<Vec3 | null>;
  constructStart: ResidueIndex;
  constructEnd: ResidueIndex;
  plddtThreshold?: number;
  minimumCandidateLength?: number;
  minimumTerminalCandidateLength?: number;
};

export const DEFAULT_ANALYSIS_SETTINGS: AnalysisSettings = {
  plddtThreshold: DEFAULT_PLDDT_THRESHOLD,
  minimumCandidateLength: DEFAULT_MIN_CANDIDATE_LENGTH,
  minimumTerminalCandidateLength: DEFAULT_MIN_TERMINAL_CANDIDATE_LENGTH,
  windowSize: WINDOW_SIZE,
};

export function intervalLength(interval: Interval): number {
  return interval.end - interval.start + 1;
}

export function candidateId(start: ResidueIndex, end: ResidueIndex): string {
  return `cand-${start}-${end}`;
}

export function editId(kind: Edit["type"], start: ResidueIndex, end = start): string {
  return `edit-${kind}-${start}-${end}`;
}
