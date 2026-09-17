import { overlappingFeatures } from "./annotations";
import { classifyCandidate, plddtSummary } from "./candidates";
import { euclideanDistance } from "./geometry";
import {
  internalEditIsBeneficial,
  minimumLinkerLength,
  recommendedLinker,
  recommendedLinkerLength,
} from "./linkers";
import { detectCandidateIntervals } from "./plddt";
import {
  candidateId,
  DEFAULT_ANALYSIS_SETTINGS,
  editId,
  intervalLength,
  type AnalysisSettings,
  type Candidate,
  type CandidateClass,
  type Construct,
  type DeletionEdit,
  type Edit,
  type Interval,
  type ProteinRecord,
  type ReplacementEdit,
  type StructureRecord,
  type UniProtFeature,
  type UniProtFeatureType,
  type Vec3,
  FEATURE_TYPE_LABEL,
  SELECTABLE_FEATURE_TYPES,
} from "./types";

export function buildCandidates(
  protein: ProteinRecord,
  structure: StructureRecord,
  construct: Interval,
  settings: AnalysisSettings = DEFAULT_ANALYSIS_SETTINGS,
): Candidate[] {
  const intervals = detectCandidateIntervals({
    sequence: protein.sequence,
    plddt: structure.plddt,
    ca: structure.ca,
    constructStart: construct.start,
    constructEnd: construct.end,
    plddtThreshold: settings.plddtThreshold,
    minimumCandidateLength: settings.minimumCandidateLength,
    minimumTerminalCandidateLength: settings.minimumTerminalCandidateLength,
  });

  return intervals.map((interval) =>
    annotateCandidate(interval, construct, protein.features, structure.plddt, structure.ca),
  );
}

export function annotateCandidate(
  interval: Interval,
  construct: Interval,
  features: UniProtFeature[],
  plddt: number[],
  ca: Array<Vec3 | null>,
): Candidate {
  const klass = classifyCandidate(interval, construct);
  const stats = plddtSummary(plddt, interval);
  const overlaps = overlappingFeatures(interval, features);
  const candidate: Candidate = {
    id: candidateId(interval.start, interval.end),
    start: interval.start,
    end: interval.end,
    length: intervalLength(interval),
    class: klass,
    meanPlddt: stats.mean,
    minPlddt: stats.min,
    maxPlddt: stats.max,
    annotationFeatureIds: overlaps.map((feature) => feature.id),
    autoRecommendation: recommendationForClass(klass),
  };

  if (klass === "internal") {
    const geometry = computeInternalGeometry(interval, construct, ca);
    if (!geometry) {
      candidate.autoRecommendation = "geometry_unavailable";
    } else {
      candidate.internal = geometry;
      candidate.autoRecommendation = internalEditIsBeneficial(
        candidate.length,
        geometry.recommendedLinkerLength,
      )
        ? "internal_review"
        : "not_beneficial";
    }
  }

  return candidate;
}

function recommendationForClass(klass: Candidate["class"]): Candidate["autoRecommendation"] {
  if (klass === "entire_construct") return "not_actionable";
  if (klass === "internal") return "internal_review";
  return "terminal_delete";
}

export function computeInternalGeometry(
  interval: Interval,
  construct: Interval,
  ca: Array<Vec3 | null>,
): Candidate["internal"] | undefined {
  const leftAnchor = interval.start - 1;
  const rightAnchor = interval.end + 1;
  if (leftAnchor < construct.start || rightAnchor > construct.end) {
    return undefined;
  }
  const left = ca[leftAnchor - 1];
  const right = ca[rightAnchor - 1];
  if (!left || !right) {
    return undefined;
  }
  const distanceAngstrom = euclideanDistance(left, right);
  const minLen = minimumLinkerLength(distanceAngstrom);
  const recLen = recommendedLinkerLength(distanceAngstrom);
  const linker = recommendedLinker(distanceAngstrom);
  const deletedLength = intervalLength(interval);
  return {
    leftAnchor,
    rightAnchor,
    distanceAngstrom,
    minimumLinkerLength: minLen,
    recommendedLinkerLength: recLen,
    recommendedLinker: linker,
    linkerToDeletionRatio: deletedLength === 0 ? 0 : recLen / deletedLength,
    netReduction: deletedLength - recLen,
  };
}

