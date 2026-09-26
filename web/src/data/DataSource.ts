/**
 * DataSource — abstract interface over the SystemDNA backend REST/WS API.
 * The live implementation will talk to the real server.
 * MockSource implements it from local fixtures.
 * No tokens, keys or real URLs anywhere.
 */

import type {
  Graph,
  NodeId,
  NodeDetail,
  ChangeRequest,
  ChangeRecord,
  GraphDiff,
  Metrics,
  AgentEvent,
} from '@/contracts/types';

// ---------------------------------------------------------------------------
// Replay bundle returned by getReplay
// ---------------------------------------------------------------------------

/** A replay bundle: the full graph snapshot + ordered event log. */
export interface ReplayBundle {
  readonly graph: Graph;
  readonly events: readonly AgentEvent[];
}

// ---------------------------------------------------------------------------
// DataSource interface
// ---------------------------------------------------------------------------

/**
 * All async methods are typed as returning Promises.
 * `subscribe` is the only callback-based method; it returns an unsubscribe function.
 */
export interface DataSource {
  /** GET /graph — full knowledge graph. */
  getGraph(): Promise<Graph>;

  /** GET /node/{id} — node with its edge context. */
  getNode(id: NodeId): Promise<NodeDetail>;

  /** POST /changes — submit a change request, returns a pending record. */
  createChange(req: ChangeRequest): Promise<ChangeRecord>;

  /** GET /changes/{id} — current status of a change. */
  getChange(id: string): Promise<ChangeRecord>;

  /** POST /changes/{id}/approve — approve a change (with optional nodeId for per-node approval). */
  approve(id: string, nodeId?: NodeId): Promise<ChangeRecord>;

  /** POST /changes/{id}/run — kick off the agent run for a change. */
  run(id: string): Promise<ChangeRecord>;

  /** GET /changes/{id}/diff — graph diff after a completed change. */
  getDiff(id: string): Promise<GraphDiff>;

  /** GET /changes/{id}/metrics — timing and cost metrics. */
  getMetrics(id: string): Promise<Metrics>;

  /** GET /replay/{id} — full replay bundle for a change. */
  getReplay(id: string): Promise<ReplayBundle>;

  /**
   * WS /ws — subscribe to live agent events.
   * Returns an unsubscribe function; call it to stop receiving events.
   */
  subscribe(onEvent: (event: AgentEvent) => void): () => void;
}
