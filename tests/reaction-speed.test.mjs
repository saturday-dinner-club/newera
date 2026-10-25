import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exampleWorld } from '../src/lib/theater/fixtures.ts';
import { beginTurn, initialState, observation } from '../src/lib/theater/runtime.ts';
import { resolveTurn, restoredProgress } from '../src/lib/theater/ensemble.ts';
import { consumeReaction, reactionSpeed, reserveReaction } from '../src/lib/theater/reaction-scheduler.ts';
import { applyReflection, reflectionContext } from '../src/lib/theater/reflection.ts';
import { checkedReflection, validateDefinition, validateState } from '../src/lib/theater/validation.ts';
import { participationContext, performanceContext, reflectionInput } from '../src/lib/theater/inference-context.ts';
import { reactionProfileFields, reactionStateFields } from '../src/lib/server/editor-input.ts';

const idleReflection = { relationshipUpdates: [], memoUpdate: null, arousalUpdate: null };
const actor = (world, id) => world.state.instances.find(entry => entry.id === id);
const template = (world, id) => world.definition.templates.find(entry => entry.id === actor(world, id).templateId);
const clone = value => JSON.parse(JSON.stringify(value));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
function world(fast = 20, slow = 5) {
	const definition = exampleWorld();
	const stage = { id: 'speed-test', revision: 0, definition, state: initialState(definition) };
	template(stage, 'seoyeon').reactionProfile = { baseSpeed: fast, talkativeness: 50 };
	template(stage, 'harin').reactionProfile = { baseSpeed: slow, talkativeness: 50 };
	return stage;
}
function progress() { return { pendingActorIds: ['seoyeon', 'harin'], completedDecisions: 0, consumedInputs: 0, scheduler: { version: 1, priorityActorId: null, reservation: null } }; }
function director(overrides = {}) {
	let sequence = 0;
	return {
		async reflect() { return idleReflection; },
		async decide() { return { act: true, model: 'test' }; },
		async perform() { return { actionId: 'speak:player', targetId: 'player', narrative: null, utterance: `서로 다른 발언 ${++sequence}`, memoUpdate: null, model: 'test' }; },
		...overrides
	};
}

test('real reaction loop allocates four times the opportunities at speed 20 versus 5 without resetting slow witnesses', async () => {
	for (const [fast, slow, expected] of [[20, 5, [20, 5]], [10, 10, [10, 10]], [3, 7, [3, 7]]]) {
		const counts = { seoyeon: 0, harin: 0 };
		const stop = new Error('sample complete');
		let saved;
		await assert.rejects(resolveTurn(world(fast, slow), { kind: 'wait' }, director({
			async decide(state) { counts[state.self.id]++; return { act: true, model: 'test' }; }
		}), () => {}, { onProgress(stage, cursor) {
			if (cursor.scheduler.reservation?.clock > 100 + 1e-8) throw stop;
			saved = clone(stage);
		} }), error => error === stop);
		assert.deepEqual(Object.values(counts), expected);
		assert.equal(saved.state.tick, 1);
		assert.equal(saved.state.minute, 1085, 'scheduling never advances in-game minutes');
		validateState(saved.state, saved.definition);
	}
});

test('fresh arousal is interpreted for slow candidates before selecting their next opportunity', async () => {
	const order = [];
	const stop = new Error('sample complete');
	await assert.rejects(resolveTurn(world(10, 5), { kind: 'wait' }, director({
		async reflect(state, context) {
			const speech = context.newEvents.find(event => event.actorId === 'seoyeon' && event.kind === 'speak');
			return state.self.id === 'harin' && speech ? { ...idleReflection, arousalUpdate: { value: 100, evidenceEventIds: [speech.eventId] } } : idleReflection;
		},
		async decide(state) { order.push(state.self.id); return { act: true, model: 'test' }; }
	}), () => {}, { onProgress(stage, cursor) {
		if (cursor.completedDecisions === 2) {
			near(stage.state.reactionClock, 15);
			assert.equal(actor(stage, 'harin').arousal, 100);
			throw stop;
		}
	} }), error => error === stop);
	assert.deepEqual(order, ['seoyeon', 'harin']);
});

