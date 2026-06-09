export type DiscoveryConfidence = "high" | "medium" | "low";
export type DiscoverySource = "agents_guidance" | "discovered_cache" | "ci" | "manifest" | "docs" | "heuristic";

export type DiscoveryCommands = {
  install?: string | null;
  test?: string | null;
  typecheck?: string | null;
  lint?: string | null;
};

export type DiscoveryEvidence = {
  source: string;
  detail: string;
};

export type DiscoveryResult = {
  commands: DiscoveryCommands;
  confidence: DiscoveryConfidence;
  evidence: DiscoveryEvidence[];
  source: DiscoverySource;
  shouldWriteDiscoveredFile: boolean;
};

export function shouldWriteDiscoveredFile(result: Pick<DiscoveryResult, "confidence">, validationPassed: boolean): boolean {
  return validationPassed && result.confidence === "high";
}

