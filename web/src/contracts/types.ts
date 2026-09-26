/**
 * SystemDNA — Frontend data contracts.
 * All types are derived from the spec and must match the backend exactly.
 * No tokens, keys or real URLs anywhere.
 */

// ---------------------------------------------------------------------------
// A. Graph model
// ---------------------------------------------------------------------------

/** The seven horizontal layers of the city (left→right) plus the bottom row. */
export type Layer =
  | 'database'
  | 'pipelines'
  | 'backend'
  | 'api'
  | 'frontend'
  | 'dashboards'
  | 'business'
  | 'tests_docs';

/** Every node type across all layers (19 total). */
export type NodeType =
  // database
  | 'Table'
  | 'Column'
  // pipelines
  | 'SQLModel'
  | 'SparkJob'
  // backend
  | 'Module'
  | 'Class'
  | 'Function'
  | 'ORMModel'
  | 'Schema'
  | 'Field'
  // api
  | 'Endpoint'
  // frontend
  | 'TSType'
  | 'TSField'
  | 'Component'
  // dashboards
  | 'Dashboard'
  // tests_docs
  | 'Test'
  | 'Doc'
  // business
  | 'BusinessProcess'
  | 'Owner';

/** Layer-prefixes used in node ids. */
export type LayerPrefix = 'db' | 'pipe' | 'be' | 'api' | 'fe' | 'dash' | 'test' | 'doc' | 'biz';

/** Fully-qualified node id: `prefix:type:qualified_name` (all lowercase type). */
export type NodeId = string;

/** Importance level of a node. */
export type Criticality = 'low' | 'medium' | 'high';

/**
 * A single node in the knowledge graph.
 * Column-like nodes (Column, Field, TSField, Function) carry an optional parentId
 * pointing to their containing Table, ORMModel, Schema, TSType or Module.
 */
export interface GraphNode {
  /** Globally-unique id: `prefix:type:qualified_name`. */
  readonly id: NodeId;
  readonly type: NodeType;
  readonly layer: Layer;
  /** Human-readable short name. */
  readonly name: string;
  /** Source file path relative to repo root. */
  readonly file: string;
  /** Line number in that file (1-based). */
  readonly line: number;
  /** Owning team or person. */
  readonly owner: string;
  /** Whether this node carries PII. */
  readonly pii: boolean;
  readonly criticality: Criticality;
  /** Whether at least one test covers this node. */
  readonly tested: boolean;
  /** Parent node id for columns, fields and functions. */
  readonly parentId?: NodeId;
}

/** The 13 edge types connecting nodes. */
export type EdgeType =
  | 'DERIVES_FROM'   // column built from another column
  | 'READS'          // job or model reads a column/table
  | 'WRITES'         // job writes a table
  | 'MAPS_TO'        // ORM field → table column
  | 'SERIALIZES'     // API schema field from ORM field
  | 'RETURNS'        // endpoint returns schema
  | 'CONSUMES'       // frontend component calls endpoint
  | 'TYPED_AS'       // TS field matches API field
  | 'IMPORTS'        // Python import
  | 'CALLS'          // Python module/function link
  | 'TESTS'          // test covers a node
  | 'DOCUMENTS'      // doc covers a node
  | 'SUPPORTS';      // dashboard supports business process

/** Confidence level of an inferred edge. */
export type Confidence = 'high' | 'medium' | 'low';

/**
 * Fix rule that agents should apply when walking this edge.
 * rename_ref  — rewrite the literal reference
 * keep_alias  — keep the existing alias, no change needed
 * update_type — update the TypeScript type
 * update_doc  — update documentation
 */
export type Rule = 'rename_ref' | 'keep_alias' | 'update_type' | 'update_doc';

/** Evidence pointing to the exact location that produced an edge. */
export interface Evidence {
  readonly file: string;
  readonly line: number;
}

/**
 * A directed edge in the knowledge graph.
 * NOTE: the spec calls the `origin` field `source` in some places;
 * renamed here to `origin` to avoid collision with graph source/target —
 * confirm with backend before shipping.
 */
export interface GraphEdge {
  readonly from: NodeId;
  readonly to: NodeId;
  readonly type: EdgeType;
  /** How the edge was produced: static parser or Bob AI inference. */
  readonly origin: 'parser' | 'bob'; // spec calls this `source` — confirm with backend
  readonly confidence: Confidence;
  readonly evidence: Evidence;
  readonly rule: Rule;
}

/** Full knowledge graph: nodes + edges. */
export interface Graph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

// ---------------------------------------------------------------------------
// B. Impact report
// ---------------------------------------------------------------------------

/** A single change request targeting one node. */
export interface ChangeRequest {
  readonly node: NodeId;
  readonly change: 'rename';
  readonly to: string;
}

/** Severity classification of an affected node. */
export type Severity = 'breaking' | 'needs_update' | 'update' | 'safe';

/** One entry in the affected list of an impact report. */
export interface AffectedNode {
  readonly nodeId: NodeId;
  readonly layer: Layer;
  readonly severity: Severity;
  /** Risk score 0–100. */
  readonly risk: number;
  readonly evidence: Evidence;
  readonly confidence: Confidence;
  /** True when a medium-confidence (bob) edge means the result should be verified. */
  readonly checkThis: boolean;
  /** Wave number this node belongs to (1-based). */
  readonly wave?: number;
}

/** A business process downstream of the change. */
export interface AffectedBusinessProcess {
  readonly nodeId: NodeId;
  readonly name: string;
  readonly owner: string;
}

/** A topological wave of agents that can run in parallel. */
export interface Wave {
  readonly wave: number;
  readonly nodeIds: readonly NodeId[];
  readonly agentCount: number;
}

