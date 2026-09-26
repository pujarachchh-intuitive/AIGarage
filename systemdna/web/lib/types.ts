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

/** One file in the repo. The 3D city draws one building per file. */
export interface RepoFile {
  path: string;
  /** Top-level folder, or "root" for files at the top. */
  dir: string;
  /** Non-blank lines. */
  lines: number;
  language: string;
  /** Local files this file imports. */
  imports: string[];
}

export interface Graph {
  repo: string;
  scannedAt: string;
  layers: LayerDef[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Word -> files that contain it as plain text. Used by the grep comparison. */
  textIndex?: Record<string, string[]>;
  /** Per-file data from the scanner. Graphs without it get estimated files. */
  files?: RepoFile[];
}

/**
 * rename       give a symbol, field, table or column a new name (`to` = new name)
 * type_change  change the type of a field, column or constant (`to` = new type)
 * signature    change a function's parameters or return type (`to` = new signature)
 * delete       remove it; dependents must stop using it (`to` = "")
 * custom       anything else, described in plain words (`description`)
 */
export type ChangeKind = "rename" | "type_change" | "signature" | "delete" | "custom";

export interface ChangeRequest {
  node: string;
  change: ChangeKind;
  to: string;
  /** Free text: the change itself for "custom", extra instructions otherwise. */
  description?: string;
}

export type Severity = "breaking" | "needs_update" | "update" | "safe";

export interface ImpactItem {
  nodeId: string;
  severity: Severity;
  /**
   * Step in the fix order. 0 = the changed node. A node's step is one more than
   * the step of everything that reaches it; nodes in one loop share a step.
   */
  depth: number;
  /** 0 to 100. The sum of `factors`, capped. */
  risk: number;
  viaEdge?: string;
  /** The weakest link on the path from the change: a chain is only as sure as its weakest link. */
  confidence: Confidence;
  needsApproval: boolean;
  /** Why the risk is what it is, biggest first. */
  factors?: RiskFactor[];
  /** Node ids from the changed node to this one, along the strongest path. */
  path?: string[];
  /** How many affected links reach this node. More than one means it breaks in more than one way. */
  links?: number;
}

export interface RiskFactor {
  /** Short label, for example "Public API". */
  label: string;
  points: number;
  /** One plain sentence. */
  detail: string;
}

export type RiskLevel = "low" | "medium" | "high" | "critical";

/** The risk of the whole change. */
export interface RiskAssessment {
  /** 0 to 100. */
  score: number;
  level: RiskLevel;
  /** The main reasons for the score, biggest first. */
  drivers: RiskFactor[];
  /** What to do about it, most important first. */
  recommendations: string[];
  /** Affected components by how sure the engine is. */
  confidence: Record<Confidence, number>;
  /** Files that must change, by whether a test covers them. `known` is false when the repo has no tests at all. */
  coverage: { tested: number; untested: number; known: boolean };
  /** The riskiest affected components (node ids), riskiest first. */
  hotspots: string[];
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
  /** The risk of the whole change. Missing on reports made before it existed. */
  risk?: RiskAssessment;
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

export interface PullRequestRef {
  url: string;
  number: number;
  branch: string;
  base: string;
}

/** What the browser sends to run a change for real (app/api/changes/run). */
export interface ChangeRunRequest {
  url: string;
  ref?: string;
  change: Pick<Change, "id" | "title" | "request" | "report">;
  /** The node the change starts from. */
  origin: GraphNode;
  /** Per fix-unit file: why it is affected (link evidence), for the agents' tasks. */
  context: Record<string, string[]>;
}

export type RunStrategy = "compiler" | "bob";

/** The outcome of a real run, kept with the change. */
export interface ChangeRunResult {
  status: "running" | "done" | "failed";
  strategy?: RunStrategy;
  /** Latest status line while running. */
  step?: string;
  /** Stored diff on the server, used to open the PR without re-running. */
  patchId?: string;
  files: string[];
  diff: string;
  diffTruncated: boolean;
  review?: BobReview;
  /** New type errors left after the run. */
  remainingErrors?: { file: string; line: number; message: string }[];
  error?: string;
}

/** One line of the real-run stream. */
export type ChangeStreamLine =
  | { type: "event"; event: RunEvent }
  | { type: "status"; step: string; strategy?: RunStrategy }
  | { type: "review"; review: BobReview }
  | { type: "preview"; files: string[]; diff: string; diffTruncated: boolean; patchId?: string; remainingErrors: { file: string; line: number; message: string }[] }
  | { type: "error"; message: string };

export interface Change {
  id: string;
  /** Graph.repo this change belongs to. */
  repo?: string;
  /** A real pull request opened by the GitHub agent. */
  pullRequest?: PullRequestRef;
  /** The real run (compiler or Bob agents), when one ran. */
  run?: ChangeRunResult;
  title: string;
  request: ChangeRequest;
  report: ImpactReport;
  createdAt: string;
  mode: DataMode;
  events: RunEvent[];
}

/** Numbers from a scan, shown on the Repositories page. */
export interface RepoStats {
  codeFiles: number;
  files: number;
  lines: number;
  nodes: number;
  edges: number;
  imports: number;
  layers: number;
  truncated: boolean;
  ms: number;
  /** Links added by the IBM Bob Cartographer. Set only when Bob enrichment was asked for. */
  bobLinks?: number;
  /** Nodes Bob flagged as personal data. */
  bobPii?: number;
}

/** A repository a user connected (git URL or zip upload). */
export interface ConnectedRepo {
  id: string;
  name: string;
  source: "git" | "zip";
  url?: string;
  ref?: string;
  scannedAt: string;
  stats: RepoStats;
}

/** One line of the ingestion progress stream. */
export type IngestEvent =
  | { type: "progress"; step: string; detail: string; ms?: number }
  | { type: "done"; repo: ConnectedRepo }
  | { type: "error"; message: string };

/** The IBM Bob Inspector's review of a rename diff. */
export type BobReview =
  | {
      status: "done";
      verdict: "approved" | "changes_requested";
      summary: string;
      issues: { file: string; line?: number; message: string }[];
      bobcoins?: number;
      durationMs?: number;
    }
  | { status: "skipped"; reason: string };

/** Whether IBM Bob can run on the server. Never includes the key. */
export interface BobStatus {
  configured: boolean;
  cli: boolean;
  version?: string;
  ready: boolean;
  reason?: string;
}

/** One line of the GitHub agent stream. */
/** What the server can do on GitHub (from /api/github/status). Never holds a secret. */
export interface GithubStatus {
  configured: boolean;
  mode: "app" | "token" | "none";
  /** Personal token: the account's login. */
  login?: string;
  /** GitHub App: its name, slug and install page. */
  app?: { name: string; slug: string; installUrl: string };
  /** GitHub App, when asked about one repo: is the app installed there? */
  installed?: boolean;
  error?: string;
}

export type AgentEvent =
  | { type: "progress"; step: string; detail: string }
  | { type: "preview"; files: { file: string; count: number }[]; docs: { file: string; count: number }[]; locations: number; stringKeys: number; diff: string; diffTruncated: boolean }
  | { type: "review"; review: BobReview }
  | { type: "done"; dryRun: true }
  | { type: "done"; dryRun: false; pr: PullRequestRef }
  | { type: "error"; message: string; newErrors?: { file: string; line: number; message: string }[] };
