import { describe, it, expect, vi, afterEach } from 'vitest';
import { MockSource } from './MockSource';
import eventsFixture from './fixtures/events-chg-012.json';
import type { AgentEvent } from '@/contracts/types';

const events = eventsFixture as AgentEvent[];

afterEach(() => {
  vi.useRealTimers();
});

async function flushAll(src: MockSource) {
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  return src;
}

describe('MockSource', () => {
  it('createChange for orders.cust_id returns chg-012 with its impact report', async () => {
    const src = new MockSource();
    const rec = await src.createChange({ node: 'db:column:orders.cust_id', change: 'rename', to: 'customer_id' });
    expect(rec.id).toBe('chg-012');
    expect(rec.impact?.affected).toHaveLength(17);
  });

  it('run() plays every event exactly once, in order', async () => {
    vi.useFakeTimers();
    const src = new MockSource({ speedMultiplier: 4 });
    const seen: AgentEvent[] = [];
    src.subscribe((e) => seen.push(e));
    const running = src.run('chg-012');
    await flushAll(src);
    await running;
    expect(seen).toEqual(events);
  });

  it('pause and resume do not duplicate events', async () => {
    vi.useFakeTimers();
    const src = new MockSource({ speedMultiplier: 4 });
    const seen: AgentEvent[] = [];
    src.subscribe((e) => seen.push(e));
    const running = src.run('chg-012');
    await vi.advanceTimersByTimeAsync(5_000);
    src.pause();
    src.resume();
    src.pause();
    src.resume();
    await flushAll(src);
    await running;
    expect(seen).toEqual(events);
  });

  it('calling run() twice restarts playback instead of doubling it', async () => {
    vi.useFakeTimers();
    const src = new MockSource({ speedMultiplier: 4 });
    const seen: AgentEvent[] = [];
    src.subscribe((e) => seen.push(e));
    const first = src.run('chg-012');
    await vi.advanceTimersByTimeAsync(20);
    await first;
    seen.length = 0;
    const second = src.run('chg-012');
    await flushAll(src);
    await second;
    expect(seen).toEqual(events);
  });

  it('metrics bobcoins match the event script', async () => {
    const src = new MockSource();
    const m = await src.getMetrics('chg-012');
    const fromEvents = Math.round(events.reduce((a, e) => a + (e.bobcoins ?? 0), 0) * 100) / 100;
    expect(m.bobcoinsTotal).toBe(fromEvents);
    expect(m.agents).toBe(16);
    expect(m.retries).toBe(1);
    expect(m.testsPassed).toBe(m.testsTotal);
  });

  it('unsubscribe stops delivery', async () => {
    vi.useFakeTimers();
    const src = new MockSource({ speedMultiplier: 4 });
    const seen: AgentEvent[] = [];
    const off = src.subscribe((e) => seen.push(e));
    off();
    const running = src.run('chg-012');
    await flushAll(src);
    await running;
    expect(seen).toHaveLength(0);
  });
});