test('speed changes preserve readiness, sleeping and offstage actors accrue nothing, and ties do not grant free turns', () => {
	const stage = world(10, 5), cursor = progress();
	assert.equal(reserveReaction(stage, cursor).actorId, 'seoyeon');
	consumeReaction(stage, cursor, 'seoyeon');
	cursor.pendingActorIds = ['harin'];
	near(actor(stage, 'harin').reactionGauge, 50);
	actor(stage, 'harin').arousal = 100;
	assert.equal(reserveReaction(stage, cursor).actorId, 'harin');
	near(stage.state.reactionClock, 15);
	near(actor(stage, 'seoyeon').reactionGauge, 0);
	near(actor(stage, 'jieun').reactionGauge, 0);
	consumeReaction(stage, cursor, 'harin');
	assert.throws(() => consumeReaction(stage, cursor, 'harin'), /예약/);
	cursor.pendingActorIds = [];
	assert.equal(reserveReaction(stage, cursor), null);
	const equal = world(10, 10), ties = progress();
	ties.scheduler.priorityActorId = 'harin';
	assert.equal(reserveReaction(equal, ties).actorId, 'harin');
	consumeReaction(equal, ties, 'harin');
	assert.equal(reserveReaction(equal, ties).actorId, 'seoyeon');
	near(equal.state.reactionClock, 10);
});

test('failed generation resumes a durable reservation and consumes readiness exactly once', async () => {
	let saved, cursor;
	const persist = (stage, position) => { saved = clone(stage); cursor = clone(position); };
	await assert.rejects(resolveTurn(world(), { kind: 'wait' }, director({ async perform() { throw new Error('offline'); } }), () => {}, { onProgress: persist }), /offline/);
	assert.equal(saved.state.reactionSequence, 0);
	assert.equal(actor(saved, 'seoyeon').reactionGauge, 100);
	assert.equal(cursor.scheduler.reservation.actorId, 'seoyeon');
	const originalClock = saved.state.reactionClock;
	const result = await resolveTurn(saved, { kind: 'wait' }, director({
		async decide() { return { act: false, inactivity: 'idle', model: 'test' }; }
	}), () => {}, { progress: restoredProgress(clone(cursor)), onProgress: persist });
	assert.equal(result.state.reactionSequence, 2);
	assert.equal(actor(result, 'seoyeon').reactionGauge, 0);
	assert.equal(result.state.events.length, 1, 'retry does not replay player input');
	assert.equal(originalClock, 5);
	assert.equal(result.state.reactionClock, 20);
	assert.equal(cursor.scheduler.reservation, null);
});

test('legacy active jobs keep FIFO order even when character speeds differ', async () => {
	const stage = world(); beginTurn(stage, { kind: 'wait' });
	const order = [];
	const result = await resolveTurn(stage, { kind: 'wait' }, director({
		async decide(state) { order.push(state.self.id); return { act: false, inactivity: 'idle', model: 'test' }; }
	}), () => {}, { progress: { pendingActorIds: ['harin', 'seoyeon'], completedDecisions: 0, consumedInputs: 0 } });
	assert.deepEqual(order, ['harin', 'seoyeon']);
	assert.equal(result.state.reactionSequence, 0);
});

