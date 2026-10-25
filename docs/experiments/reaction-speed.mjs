// Research model only. The application does not import this scheduler.
// Run from the repository root:
// node --experimental-strip-types --import ./tests/loader.mjs docs/experiments/reaction-speed.mjs
import assert from 'node:assert/strict';
import { exampleWorld } from '../../src/lib/theater/fixtures.ts';
import { initialState } from '../../src/lib/theater/runtime.ts';
import { resolveTurn } from '../../src/lib/theater/ensemble.ts';

const threshold = 100;
const epsilon = 1e-9;
const approximately = (actual, expected) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
const roundTrip = value => JSON.parse(JSON.stringify(value));

function create(speeds) {
	return { clock: 0, actors: Object.fromEntries(Object.entries(speeds).map(([id, speed]) => [id, { speed, gauge: 0, awake: true }])), reservation: null };
}

function wake(state, id) {
	// A new event does not reset an already waiting actor's accumulated readiness.
	state.actors[id].awake = true;
}

function reserve(state) {
	if (state.reservation) return state.reservation;
	const awake = Object.entries(state.actors).filter(([, actor]) => actor.awake);
	if (!awake.length) return null;
	for (const [, actor] of awake) assert.ok(Number.isFinite(actor.speed) && actor.speed > 0);
	const elapsed = Math.min(...awake.map(([, actor]) => Math.max(0, threshold - actor.gauge) / actor.speed));
	state.clock += elapsed;
	for (const [, actor] of awake) actor.gauge = Math.min(threshold, actor.gauge + actor.speed * elapsed);
	const ready = awake.filter(([, actor]) => actor.gauge >= threshold - epsilon).sort(([left], [right]) => left.localeCompare(right, 'en'));
	assert.ok(ready.length);
	return state.reservation = { actorId: ready[0][0], clock: state.clock };
}

function commit(state, result = 'act') {
	assert.ok(state.reservation, 'a committed opportunity must have a reservation');
	const actor = state.actors[state.reservation.actorId];
	actor.gauge = Math.max(0, actor.gauge - threshold);
	actor.awake = result === 'act';
	state.reservation = null;
}

function simulateUntil(state, horizon) {
	const counts = Object.fromEntries(Object.keys(state.actors).map(id => [id, 0]));
	const order = [];
	for (;;) {
		const next = structuredClone(state);
		const slot = reserve(next);
		if (!slot || slot.clock > horizon + epsilon) break;
		counts[slot.actorId]++;
		order.push({ ...slot });
		commit(next);
		state = next;
	}
	return { counts, order, state };
}

async function existingQueueOrder() {
	const definition = exampleWorld();
	const world = { id: 'speed-research', revision: 0, definition, state: initialState(definition) };
	const order = [];
	const stop = new Error('bounded research sample finished');
	try {
		await resolveTurn(world, { kind: 'speak', text: '함께 이야기하자.', targetId: null }, {
			async reflect() { return { arousalUpdate: null, relationshipUpdates: [], memoUpdate: null }; },
			async decide(state) { order.push(state.self.id); return { act: true, model: 'research-stub' }; },
			async perform() { return { actionId: 'speak:player', targetId: 'player', narrative: null, utterance: `연구용 발언 ${order.length}`, memoUpdate: null, model: 'research-stub' }; }
		}, () => {}, { onProgress(_, progress) { if (progress.completedDecisions >= 20) throw stop; } });
	} catch (error) { if (error !== stop) throw error; }
	assert.equal(order.length, 20);
	assert.equal(order.filter(id => id === 'seoyeon').length, 10);
	assert.equal(order.filter(id => id === 'harin').length, 10);
	return order;
}

const baseline = await existingQueueOrder();
const weighted = simulateUntil(create({ A: 20, B: 5 }), 100);
assert.deepEqual(weighted.counts, { A: 20, B: 5 });
assert.deepEqual(weighted.order.slice(0, 5), [
	{ actorId: 'A', clock: 5 }, { actorId: 'A', clock: 10 },
	{ actorId: 'A', clock: 15 }, { actorId: 'A', clock: 20 }, { actorId: 'B', clock: 20 }
]);
assert.deepEqual(simulateUntil(create({ A: 10, B: 10 }), 100).counts, { A: 10, B: 10 });
assert.deepEqual(simulateUntil(create({ A: 1, B: 3, C: 7 }), 1000).counts, { A: 10, B: 30, C: 70 });

// Repeated events from a fast actor must not restart a slow actor's wait.
const eventful = create({ A: 20, B: 5 });
let firstSlow;
while (!firstSlow) {
	const slot = { ...reserve(eventful) };
	commit(eventful);
	if (slot.actorId === 'A') wake(eventful, 'B');
	else firstSlow = slot;
}
approximately(firstSlow.clock, 20);

// Changing speed preserves accumulated readiness: 50/100 at speed 20 needs 2.5 more units.
const changing = create({ A: 10, B: 5 });
assert.equal(reserve(changing).actorId, 'A');
commit(changing, 'wait');
approximately(changing.actors.B.gauge, 50);
changing.actors.B.speed = 20;
const accelerated = { ...reserve(changing) };
approximately(accelerated.clock, 12.5);
commit(changing, 'wait');
assert.equal(reserve(changing), null);

// Sleeping actors accrue no debt and do not repeatedly call a model without a new event.
const sleeping = create({ A: 20, B: 5 });
sleeping.actors.B.awake = false;
for (let index = 0; index < 12; index++) { reserve(sleeping); commit(sleeping); }
approximately(sleeping.actors.B.gauge, 0);
wake(sleeping, 'B');
approximately(sleeping.actors.B.gauge, 0);
const noEvents = create({ A: 20, B: 5 });
while (reserve(noEvents)) commit(noEvents, 'wait');
assert.equal(reserve(noEvents), null);

// JSON persistence and a retry keep the same opportunity without spending it twice.
const reserved = create({ A: 20, B: 5 });
reserve(reserved);
const persisted = roundTrip(reserved);
assert.deepEqual(reserve(persisted), reserved.reservation);
approximately(persisted.actors.A.gauge, threshold);
const resumed = roundTrip(persisted);
commit(resumed);
approximately(resumed.actors.A.gauge, 0);
assert.throws(() => commit(resumed));
assert.deepEqual(simulateUntil(resumed, 100).order, simulateUntil((() => {
	const uninterrupted = structuredClone(reserved); commit(uninterrupted); return uninterrupted;
})(), 100).order);

// New chat invalidates a proposal, but does not consume or erase the reserved readiness.
const interrupted = roundTrip(reserved);
interrupted.reservation = null;
wake(interrupted, 'B');
assert.deepEqual(reserve(interrupted), reserved.reservation);
approximately(interrupted.actors.A.gauge, threshold);

console.log(JSON.stringify({
	baseline: { opportunities: 20, seoyeon: 10, harin: 10, first: baseline.slice(0, 6) },
	proposed: { horizon: 100, counts: weighted.counts, first: weighted.order.slice(0, 10) },
	speedChange: { previousGauge: 50, speed: 20, nextOpportunity: accelerated.clock },
	checks: ['fixed ratios', 'equal speeds', 'three speeds', 'wake preserves progress', 'dynamic speed preserves progress', 'dormancy', 'quiescence', 'JSON reservation recovery', 'resume sequence', 'new chat cancellation'],
	scope: 'Deterministic in-memory research model; no LLM, database, UI or production scheduler changes.'
}, null, 2));
