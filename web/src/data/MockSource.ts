/**
 * MockSource — implements DataSource entirely from local JSON fixtures.
 * Plays the event script on a configurable speed multiplier (0.5×–4×)
 * with pause/resume support.
 * No tokens, keys or real URLs anywhere.
 */

import type { DataSource, ReplayBundle } from './DataSource';
import type {
  Graph,
  GraphNode,
  NodeId,
  NodeDetail,
  ImpactReport,
  ChangeRequest,
  ChangeRecord,
  GraphDiff,
  Metrics,
  AgentEvent,
  GraphEdge,
} from '@/contracts/types';

import graphFixture from './fixtures/graph.json';
import impactFixture from './fixtures/impact-chg-012.json';
import eventsFixture from './fixtures/events-chg-012.json';

// ---------------------------------------------------------------------------
// Type casts — fixtures are untyped JSON, cast once here
// ---------------------------------------------------------------------------

const GRAPH = graphFixture as Graph;
const IMPACT = impactFixture as ImpactReport;
const EVENTS = eventsFixture as AgentEvent[];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findNode(id: NodeId): GraphNode | undefined {
  return GRAPH.nodes.find((n) => n.id === id);
}

function edgesFrom(id: NodeId): GraphEdge[] {
  return GRAPH.edges.filter((e) => e.from === id);
}

