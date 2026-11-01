import assert from 'node:assert/strict';
import { test } from 'node:test';
import { neutralWorldDefinition } from './fixtures.mjs';
import { initialState, observation } from '../src/lib/theater/runtime.ts';
import { resolveTurn } from '../src/lib/theater/ensemble.ts';
import { checkedExpression, isExactRepeat, performanceSchema } from '../src/lib/theater/performance.ts';
import { eventContent, eventParts } from '../src/lib/theater/event-content.ts';
import { memoryForEvent } from '../src/lib/theater/memory.ts';
import { validateState } from '../src/lib/theater/validation.ts';
import { generationHistoryEvents } from '../src/lib/theater/generation-history.ts';
import { identityReviewContext, performanceReviewContext } from '../src/lib/theater/inference-context.ts';

const speech = { id: 'speak:player', kind: 'speak', targetId: 'player', label: '말한다' };
const gesture = { id: 'act', kind: 'act', targetId: null, label: '몸짓을 한다' };
const mixed = [
	{ kind: 'act', text: '대본 모서리를 만지작거린다.' },
	{ kind: 'speak', text: '아직 시간은 있어요.' },
	{ kind: 'speak', text: '조금이지만요.' },
	{ kind: 'act', text: '벽시계를 올려다본다.' },
	{ kind: 'act', text: '숨을 고른다.' },
	{ kind: 'speak', text: '같이 기다려 주실래요?' }
];
const reflection = { arousalUpdate: null, relationshipUpdates: [], memoUpdate: null };
const proposal = (parts, action = speech) => ({ actionId: action.id, targetId: action.targetId, parts: structuredClone(parts), memoUpdate: null });
function world() {
	const definition = neutralWorldDefinition();
	const stage = { id: 'parts-world', revision: 0, definition, state: initialState(definition) };
	stage.state.instances.find(actor => actor.id === 'harin').active = false;
	return stage;
}
function director(performances) {
	let index = 0;
	return {
		async reflect() { return reflection; },
		async decide() { return { act: index < performances.length, inactivity: 'idle', model: 'fake' }; },
		async perform() { return { ...performances[index++], model: 'fake' }; }
	};
}

test('generation schema uses one to six independent ordered expression parts without paired fields', () => {
	const schema = performanceSchema([speech, gesture]);
	assert.deepEqual(schema.required, ['actionId', 'targetId', 'parts', 'memoUpdate']);
	assert.equal(schema.properties.parts.maxItems, 6);
	assert.equal(schema.properties.parts.minItems, 1);
	assert.equal(schema.properties.narrative, undefined);
	assert.equal(schema.properties.utterance, undefined);
	for (const parts of [mixed, mixed.slice(0, 2), [{ kind: 'speak', text: '안녕하세요.' }]]) {
		const expression = checkedExpression(proposal(parts), [speech]);
		assert.deepEqual(expression.parts, parts);
		assert.deepEqual(checkedExpression(expression, [speech]), expression, 'the normalized proposal is valid at execution too');
	}
	assert.deepEqual(checkedExpression(proposal(mixed.filter(part => part.kind === 'act'), gesture), [gesture]).parts, mixed.filter(part => part.kind === 'act'));
});

test('invalid or oversized expression arrays reject the entire proposal instead of truncating or inventing a partner', () => {
	for (const parts of [[], [...mixed, mixed[0]], null, [{ kind: 'other', text: '안녕' }], [{ kind: 'speak', text: ' ' }], [{ kind: 'speak', text: '안녕', actorId: 'player' }], [{ kind: 'act', text: '가'.repeat(2001) }, mixed[1]]]) {
		assert.throws(() => checkedExpression(proposal(parts), [speech]));
	}
	assert.throws(() => checkedExpression(proposal([{ kind: 'act', text: '고개를 끄덕인다.' }]), [speech]), /대사가 필요/);
	assert.throws(() => checkedExpression(proposal([{ kind: 'speak', text: '안녕' }], gesture), [gesture]), /말하기 행동에서만/);
	assert.throws(() => checkedExpression(proposal([{ kind: 'speak', text: '제 이름은 [플레이어 이름]입니다.' }]), [speech]), /자리표시자/);
	const normalized = checkedExpression(proposal(mixed), [speech]);
	assert.throws(() => checkedExpression({ ...normalized, utterance: '바꾼 요약' }, [speech]), /요약이 일치/);
});

