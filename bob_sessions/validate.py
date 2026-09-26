import json

# ---- Load fixtures ----
with open('src/data/fixtures/graph.json') as f:
    graph = json.load(f)
with open('src/data/fixtures/impact-chg-012.json') as f:
    impact = json.load(f)
with open('src/data/fixtures/events-chg-012.json') as f:
    events = json.load(f)

node_ids = {n['id'] for n in graph['nodes']}

errors = []

# 1. Edge endpoints
bad_from = [e for e in graph['edges'] if e['from'] not in node_ids]
bad_to   = [e for e in graph['edges'] if e['to']   not in node_ids]
if bad_from:
    errors.append('Bad from-endpoints: ' + str([e['from'] for e in bad_from]))
if bad_to:
    errors.append('Bad to-endpoints: ' + str([e['to'] for e in bad_to]))

# 2. Event nodes
bad_ev = [ev for ev in events if ev.get('node') and ev['node'] not in node_ids]
if bad_ev:
    errors.append('Bad event nodes: ' + str([ev['node'] for ev in bad_ev]))

# 3. parentId
bad_parent = [n for n in graph['nodes'] if n.get('parentId') and n['parentId'] not in node_ids]
if bad_parent:
    errors.append('Bad parentIds: ' + str([n['id'] + '->' + n['parentId'] for n in bad_parent]))

# 4. Topological validity
node_wave = {}
for w in impact['waves']:
    for nid in w['nodeIds']:
        node_wave[nid] = w['wave']

violations = []
for e in graph['edges']:
    fw = node_wave.get(e['from'])
    tw = node_wave.get(e['to'])
    # In graph edges: `from` depends on `to`; so to.wave must be <= from.wave
    if fw is not None and tw is not None and tw > fw:
        violations.append(e['from'] + ' (w' + str(fw) + ') -> ' + e['to'] + ' (w' + str(tw) + ')')
if violations:
    errors.append('Topo violations: ' + str(violations))

# 5. Affected count
count = len(impact['affected'])
if count != 17:
    errors.append('Affected count: ' + str(count) + ' (expected 17)')

if errors:
    print('ERRORS:')
    for e in errors:
        print('  ' + e)
else:
    print('ALL OK')

print('Node count: ' + str(len(graph['nodes'])))
print('Edge count: ' + str(len(graph['edges'])))
print('Event count: ' + str(len(events)))
print('Affected: ' + str(count))