function edgesTo(id: NodeId): GraphEdge[] {
  return GRAPH.edges.filter((e) => e.to === id);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// MockSource
// ---------------------------------------------------------------------------

/**
 * Configuration for MockSource.
 * @param speedMultiplier — playback speed (0.5 = half speed, 4 = 4× speed).
 */
export interface MockSourceConfig {
  /** Playback speed multiplier. Must be between 0.5 and 4. Default: 1. */
  speedMultiplier?: number;
}

export class MockSource implements DataSource {
  private _speed: number;
  private _paused = false;
  private _listeners: Set<(event: AgentEvent) => void> = new Set();
  private _playbackHandle: ReturnType<typeof setTimeout> | null = null;
  private _playbackIndex = 0;
  private _changeRecords: Map<string, ChangeRecord> = new Map();

  constructor(config: MockSourceConfig = {}) {
    const raw = config.speedMultiplier ?? 1;
    this._speed = Math.min(4, Math.max(0.5, raw));
  }

  // ---- playback control ---------------------------------------------------

  /** Set playback speed multiplier (0.5–4). Takes effect immediately. */
  setSpeed(multiplier: number): void {
    this._speed = Math.min(4, Math.max(0.5, multiplier));
  }

  /** Pause event playback. */
  pause(): void {
    this._paused = true;
    this._clearTimer();
  }

  /** Resume event playback. */
  resume(): void {
    if (this._paused) {
      this._paused = false;
      this._scheduleNext();
    }
  }

  // ---- DataSource methods -------------------------------------------------

  async getGraph(): Promise<Graph> {
    await delay(20);
    return GRAPH;
  }

  async getNode(id: NodeId): Promise<NodeDetail> {
    await delay(20);
    const node = findNode(id);
    if (!node) throw new Error(`Node not found: ${id}`);
    const dependsOn = edgesFrom(id);
    const usedBy = edgesTo(id);
    const evidence = [
      ...dependsOn.map((e) => e.evidence),
      ...usedBy.map((e) => e.evidence),
    ];
    return { node, dependsOn, usedBy, evidence };
  }

  async createChange(req: ChangeRequest): Promise<ChangeRecord> {
    await delay(30);
    // Only the scripted chg-012 rename has a fixture impact report.
    const scripted = req.node === IMPACT.change.node;
    const id = scripted ? IMPACT.changeId : `chg-${Date.now()}`;
    const record: ChangeRecord = {
      id,
      status: 'pending',
      request: req,
      ...(scripted ? { impact: IMPACT } : {}),
    };
    this._changeRecords.set(id, record);
    return record;
  }

  async getChange(id: string): Promise<ChangeRecord> {
    await delay(10);
    // Fall back to the fixture change id for demo purposes
    const record = this._changeRecords.get(id);
    if (record) return record;
    if (id === 'chg-012') {
      return { id, status: 'done', request: IMPACT.change, impact: IMPACT };
    }
    throw new Error(`Change not found: ${id}`);
  }

  async approve(id: string, _nodeId?: NodeId): Promise<ChangeRecord> {
    await delay(10);
    const record = this._changeRecords.get(id) ?? { id, status: 'pending' as const, request: IMPACT.change };
    const updated: ChangeRecord = { ...record, status: 'pending' as const };
    this._changeRecords.set(id, updated);
    return updated;
  }

  async run(id: string): Promise<ChangeRecord> {
    await delay(10);
    const base = this._changeRecords.get(id) ?? { id, status: 'pending' as const, request: IMPACT.change };
    const running: ChangeRecord = { ...base, status: 'running' as const };
    this._changeRecords.set(id, running);
    this._playbackIndex = 0;
    this._paused = false;
    this._scheduleNext();
    return running;
  }

  async getDiff(_id: string): Promise<GraphDiff> {
    await delay(20);
    // Synthetic diff: the rename produced one removed and one added edge
    const removedEdge = GRAPH.edges.find(
      (e) => e.from === 'be:field:Order.cust_id' && e.type === 'MAPS_TO'
    );
    const addedEdge: GraphEdge = removedEdge
      ? { ...removedEdge, from: 'be:field:Order.customer_id' }
      : {
          from: 'be:field:Order.customer_id',
          to: 'db:column:orders.customer_id',
          type: 'MAPS_TO',
          origin: 'parser',
          confidence: 'high',
          evidence: { file: 'backend/models.py', line: 7 },
          rule: 'rename_ref',
        };
    return {
      removedEdges: removedEdge ? [removedEdge] : [],
      addedEdges: [addedEdge],
      danglingBefore: 16,
      danglingAfter: 0,
    };
  }

  async getMetrics(_id: string): Promise<Metrics> {
    await delay(20);
    const bobcoinsByAgent: Record<string, number> = {};
    for (const e of EVENTS) {
      if (e.bobcoins) {
        bobcoinsByAgent[e.agent_id] = round2((bobcoinsByAgent[e.agent_id] ?? 0) + e.bobcoins);
      }
    }
    const bobcoinsTotal = round2(Object.values(bobcoinsByAgent).reduce((a, b) => a + b, 0));
    const agents = new Set(EVENTS.filter((e) => e.agent_id !== 'orchestrator').map((e) => e.agent_id)).size;
    const retries = EVENTS.filter((e) => e.event === 'check_failed').length;
    const verify = EVENTS.find((e) => e.event === 'verify')?.data;
    const totalMs = new Date(EVENTS[EVENTS.length - 1].ts).getTime() - new Date(EVENTS[0].ts).getTime();

    const perWave = IMPACT.waves.map(({ wave }) => {
      const start = EVENTS.find((e) => e.event === 'wave_started' && e.wave === wave);
      const end = EVENTS.find((e) => e.event === 'wave_done' && e.wave === wave);
      const ms = start && end ? new Date(end.ts).getTime() - new Date(start.ts).getTime() : 0;
      return { wave, ms };
    });

    return {
      totalMs,
      perWave,
      // Serial estimate: every agent running one after another at ~34 s each.
      serialEstimateMs: agents * 34_000,
      waveTimeMs: perWave.reduce((a, w) => a + w.ms, 0),
      bobcoinsTotal,
      bobcoinsByAgent,
      agents,
      retries,
      testsPassed: verify?.tests_passed ?? 0,
      testsTotal: verify?.tests_total ?? 0,
    };
  }

  async getReplay(id: string): Promise<ReplayBundle> {
    await delay(30);
    if (id !== 'chg-012') throw new Error(`No replay for change: ${id}`);
    return { graph: GRAPH, events: EVENTS };
  }

  subscribe(onEvent: (event: AgentEvent) => void): () => void {
    this._listeners.add(onEvent);
    return () => {
      this._listeners.delete(onEvent);
    };
  }

  // ---- private playback ---------------------------------------------------

  private _clearTimer(): void {
    if (this._playbackHandle !== null) {
      clearTimeout(this._playbackHandle);
      this._playbackHandle = null;
    }
  }

  private _scheduleNext(): void {
    this._clearTimer();
    if (this._paused) return;
    if (this._playbackIndex >= EVENTS.length) return;

    const current = EVENTS[this._playbackIndex];
    const prev = EVENTS[this._playbackIndex - 1];
    const gapMs = prev
      ? Math.max(0, new Date(current.ts).getTime() - new Date(prev.ts).getTime())
      : 0;

    this._playbackHandle = setTimeout(() => {
      this._playbackHandle = null;
      this._emit(current);
      this._playbackIndex++;
      this._scheduleNext();
    }, gapMs / this._speed);
  }

  private _emit(event: AgentEvent): void {
    this._listeners.forEach((cb) => {
      try {
        cb(event);
      } catch {
        // listener errors must not crash the mock
      }
    });
  }
}
