import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decisionRequest, decisionAnswer } from '../src/lib/server/decision-api.ts';
import { resolveTurn } from '../src/lib/theater/ensemble.ts';
import { initialState } from '../src/lib/theater/runtime.ts';
import { validateState } from '../src/lib/theater/validation.ts';
import { neutralWorldDefinition } from './fixtures.mjs';

test('Decision API converts finite choices and JSON evidence without losing authored descriptions', () => {
	const input = { model: 'gpt-6-luna', state: { observed: { actorId: 'player', light: false }, privateNote: 'synthetic' }, questions: { outfit: { type: 'choice', instructions: 'Choose an authored outfit.', criteria: { uniform: { name: '교복', appearance: '회색', context: '수업' }, casual: '휴일의 편한 옷' } } } };
	const before = structuredClone(input);
	assert.deepEqual(decisionRequest(input), { model: 'gpt-6-luna', input: JSON.stringify(input.state), questions: [{ name: 'outfit', type: 'choice', instructions: 'Choose an authored outfit.', choices: [{ value: 'uniform', description: JSON.stringify(input.questions.outfit.criteria.uniform) }, { value: 'casual', description: '휴일의 편한 옷' }] }] });
	assert.deepEqual(input, before);
	assert.throws(() => decisionRequest({ ...input, questions: { only: { ...input.questions.outfit, criteria: { one: 'only' } } } }), /2~255/);
	assert.throws(() => decisionRequest({ ...input, questions: { invalid: { type: 'noul' } } }), /choice/);
	assert.throws(() => decisionRequest({ ...input, questions: { outfit: { ...input.questions.outfit, criteria: Object.fromEntries(Array.from({ length: 27 }, (_, index) => [`choice-${index}`, '설명'])) } } }, 26), /2~26/);
});

test('Decision API binds reordered answers by name and rejects missing, duplicated or unrelated answers', () => {
	const a = { name: 'a', type: 'choice', choice: 'act' }, b = { name: 'b', type: 'choice', choice: 'idle' };
	assert.equal(decisionAnswer({ answers: [b, a] }, 'a', ['a', 'b']), a);
	for (const answers of [[], [a], [a, a], [a, { ...b, name: 'wrong' }], [{ ...a, name: null }, b], {}]) {
		assert.throws(() => decisionAnswer({ answers }, 'a', ['a', 'b']));
	}
	assert.equal(decisionAnswer({ answers: [{ name: 'a', type: 'refusal' }] }, 'a', ['a']).type, 'refusal', 'refusals must remain explicit for the caller');
});

test('decision protocol survives committed actions, silent choices and validated snapshots; legacy records keep their shape', async () => {
	for (const decisionApi of ['systemone', 'decision', undefined]) {
		const definition = neutralWorldDefinition(), stage = { id: 'api-history', revision: 0, definition, state: initialState(definition) };
		stage.state.instances.find(actor => actor.id === 'harin').active = false;
		let calls = 0;
		const result = await resolveTurn(stage, { kind: 'wait' }, {
			async reflect() { return { arousalUpdate: null, relationshipUpdates: [], memoUpdate: null }; },
			async decide() { return { act: ++calls === 1, inactivity: 'idle', model: 'choice-alias', ...(decisionApi ? { decisionApi } : {}) }; },
			async perform() { return { actionId: 'speak:player', targetId: 'player', narrative: null, utterance: '알겠어요.', memoUpdate: null, model: 'writer' }; }
		});
		const action = result.state.events.find(event => event.actorId === 'seoyeon');
		assert.equal(action.decision.decisionApi, decisionApi);
		assert.equal(result.state.instances.find(actor => actor.id === 'seoyeon').inactivity.decisionApi, decisionApi);
		const restored = validateState(JSON.parse(JSON.stringify(result.state)), definition);
		assert.deepEqual(restored, JSON.parse(JSON.stringify(result.state)));
		if (!decisionApi) assert.ok(!Object.hasOwn(restored.events.find(event => event.actorId === 'seoyeon').decision, 'decisionApi'));
		const forged = structuredClone(result.state);
		forged.events.find(event => event.actorId === 'seoyeon').decision.decisionApi = 'unknown';
		assert.throws(() => validateState(forged, definition), /API 유형/);
	}
});