test('all six parts publish as one action with the same order in observations, review, history and saved state', async () => {
	let saved;
	const result = await resolveTurn(world(), { kind: 'wait' }, director([proposal(mixed)]), () => {}, { onProgress: stage => { saved = structuredClone(stage); } });
	const events = result.state.events.filter(event => event.actorId === 'seoyeon');
	assert.equal(events.length, 1);
	assert.deepEqual(eventParts(events[0]), mixed);
	assert.equal(events[0].text, mixed.map(part => part.text).join('\n'));
	const witness = result.state.instances.find(actor => actor.id === 'seoyeon');
	assert.deepEqual(witness.memories.find(memory => memory.eventId === events[0].id).body.parts, mixed);
	assert.deepEqual(observation(result, witness).recentEvents.at(-1).body.parts, mixed);
	assert.deepEqual(generationHistoryEvents(result, witness.id).at(-1).body.parts, mixed);
	const expression = checkedExpression(proposal(mixed), [speech]);
	assert.deepEqual(identityReviewContext({ self: witness }, expression).proposal.parts, mixed);
	assert.deepEqual(performanceReviewContext(observation(result, witness), expression).proposal.parts, mixed);
	const restored = validateState(JSON.parse(JSON.stringify(saved.state)), saved.definition);
	assert.deepEqual(restored.events.at(-1).parts, mixed);
	assert.deepEqual(restored.instances.find(actor => actor.id === witness.id).memories.at(-1).body.parts, mixed);
	const invalid = structuredClone(saved.state); invalid.events.at(-1).parts.push(mixed[0]);
	assert.throws(() => validateState(invalid, saved.definition), /1~6/);
});

test('sequence order participates in repeat detection even when flattened action and dialogue summaries match', async () => {
	const reordered = [mixed[0], mixed[3], mixed[1], mixed[2], mixed[4], mixed[5]];
	const old = { ...memoryForEvent({ id: 'previous', tick: 1, sceneId: 'lobby', kind: 'speak', actorId: 'seoyeon', targetId: 'player', text: 'old', parts: mixed }) };
	const changed = checkedExpression(proposal(reordered), [speech]);
	assert.deepEqual(eventContent({ parts: mixed }), eventContent({ parts: reordered }));
	assert.equal(isExactRepeat(old, 'seoyeon', 'lobby', speech, changed), false);
	assert.equal(isExactRepeat(old, 'seoyeon', 'lobby', speech, checkedExpression(proposal(mixed), [speech])), true);
	const result = await resolveTurn(world(), { kind: 'wait' }, director([proposal(mixed), proposal(reordered), proposal(reordered)]));
	assert.equal(result.state.events.filter(event => event.actorId === 'seoyeon').length, 2);
});

test('silent six-part gestures do not start a player reply window and a multi-part interaction applies effects once', async () => {
	const parts = Array.from({ length: 6 }, (_, i) => ({ kind: 'act', text: `몸짓 ${i + 1}` }));
	let cursor;
	const silent = await resolveTurn(world(), { kind: 'wait' }, director([proposal(parts, gesture)]), () => {}, {
		playerReplyTimeoutMs: 300000, wait: async () => assert.fail('silent gestures must not wait for a reply'),
		onProgress: (_, progress) => { cursor = structuredClone(progress); }
	});
	assert.equal(silent.state.events.find(event => event.actorId === 'seoyeon').kind, 'act');
	assert.equal(cursor.playerReplyUntil, undefined);
	const ring = { id: 'interact:desk-bell:ring', kind: 'interact', targetId: 'desk-bell' };
	const result = await resolveTurn(world(), { kind: 'wait' }, director([proposal(parts, ring)]));
	assert.equal(result.state.events.filter(event => event.kind === 'interact').length, 1);
	assert.equal(result.state.events.filter(event => event.kind === 'change').length, 1);
	assert.equal(result.state.instances.find(actor => actor.id === 'desk-bell').state.rung, true);
});

test('a multi-part response to the player reserves one reply window after the complete expression', async () => {
	let now = 1000, saved, started = false;
	await resolveTurn(world(), { kind: 'wait' }, director([proposal(mixed)]), () => {}, {
		playerReplyTimeoutMs: 300000, now: () => now,
		onProgress: (stage, progress) => { saved = structuredClone({ stage, progress }); },
		wait: async ms => {
			started = true;
			assert.deepEqual(saved.stage.state.events.at(-1).parts, mixed);
			assert.equal(saved.progress.playerReplyUntil, 301000);
			now += ms;
		}
	});
	assert.equal(started, true);
	assert.equal(now, 301000);
});