export function automaticProposalEdits(candidates: Candidate[]): Edit[] {
  const edits: Edit[] = [];
  for (const candidate of candidates) {
    if (candidate.autoRecommendation === "terminal_delete") {
      const edit: DeletionEdit = {
        id: editId("deletion", candidate.start, candidate.end),
        type: "deletion",
        source: "automatic",
        status: "applied",
        start: candidate.start,
        end: candidate.end,
        candidateId: candidate.id,
      };
      edits.push(edit);
    } else if (candidate.autoRecommendation === "internal_review" && candidate.internal) {
      const edit: ReplacementEdit = {
        id: editId("replacement", candidate.start, candidate.end),
        type: "replacement",
        source: "automatic",
        status: "pending",
        start: candidate.start,
        end: candidate.end,
        insertedSequence: candidate.internal.recommendedLinker,
        recommendedSequence: candidate.internal.recommendedLinker,
        anchorDistanceAngstrom: candidate.internal.distanceAngstrom,
        candidateId: candidate.id,
      };
      edits.push(edit);
    }
  }
  return edits;
}

export function fullLengthConstruct(protein: ProteinRecord): Construct {
  return {
    kind: "full_length",
    start: 1,
    end: protein.length,
    label: "Full length",
  };
}

export function featureChoiceName(feature: {
  type?: UniProtFeatureType;
  description?: string;
}): string {
  const name = feature.description?.trim();
  if (feature.type === "chain") return name ? `Chain: ${name}` : "Chain";
  return name || (feature.type ? FEATURE_TYPE_LABEL[feature.type] : "Domain");
}

export function chainCoversFullLength(
  feature: Pick<UniProtFeature, "type" | "start" | "end">,
  length: number,
): boolean {
  return feature.type === "chain" && feature.start === 1 && feature.end === length;
}

export function featureConstruct(feature: {
  id: string;
  type?: UniProtFeatureType;
  start: number;
  end: number;
  description?: string;
}): Construct {
  return {
    kind: "domain",
    featureId: feature.id,
    start: feature.start,
    end: feature.end,
    label: `${featureChoiceName(feature)} (${feature.start}–${feature.end})`,
  };
}

export function domainConstruct(feature: {
  id: string;
  type?: UniProtFeatureType;
  start: number;
  end: number;
  description?: string;
}): Construct {
  return featureConstruct({ ...feature, type: feature.type ?? "domain" });
}

export function spanDomainConstruct(
  features: Array<{
    id: string;
    type?: UniProtFeatureType;
    start: number;
    end: number;
    description?: string;
  }>,
): Construct {
  if (features.length === 1) return featureConstruct(features[0]);
  const ordered = [...features].sort((a, b) => a.start - b.start || a.end - b.end);
  const start = ordered[0].start;
  const end = Math.max(...ordered.map((feature) => feature.end));
  const names = ordered.map((feature) => featureChoiceName(feature));
  return {
    kind: "domain",
    featureId: ordered.map((feature) => feature.id).join("+"),
    start,
    end,
    label: `${names.join(" + ")} (${start}–${end})`,
  };
}

export function selectableFeatures(
  protein: Pick<ProteinRecord, "features" | "length">,
): UniProtFeature[] {
  return protein.features.filter((feature) => {
    if (!SELECTABLE_FEATURE_TYPES.includes(feature.type)) return false;
    return !chainCoversFullLength(feature, protein.length);
  });
}

export function initialConstruct(protein: ProteinRecord): Construct {
  const chains = selectableFeatures(protein).filter((feature) => feature.type === "chain");
  if (chains.length === 1) return featureConstruct(chains[0]);
  return fullLengthConstruct(protein);
}

export function constructFromRange(
  protein: ProteinRecord,
  start: number,
  end: number,
  previous?: Construct,
): Construct {
  const lo = Math.max(1, Math.min(start, end));
  const hi = Math.min(protein.length, Math.max(start, end));
  if (lo === 1 && hi === protein.length) return fullLengthConstruct(protein);
  const selectable = selectableFeatures(protein);
  const exact = selectable.find((feature) => feature.start === lo && feature.end === hi);
  if (exact) return featureConstruct(exact);
  const domains = protein.features.filter((feature) => feature.type === "domain");
  const covering = domains.filter((domain) => domain.start >= lo && domain.end <= hi);
  if (covering.length > 0) {
    const span = spanDomainConstruct(covering);
    if (span.start === lo && span.end === hi) return span;
  }
  const keptIds = previous?.featureId?.split("+").filter(Boolean) ?? [];
  const kept = selectable.filter(
    (feature) => keptIds.includes(feature.id) && feature.start >= lo && feature.end <= hi,
  );
  if (kept.length > 0) {
    const names = kept.map((feature) => featureChoiceName(feature));
    return {
      kind: "domain",
      featureId: kept.map((domain) => domain.id).join("+"),
      start: lo,
      end: hi,
      label: `${names.join(" + ")} (${lo}–${hi})`,
    };
  }
  return {
    kind: "domain",
    start: lo,
    end: hi,
    label: `Custom construct (${lo}–${hi})`,
  };
}

