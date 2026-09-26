// Shared types for the SystemDNA dashboard.
// They follow the PRD contracts: graph.json (section 7), the impact report
// (section 8) and the event schema (section 13).

/**
 * A district on the city map. Each repo defines its own layers.
 * Two ids have fixed meaning: "business" (read-only processes) and
 * "quality" (tests and docs, drawn as a row under the city).
 */
export type LayerId = string;

export interface LayerDef {
  id: LayerId;
  label: string;
  /** Column on the city map. -1 = the row under the city. */
  column: number;
  /** Edits here need a human approval (database, shared type contracts). */
  requiresApproval?: boolean;
  /** What the verify step checks for files in this layer. */
  check?: string;
}

export type NodeType =
  | "Table"
  | "Column"
  | "SQLModel"
  | "SparkJob"
  | "Module"
  | "Function"
  | "ORMModel"
  | "Schema"
  | "Field"
  | "Endpoint"
  | "TSType"
  | "TSField"
  | "Component"
  | "Dashboard"
  | "Dataset"
  | "Constant"
  | "Page"
  | "Test"
  | "Doc"
  | "BusinessProcess";

export type EdgeType =
  | "DERIVES_FROM"
  | "READS"
  | "WRITES"
  | "MAPS_TO"
  | "SERIALIZES"
  | "RETURNS"
  | "CONSUMES"
  | "TYPED_AS"
  | "IMPORTS"
  | "CALLS"
  | "TESTS"
  | "DOCUMENTS"
  | "SUPPORTS";

/** How to fix an edge when its upstream side changes. */
export type EdgeRule =
  | "rename_ref"
  | "keep_alias"
  | "update_type"
  | "update_doc"
  | "passthrough";

export type Confidence = "high" | "medium" | "low";

export interface GraphNode {
  id: string;
  type: NodeType;
  layer: LayerId;
  name: string;
  file: string;
  line?: number;
  /** Asset that holds this node (a column's table, a field's model). */
  parent?: string;
  owner?: string;
  pii: boolean;
  criticality: "low" | "medium" | "high";
  tested: boolean;
  /** Identifiers that appear as plain text in the file. Used by the grep comparison. */
  tokens?: string[];
}

/** An edge points downstream: `to` depends on `from`. */
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  source: "parser" | "bob";
  confidence: Confidence;
  evidence: string;
  rule: EdgeRule;
}

export interface Graph {
  repo: string;
  scannedAt: string;
  layers: LayerDef[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Word -> files that contain it as plain text. Used by the grep comparison. */
  textIndex?: Record<string, string[]>;
}

export type ChangeKind = "rename" | "type_change" | "delete";

export interface ChangeRequest {
  node: string;
  change: ChangeKind;
  to: string;
}

export type Severity = "breaking" | "needs_update" | "update" | "safe";

export interface ImpactItem {
  nodeId: string;
  severity: Severity;
  /** Longest path from the changed node. 0 = the changed node itself. */
  depth: number;
  risk: number;
  viaEdge?: string;
  confidence: Confidence;
  needsApproval: boolean;
}

/** One file that one agent will fix. `id` is the file path. */
export interface FixUnit {
  id: string;
  assetName: string;
  file: string;
  layer: LayerId;
  /** Map buildings (asset ids) that live in this file. */
  assets: string[];
  nodes: string[];
  wave: number;
  needsApproval: boolean;
  approvalReason?: string;
}

export interface ImpactReport {
  request: ChangeRequest;
  oldName: string;
  items: ImpactItem[];
  fixUnits: FixUnit[];
  waveCount: number;
  business: { nodeId: string; name: string; owner?: string; severity: Severity }[];
  /** File paths. */
  grep: { found: string[]; missed: string[]; falsePositives: string[] };
  /** Node ids grouped by depth, for the ripple animation. */
  levels: string[][];
  danglingRefs: number;
  computedMs: number;
}

export type RunEventType =
  | "impact_ready"
  | "awaiting_approval"
  | "approved"
  | "wave_started"
  | "agent_started"
  | "tool_call"
  | "blocked"
  | "check_passed"
  | "check_failed"
  | "retrying"
  | "done"
  | "quarantined"
  | "wave_completed"
  | "rescan"
  | "inspector"
  | "pr_created"
  | "change_completed";

export interface RunEvent {
  ts: string;
  change_id: string;
  event: RunEventType;
  agent_id?: string;
  session_id?: string;
  wave?: number;
  tool?: string;
  file?: string;
  /** Fix unit id (asset id). */
  node?: string;
  permit_ok?: boolean;
  detail?: string;
  bobcoins?: number;
  data?: Record<string, string | number | boolean>;
}

export type DataMode = "demo" | "live";

export interface Change {
  id: string;
  /** Graph.repo this change belongs to. */
  repo?: string;
  title: string;
  request: ChangeRequest;
  report: ImpactReport;
  createdAt: string;
  mode: DataMode;
  events: RunEvent[];
}