test('chat during generation preserves reserved readiness without spending an obsolete proposal', async () => {
	const inputs = [];
	let reservedClock, retriedClock;
	let injected = false;
	const result = await resolveTurn(world(), { kind: 'wait' }, director({
		async decide(state) { return { act: !state.recentEvents.some(event => event.body.utterance === '잠깐.'), inactivity: 'idle', model: 'test' }; },
		async perform() {
			injected = true; inputs.push({ kind: 'speak', text: '잠깐.', targetId: null });
			return { actionId: 'speak:player', targetId: 'player', narrative: null, utterance: '버려야 하는 옛 제안', memoUpdate: null, model: 'test' };
		}
	}), () => {}, { nextInput: index => inputs[index] ?? null, onProgress(stage, cursor) {
		if (cursor.scheduler.reservation?.actorId === 'seoyeon') {
			if (injected) retriedClock = cursor.scheduler.reservation.clock;
			else reservedClock = cursor.scheduler.reservation.clock;
		}
	} });
	assert.equal(reservedClock, 5);
	assert.equal(retriedClock, 5, 'the interrupted opportunity is not charged a second interval');
	assert.equal(result.state.reactionSequence, 2, 'only the two final inactivity decisions consume opportunities');
	assert.equal(result.state.tick, 2);
	assert.equal(result.state.events.filter(event => event.actorId === 'player').length, 2);
	assert.ok(!result.state.events.some(event => event.utterance === '버려야 하는 옛 제안'));
});

test('arousal validates fresh witnessed evidence and remains private while profile and gauges survive saved state', () => {
	const stage = world(); beginTurn(stage, { kind: 'speak', text: '긴급 상황이야.', targetId: null });
	const harin = actor(stage, 'harin'), context = reflectionContext(stage, harin);
	const output = { ...idleReflection, arousalUpdate: { value: 80, evidenceEventIds: [context.newEvents[0].eventId] } };
	applyReflection(harin, output, context);
	assert.equal(reflectionContext(stage, harin), null);
	for (const value of [-1, 101, 1.5, NaN]) assert.throws(() => checkedReflection({ ...output, arousalUpdate: { ...output.arousalUpdate, value } }, context));
	assert.throws(() => checkedReflection({ ...output, arousalUpdate: { value: 80, evidenceEventIds: ['unseen'] } }, context), /근거/);
	const self = observation(stage, harin);
	assert.equal(participationContext(self).self.arousal, 80);
	assert.equal(performanceContext(self).self.arousal, 80);
	assert.equal(reflectionInput(self, context).self.arousal, 80);
	assert.ok(!observation(stage, actor(stage, 'seoyeon')).present.some(entry => 'arousal' in entry || 'reactionGauge' in entry));
	assert.equal(reactionSpeed(template(stage, 'harin'), harin), 9);
	const cursor = progress(); reserveReaction(stage, cursor);
	const restored = validateState(clone(stage.state), validateDefinition(clone(stage.definition)));
	assert.deepEqual(restored, clone(stage.state));
	const old = clone(stage.state);
	delete old.reactionClock; delete old.reactionSequence;
	for (const instance of old.instances) for (const key of ['arousal', 'arousalEvidenceEventIds', 'reactionGauge', 'lastOpportunitySequence']) delete instance[key];
	const compatible = validateState(old, stage.definition);
	assert.equal(compatible.reactionClock, 0);
	assert.equal(actor({ state: compatible }, 'harin').arousal, 0);
	for (const invalid of [Infinity, -1, 101]) {
		const changed = clone(stage.state); actor({ state: changed }, 'harin').reactionGauge = invalid;
		assert.throws(() => validateState(changed, stage.definition));
	}
});

test('editor fields preserve omission and reject invalid profile and arousal values', () => {
	const body = new FormData();
	assert.deepEqual(reactionProfileFields(body), {}); assert.deepEqual(reactionStateFields(body), {});
	body.set('reactionBaseSpeed', '20'); body.set('reactionTalkativeness', '50'); body.set('arousal', '70');
	assert.deepEqual(reactionProfileFields(body), { reactionProfile: { baseSpeed: 20, talkativeness: 50 } });
	assert.deepEqual(reactionStateFields(body), { arousal: 70 });
	body.set('arousal', ''); assert.throws(() => reactionStateFields(body));
	body.set('reactionBaseSpeed', '0'); assert.throws(() => reactionProfileFields(body));
});