export function constructFromDomainIds(
  protein: ProteinRecord,
  ids: string[],
): Construct {
  return constructFromFeatureIds(protein, ids);
}

export function constructFromFeatureIds(protein: ProteinRecord, ids: string[]): Construct {
  if (ids.length === 0) return fullLengthConstruct(protein);
  const selected = selectableFeatures(protein).filter((feature) => ids.includes(feature.id));
  if (selected.length === 0) return fullLengthConstruct(protein);
  const onlyDomains = selected.every((feature) => feature.type === "domain");
  if (onlyDomains) {
    const span = spanDomainConstruct(selected);
    const covering = protein.features.filter(
      (feature) =>
        feature.type === "domain" && feature.start >= span.start && feature.end <= span.end,
    );
    return spanDomainConstruct(covering.length > 0 ? covering : selected);
  }
  return spanDomainConstruct(selected);
}

export function referenceConstructLength(
  protein: Pick<ProteinRecord, "features" | "length">,
  construct: Construct,
): number {
  const ids = construct.featureId?.split("+").filter(Boolean) ?? [];
  const selected = protein.features.filter((feature) => ids.includes(feature.id));
  if (selected.length > 0) {
    const start = Math.min(...selected.map((feature) => feature.start));
    const end = Math.max(...selected.map((feature) => feature.end));
    return end - start + 1;
  }
  if (construct.kind === "full_length") return protein.length;
  return Math.max(1, construct.end - construct.start + 1);
}

export function terminalTrimForEdge(
  construct: { start: number; end: number },
  edge: "start" | "end",
  keptStart: number,
  keptEnd: number,
): Interval | undefined {
  if (edge === "start" && keptStart > construct.start) {
    return { start: construct.start, end: keptStart - 1 };
  }
  if (edge === "end" && keptEnd < construct.end) {
    return { start: keptEnd + 1, end: construct.end };
  }
  return undefined;
}

export function proposalBoundsAdjusted(
  original: Interval | undefined,
  current: Interval,
): boolean {
  return Boolean(original && (original.start !== current.start || original.end !== current.end));
}

function sourceAfterBoundary(
  edit: DeletionEdit | ReplacementEdit,
  clamped: Interval,
  originalProposal?: Interval,
): Edit["source"] {
  const linked = Boolean(edit.candidateId);
  if (originalProposal) {
    return proposalBoundsAdjusted(originalProposal, clamped) || !linked ? "user" : "automatic";
  }
  return linked ? edit.source : "user";
}

export function applyBoundaryToEdit(
  edit: DeletionEdit | ReplacementEdit,
  clamped: Interval,
  klass: CandidateClass,
  geometry: Candidate["internal"] | undefined,
  originalProposal?: Interval,
): DeletionEdit | ReplacementEdit {
  const linked = edit.candidateId;
  const source = sourceAfterBoundary(edit, clamped, originalProposal);
  if (klass === "internal") {
    const status =
      edit.status === "rejected"
        ? "rejected"
        : edit.type === "replacement" && edit.status === "pending"
          ? "pending"
          : "applied";
    const replacement: ReplacementEdit = {
      id: edit.id,
      type: "replacement",
      source,
      status,
      start: clamped.start,
      end: clamped.end,
      insertedSequence: geometry?.recommendedLinker ?? "",
      recommendedSequence: geometry?.recommendedLinker,
      anchorDistanceAngstrom: geometry?.distanceAngstrom,
      candidateId: linked,
    };
    return replacement;
  }
  if (edit.type === "replacement") {
    const deletion: DeletionEdit = {
      id: edit.id,
      type: "deletion",
      source,
      status: "applied",
      start: clamped.start,
      end: clamped.end,
      candidateId: linked,
    };
    return deletion;
  }
  return {
    ...edit,
    start: clamped.start,
    end: clamped.end,
    source,
    candidateId: linked,
  };
}