/** A node that requires human approval before its wave can proceed. */
export interface Approval {
  readonly nodeId: NodeId;
  readonly reason: 'database' | 'pii';
}

/** Result of a literal grep for the changed term. */
export interface GrepResult {
  readonly term: string;
  /** File globs the baseline grep ran over, e.g. "*.py, *.sql". */
  readonly scope?: string;
  readonly foundNodeIds: readonly NodeId[];
  readonly missed: readonly {
    readonly nodeId: NodeId;
    readonly reason: 'alias_chain' | 'dynamic_sql' | 'cross_language' | 'no_literal_reference';
  }[];
}

/** Full impact report for a change. */
export interface ImpactReport {
  readonly changeId: string;
  readonly change: ChangeRequest;
  /** Wall-clock milliseconds taken for analysis. */
  readonly analysisMs: number;
  readonly affected: readonly AffectedNode[];
  readonly businessProcesses: readonly AffectedBusinessProcess[];
  /** Topological waves — upstream first. */
  readonly waves: readonly Wave[];
  readonly approvals: readonly Approval[];
  readonly grep: GrepResult;
}

// ---------------------------------------------------------------------------
// C. Agent City states
// ---------------------------------------------------------------------------

/** All possible states for an individual AI agent. */
export type AgentState =
  | 'queued'
  | 'permitted'
  | 'awaiting_approval'
  | 'reading'
  | 'editing'
  | 'verifying'
  | 'retrying'
  | 'blocked'
  | 'quarantined'
  | 'done';

/** Visual state of a building (node) in Agent City. */
export type BuildingState =
  | 'healthy'
  | 'breaking_or_needs_update'
  | 'safe'
  | 'under_construction'
  | 'inspecting'
  | 'fixed'
  | 'needs_human';

// ---------------------------------------------------------------------------
// D. Events
// ---------------------------------------------------------------------------

/** Agent-level event kinds emitted by Bob hooks. */
export type AgentEventKind =
  | 'tool_call'
  | 'blocked'
  | 'approved'
  | 'check_passed'
  | 'check_failed'
  | 'done'
  | 'quarantined';

/**
 * Orchestrator-level event kinds.
 * NOTE: these are not yet confirmed by the backend — marked accordingly.
 */
export type OrchestratorEventKind = // needs backend confirmation
  | 'queued'
  | 'permitted'
  | 'awaiting_approval'
  | 'wave_started'
  | 'wave_done'
  | 'verify';

export type EventKind = AgentEventKind | OrchestratorEventKind;

/** Data payload carried by a `verify` orchestrator event. */
export interface VerifyData { // needs backend confirmation
  readonly dangling_before: number;
  readonly dangling_after: number;
  readonly tests_passed: number;
  readonly tests_total: number;
}

/**
 * A single event emitted during a change run.
 * Exact snake_case JSON shape required by the agent hooks.
 */
export interface AgentEvent {
  /** ISO-8601 timestamp. */
  readonly ts: string;
  readonly change_id: string;
  readonly agent_id: string;
  readonly session_id: string;
  readonly wave: number;
  readonly event: EventKind;
  readonly tool?: string;
  readonly file?: string;
  readonly node?: NodeId;
  readonly permit_ok?: boolean;
  readonly detail?: string;
  readonly bobcoins?: number;
  /** Optional typed data for orchestrator events such as `verify`. */
  readonly data?: VerifyData; // needs backend confirmation
}

// ---------------------------------------------------------------------------
// E. Governance and metrics
// ---------------------------------------------------------------------------

/** Immutable audit log entry for a single event. */
export interface AuditEntry {
  readonly time: string;
  readonly change_id: string;
  readonly agent_id: string;
  readonly wave: number;
  readonly event: EventKind;
  readonly tool?: string;
  readonly file?: string;
  readonly permit_ok?: boolean;
  readonly result?: string;
  readonly bobcoins?: number;
}

/** Per-wave timing breakdown. */
export interface WaveMetric {
  readonly wave: number;
  readonly ms: number;
}

/** Aggregate metrics for a completed change run. */
export interface Metrics {
  readonly totalMs: number;
  readonly perWave: readonly WaveMetric[];
  readonly serialEstimateMs: number;
  readonly waveTimeMs: number;
  readonly bobcoinsTotal: number;
  readonly bobcoinsByAgent: Readonly<Record<string, number>>;
  readonly agents: number;
  readonly retries: number;
  readonly testsPassed: number;
  readonly testsTotal: number;
}

/** Before/after snapshot of graph edges after a change is applied. */
export interface GraphDiff {
  readonly removedEdges: readonly GraphEdge[];
  readonly addedEdges: readonly GraphEdge[];
  readonly danglingBefore: number;
  readonly danglingAfter: number;
}

// ---------------------------------------------------------------------------
// F. REST API shapes (used by DataSource interface)
// ---------------------------------------------------------------------------

/** Envelope returned by GET /node/{id}. */
export interface NodeDetail {
  readonly node: GraphNode;
  readonly dependsOn: readonly GraphEdge[];
  readonly usedBy: readonly GraphEdge[];
  readonly evidence: readonly Evidence[];
}

/** Request body for POST /changes. */
export type CreateChangeRequest = ChangeRequest;

/** Minimal change record returned immediately after POST /changes. */
export interface ChangeRecord {
  readonly id: string;
  readonly status: 'pending' | 'running' | 'done' | 'failed';
  readonly request: ChangeRequest;
  /** Impact analysis computed at intake; present on POST /changes and GET /changes/{id}. */
  readonly impact?: ImpactReport;
}
