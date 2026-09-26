/**
 * fixtures.test.ts — vitest suite validating the SystemDNA fixture files.
 *
 * Checks:
 * 1. Every edge endpoint (from / to) exists in the node list.
 * 2. Every event's node id exists in the node list.
 * 3. Every parentId on a node points to an existing node.
 * 4. Waves are topologically valid: no node depends (via edges) on a node in a later wave.
 * 5. The impact report has exactly 17 affected nodes.
 */

import { describe, it, expect } from 'vitest';
import graphFixture from './fixtures/graph.json';
import impactFixture from './fixtures/impact-chg-012.json';
import eventsFixture from './fixtures/events-chg-012.json';
import type { Graph, ImpactReport, AgentEvent } from '@/contracts/types';

const graph = graphFixture as Graph;
const impact = impactFixture as ImpactReport;
const events = eventsFixture as AgentEvent[];

// Build lookup sets for quick membership checks
const nodeIds = new Set(graph.nodes.map((n) => n.id));

// ---------------------------------------------------------------------------
// 1. Every edge endpoint exists
// ---------------------------------------------------------------------------

describe('graph edges', () => {
  it('every edge "from" node exists', () => {
    const missing = graph.edges
      .filter((e) => !nodeIds.has(e.from))
      .map((e) => `${e.from} → ${e.to} (${e.type})`);
    expect(missing, `Missing "from" nodes:\n${missing.join('\n')}`).toHaveLength(0);
  });

  it('every edge "to" node exists', () => {
    const missing = graph.edges
      .filter((e) => !nodeIds.has(e.to))
      .map((e) => `${e.from} → ${e.to} (${e.type})`);
    expect(missing, `Missing "to" nodes:\n${missing.join('\n')}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Every event node exists
// ---------------------------------------------------------------------------

describe('events', () => {
  it('every event node id exists in the graph', () => {
    const missing = events
      .filter((ev) => ev.node !== undefined && !nodeIds.has(ev.node!))
      .map((ev) => `${ev.agent_id} / ${ev.event}: node="${ev.node}"`);
    expect(missing, `Missing event nodes:\n${missing.join('\n')}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Every parentId exists
// ---------------------------------------------------------------------------

describe('parentId references', () => {
  it('every node parentId points to an existing node', () => {
    const missing = graph.nodes
      .filter((n) => n.parentId !== undefined && !nodeIds.has(n.parentId!))
      .map((n) => `${n.id} → parentId: ${n.parentId}`);
    expect(missing, `Missing parentId nodes:\n${missing.join('\n')}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Waves are topologically valid
// ---------------------------------------------------------------------------

describe('impact report waves', () => {
  it('no node in wave N depends (via edges) on a node in a later wave', () => {
    // Build a map: nodeId → wave number
    const nodeWave = new Map<string, number>();
    for (const waveEntry of impact.waves) {
      for (const nodeId of waveEntry.nodeIds) {
        nodeWave.set(nodeId, waveEntry.wave);
      }
    }

    const violations: string[] = [];

    for (const edge of graph.edges) {
      const fromWave = nodeWave.get(edge.from);
      const toWave = nodeWave.get(edge.to);

      // Only check edges where both endpoints are in a wave.
      // In the SystemDNA graph, edges represent data/dependency flow:
      //   `from` = the node that reads/uses/depends on
      //   `to`   = the node being read/used (the upstream dependency)
      // Correct ordering: the dependency (`to`) must be fixed in the same
      // wave or an EARLIER wave than the dependent (`from`).
      // Violation: `to.wave > from.wave` (dependency scheduled after its consumer).
      if (fromWave !== undefined && toWave !== undefined) {
        if (toWave > fromWave) {
          violations.push(
            `Edge ${edge.from} (wave ${fromWave}) → ${edge.to} (wave ${toWave}): ` +
              `dependency in later wave than its consumer`
          );
        }
      }
    }

    expect(violations, `Topological violations:\n${violations.join('\n')}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Impact report has exactly 17 affected nodes
// ---------------------------------------------------------------------------

describe('impact report', () => {
  it('has exactly 17 affected nodes', () => {
    expect(impact.affected).toHaveLength(17);
  });

  it('every affected, wave, approval and grep node exists in the graph', () => {
    const referenced = [
      ...impact.affected.map((a) => a.nodeId),
      ...impact.waves.flatMap((w) => w.nodeIds),
      ...impact.approvals.map((a) => a.nodeId),
      ...impact.businessProcesses.map((b) => b.nodeId),
      ...impact.grep.foundNodeIds,
      ...impact.grep.missed.map((m) => m.nodeId),
    ];
    expect(referenced.filter((id) => !nodeIds.has(id))).toEqual([]);
  });

  it('grep found and missed lists do not overlap, and grep finds about half', () => {
    const found = new Set(impact.grep.foundNodeIds);
    expect(impact.grep.missed.filter((m) => found.has(m.nodeId))).toEqual([]);
    expect(found.size).toBeGreaterThanOrEqual(6);
    expect(found.size).toBeLessThanOrEqual(11);
    const reasons = new Set(impact.grep.missed.map((m) => m.reason));
    expect(reasons).toEqual(new Set(['alias_chain', 'dynamic_sql', 'cross_language', 'no_literal_reference']));
  });

  it('wave agentCount matches its node list', () => {
    for (const w of impact.waves) expect(w.agentCount).toBe(w.nodeIds.length);
  });
});

describe('event script', () => {
  it('is sorted by timestamp', () => {
    const ts = events.map((e) => e.ts);
    expect(ts).toEqual([...ts].sort());
  });

  it('has exactly one blocked event: fix-export_job on backend/routes.py', () => {
    const blocked = events.filter((e) => e.event === 'blocked');
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({ agent_id: 'fix-export_job', file: 'backend/routes.py', permit_ok: false });
  });

  it('every agent finishes and the final verify reports 0 dangling references', () => {
    const agents = new Set(events.filter((e) => e.agent_id !== 'orchestrator').map((e) => e.agent_id));
    const done = new Set(events.filter((e) => e.event === 'done').map((e) => e.agent_id));
    expect(done).toEqual(agents);
    const verify = events[events.length - 1];
    expect(verify.event).toBe('verify');
    expect(verify.data?.dangling_after).toBe(0);
  });

  it('total bobcoins stays under 20', () => {
    expect(events.reduce((a, e) => a + (e.bobcoins ?? 0), 0)).toBeLessThan(20);
  });
});
