import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { aliasReference, getProviders, saveProvider, deleteProvider, resolveProviderModel, resolveProviderSnapshot, checkedProviderSnapshot } from '../src/lib/server/providers.ts';
import { createDirector, createEmbedder, createImageDirector, discoverProviderModels, getModelCatalog, refreshModelCatalog, modelSettings } from '../src/lib/server/oev.ts';

const defaults = { baseUrl: 'http://legacy.test/v1' };
function environment(t) {
	const directory = mkdtempSync(join(tmpdir(), 'newera-providers-'));
	const old = process.env.NEWERA_PROVIDER_CONFIG;
	const originalFetch = globalThis.fetch;
	process.env.NEWERA_PROVIDER_CONFIG = join(directory, 'providers.json');
	t.after(() => { globalThis.fetch = originalFetch; if (old === undefined) delete process.env.NEWERA_PROVIDER_CONFIG; else process.env.NEWERA_PROVIDER_CONFIG = old; rmSync(directory, { recursive: true, force: true }); });
	return directory;
}
const config = (id, kind = 'oev', extras = {}) => ({ id, label: id, kind, baseUrl: `http://${id}.test/v1`, apiKey: '', apiKeyEnv: '', models: [{ id: 'fast', label: '알아보기 쉬운 별칭', modelId: 'same-model', task: 'generation' }], ...extras });
function add(entry) { return saveProvider(defaults, getProviders(defaults).revision, entry); }
const selection = { decisionModel: 'one::fast', textModel: 'two::fast' };
function fakeProvider() {
	const calls = [];
	globalThis.fetch = async (url, init) => {
		const body = init.body ? JSON.parse(init.body) : undefined;
		calls.push({ url: String(url), body, headers: init.headers });
		const json = value => new Response(JSON.stringify(value));
		if (String(url).endsWith('/models')) return json({ data: [{ id: 'gemma4-26b', task: 'generation' }, { id: 'embeddinggemma2', task: 'embedding' }] });
		if (String(url).endsWith('/embeddings')) return json({ model: body.model, data: body.input.map((_, index) => ({ index, embedding: [1, 0] })) });
		if (body.questions) {
			if (Array.isArray(body.questions)) {
				return json({ model: body.model, answers: body.questions.map(question => ({ name: question.name, type: 'choice', choice: question.name === 'identity_check' ? 'consistent' : question.name === 'performance_check' ? 'accept' : question.name === 'inactivity' ? 'idle' : question.name === 'image_generation' ? 'skip' : question.name === 'outfit' ? question.choices[0].value : 'act' })), usage: { input_tokens: 12, output_tokens: 0, total_tokens: 12 } });
			}
			const key = Object.keys(body.questions)[0];
			return json({ answers: { [key]: { type: 'choice', choice: key === 'identity_check' ? 'consistent' : key === 'performance_check' ? 'accept' : 'act' } } });
		}
		const output = body.response_format?.json_schema?.name === 'character_reflection' ? { arousalUpdate: null, relationshipUpdates: [], memoUpdate: null } : { actionId: 'speak:player', targetId: 'player', narrative: null, utterance: '안녕.', memoUpdate: null };
		return json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] });
	};
	return calls;
}
const state = { self: { id: 'seo', name: '서우' }, present: [], recentEvents: [] };
const actions = [{ id: 'speak:player', targetId: 'player', kind: 'speak', label: '말한다' }];

test('legacy model IDs resolve to the existing default OEV and aliases disambiguate identical upstream IDs', (t) => {
	environment(t);
	assert.equal(getProviders(defaults).revision, 0);
	assert.equal(resolveProviderModel(defaults, 'gemma4-26b', 'decision').baseUrl, defaults.baseUrl);
	add(config('one')); add(config('two', 'openai-compatible'));
	const routes = resolveProviderSnapshot(defaults, selection);
	assert.equal(routes.decision.model, routes.text.model);
	assert.notEqual(routes.decision.baseUrl, routes.text.baseUrl);
	assert.throws(() => resolveProviderModel(defaults, 'two::fast', 'decision'), /OEV/);
	assert.throws(() => resolveProviderModel(defaults, 'one::missing', 'generation'), /별칭/);
	assert.throws(() => resolveProviderModel(defaults, 'missing::fast', 'generation'), /Provider/);
});

test('credentials stay server-only, blank edits retain keys, clear removes them, and stale saves are rejected', (t) => {
	const directory = environment(t);
	const view = add(config('one', 'oev', { apiKey: 'secret-one' }));
	assert.ok(!JSON.stringify(view).includes('secret-one'));
	assert.equal(view.providers.find(p => p.id === 'one').apiKeyConfigured, true);
	assert.ok(readFileSync(join(directory, 'providers.json'), 'utf8').includes('secret-one'));
	const publicProvider = view.providers.find(p => p.id === 'one');
	saveProvider(defaults, view.revision, { ...publicProvider, apiKey: '' });
	assert.equal(resolveProviderModel(defaults, 'one::fast', 'decision').apiKey, 'secret-one');
	assert.throws(() => saveProvider(defaults, view.revision, config('one')), /변경/);
	saveProvider(defaults, getProviders(defaults).revision, publicProvider, true);
	assert.equal(resolveProviderModel(defaults, 'one::fast', 'decision').apiKey, '');
});

test('validation and invalid reload preserve a working registry without returning malformed secret content', (t) => {
	const directory = environment(t);
	add(config('one'));
	for (const invalid of [
		{ baseUrl: 'https://username:password@example.com/v1' }, { baseUrl: 'https://example.com/v1?api_key=secret' },
		{ baseUrl: 'file:///etc/passwd' }, { models: [config('one').models[0], config('one').models[0]] },
		{ apiKeyEnv: 'BAD KEY' }, { apiKey: 'invalid\nheader' }
	]) assert.throws(() => add(config('bad', 'oev', invalid)));
	assert.equal(getProviders(defaults).providers.length, 2);
	writeFileSync(join(directory, 'providers.json'), '{"secret":"do-not-return-this');
	assert.equal(getProviders(defaults).providers.length, 2, 'bad file retains last working snapshot');
	assert.ok(!JSON.stringify(getProviders(defaults)).includes('do-not-return-this'));
});

test('generation and every typed review use separate configured providers, auth and actual model IDs', async (t) => {
	environment(t); add(config('one', 'oev', { apiKey: 'key-one' })); add(config('two', 'openai-compatible', { apiKey: 'key-two', outputTokenParameter: 'max_tokens' }));
	const calls = fakeProvider();
	const director = await createDirector(new AbortController().signal, selection);
	await director.decide(state); await director.perform(state, actions);
	await director.reflect(state, { newEvents: [{ eventId: 'a', actorId: 'player', body: { narrative: null, utterance: '안녕' } }], evidenceEvents: [], targets: [{ id: 'player', name: '플레이어' }] });
	assert.equal(calls.filter(c => c.url.endsWith('/systemone')).length, 3);
	assert.ok(calls.filter(c => c.body?.questions).every(c => c.url.startsWith('http://one.test/') && c.headers.authorization === 'Bearer key-one' && c.body.model === 'same-model'));
	const generated = calls.filter(c => c.url.endsWith('/chat/completions'));
	assert.equal(generated.length, 2);
	assert.ok(generated.every(c => c.url.startsWith('http://two.test/') && c.headers.authorization === 'Bearer key-two' && c.body.model === 'same-model'));
	assert.ok(generated.every(c => c.body.response_format.type === 'json_schema' && !('max_tokens' in c.body) && !('max_completion_tokens' in c.body) && !('reasoning_effort' in c.body) && !('temperature' in c.body)));
});

test('provider and alias edits affect new directors while pinned routes survive edits and deletion', async (t) => {
	environment(t); add(config('one')); add(config('two', 'openai-compatible', { apiKey: 'old-key' }));
	const pinned = resolveProviderSnapshot(defaults, selection);
	const calls = fakeProvider();
	const first = await createDirector(new AbortController().signal, selection);
	add(config('two', 'openai-compatible', { apiKey: 'new-key', baseUrl: 'http://new.test/v1', models: [{ id: 'fast', label: '이름만 바뀐 별칭', modelId: 'new-model', task: 'generation' }] }));
	const next = await createDirector(new AbortController().signal, selection);
	await first.perform(state, actions); await next.perform(state, actions);
	deleteProvider(defaults, getProviders(defaults).revision, 'two');
	const restarted = await createDirector(new AbortController().signal, selection, () => {}, pinned);
	await restarted.perform(state, actions);
	const generated = calls.filter(c => c.url.endsWith('/chat/completions'));
	assert.deepEqual(generated.map(c => c.body.model), ['same-model', 'new-model', 'same-model']);
	assert.deepEqual(generated.map(c => c.headers.authorization), ['Bearer old-key', 'Bearer new-key', 'Bearer old-key']);
	assert.throws(() => resolveProviderSnapshot(defaults, selection), /Provider/);
});

test('JSON object providers still receive schema guidance and host output validation', async (t) => {
	environment(t); add(config('one')); add(config('two', 'openai-compatible', { structuredOutput: 'json_object' }));
	const calls = fakeProvider(); const director = await createDirector(new AbortController().signal, selection);
	await director.perform(state, actions);
	const generated = calls.find(c => c.url.endsWith('/chat/completions'));
	assert.equal(generated.body.response_format.type, 'json_object');
	assert.match(generated.body.messages.at(-1).content, /actionId/);
	assert.ok(!('max_completion_tokens' in generated.body) && !('max_tokens' in generated.body));
});

test('embedding aliases use the embedding provider and validate its real model ID', async (t) => {
	environment(t); add(config('vectors', 'openai-compatible', { models: [{ id: 'memory', label: '기억 임베딩', modelId: 'actual-embedding', task: 'embedding' }] }));
	const calls = fakeProvider();
	const embed = createEmbedder({ ...modelSettings(), embeddingModel: 'vectors::memory', embeddingDimensions: 2 }, new AbortController().signal);
	assert.deepEqual(await embed(['교실 안내'], 'query'), [[1, 0]]);
	assert.equal(calls[0].body.model, 'actual-embedding');
	assert.ok(calls[0].url.startsWith('http://vectors.test/'));
	assert.ok(!('input_type' in calls[0].body));
	assert.throws(() => resolveProviderModel(defaults, 'vectors::memory', 'generation'), /용도/);
});

test('catalog labels configured aliases, excludes embeddings, and tolerates a failed default when aliases exist', async (t) => {
	environment(t); add(config('one')); add(config('two', 'openai-compatible'));
	add(config('vectors', 'oev', { models: [{ id: 'memory', label: '임베딩', modelId: 'embed', task: 'embedding' }] }));
	fakeProvider();
	const catalog = await getModelCatalog(new AbortController().signal);
	assert.ok(catalog.options.some(c => c.value === aliasReference('two', 'fast') && !c.decision));
	assert.ok(catalog.options.some(c => c.value === 'one::fast' && c.decision));
	assert.ok(!catalog.models.includes('vectors::memory'));
	assert.deepEqual((await discoverProviderModels('one', new AbortController().signal)).models, [{ id: 'gemma4-26b', task: 'generation' }, { id: 'embeddinggemma2', task: 'embedding' }]);
	globalThis.fetch = async () => new Response('{}', { status: 401 });
	const degraded = await getModelCatalog(new AbortController().signal);
	assert.equal(degraded.errors.length, 1);
	assert.ok(degraded.models.includes('two::fast'));
});

test('provider error bodies and logs never disclose the configured credential', async (t) => {
	environment(t); add(config('one', 'oev', { apiKey: 'super-secret' })); add(config('two', 'openai-compatible'));
	globalThis.fetch = async () => new Response('invalid super-secret', { status: 401 });
	const director = await createDirector(new AbortController().signal, selection);
	await assert.rejects(director.decide(state), error => !error.message.includes('super-secret') && error.message.includes('[redacted]'));
});

test('catalog refresh imports compatible server models, preserves authored aliases and works alongside failed providers', async (t) => {
	environment(t);
	add(config('geniex', 'openai-compatible', { decisionApi: 'decision', models: [{ id: 'custom', label: '내 판단 모델', modelId: 'judge', task: 'decision' }] }));
	add(config('offline', 'openai-compatible', { apiKey: 'private-key' }));
	globalThis.fetch = async url => {
		if (String(url).includes('offline.test')) return new Response('private-key', { status: 401 });
		if (String(url).includes('geniex.test')) return new Response(JSON.stringify({ data: [{ id: 'judge' }, { id: 'writer' }, { id: 'writer' }] }));
		return new Response(JSON.stringify({ data: [{ id: 'legacy', task: 'generation' }] }));
	};
	assert.ok(!(await getModelCatalog(AbortSignal.timeout(1000))).options.some(option => option.providerId === 'geniex' && option.modelId === 'writer'));
	const catalog = await refreshModelCatalog(AbortSignal.timeout(1000));
	const saved = getProviders(defaults).providers.find(provider => provider.id === 'geniex');
	assert.deepEqual(saved.models[0], { id: 'custom', label: '내 판단 모델', modelId: 'judge', task: 'decision' });
	assert.equal(saved.models.length, 2);
	const writer = catalog.options.find(option => option.providerId === 'geniex' && option.modelId === 'writer');
	assert.ok(writer.decision && writer.generation);
	assert.equal(resolveProviderModel(defaults, writer.value, 'generation').model, 'writer');
	assert.ok(catalog.errors.some(error => error.includes('offline')));
	assert.ok(!JSON.stringify(catalog).includes('private-key'));
	const revision = getProviders(defaults).revision;
	await refreshModelCatalog(AbortSignal.timeout(1000));
	assert.equal(getProviders(defaults).revision, revision);
	assert.deepEqual(getProviders(defaults).providers.find(provider => provider.id === 'geniex').models, saved.models);
});

test('catalog refresh never overwrites provider edits made while discovery is running', async (t) => {
	environment(t);
	add(config('geniex', 'openai-compatible', { models: [] }));
	let started, release;
	const pending = new Promise(done => { started = done; });
	const gate = new Promise(done => { release = done; });
	globalThis.fetch = async url => {
		if (String(url).includes('geniex.test')) { started(); await gate; }
		return new Response(JSON.stringify({ data: [{ id: 'old-server-model', task: 'generation' }] }));
	};
	const refreshing = refreshModelCatalog(AbortSignal.timeout(1000));
	await pending;
	add(config('geniex', 'openai-compatible', { baseUrl: 'http://new-server.test/v1', models: [] }));
	release();
	const catalog = await refreshing;
	assert.equal(getProviders(defaults).providers.find(provider => provider.id === 'geniex').models.length, 0);
	assert.ok(catalog.errors.some(error => error.includes('geniex') && error.includes('변경')));
});

function decisionProviders(t) {
	environment(t);
	add(config('judge', 'openai-compatible', { decisionApi: 'decision', apiKey: 'judge-key', models: [{ id: 'luna', label: 'Luna', modelId: 'gpt-6-luna', task: 'decision' }] }));
	add(config('writer', 'openai-compatible'));
	return { decisionModel: 'judge::luna', textModel: 'writer::fast' };
}

test('Luna and Geniex decision routes coexist with legacy System One and pin protocol and endpoint across provider edits', (t) => {
	const selection = decisionProviders(t);
	const pinned = resolveProviderSnapshot(defaults, selection);
	assert.equal(pinned.decision.decisionApi, 'decision');
	assert.equal(resolveProviderModel(defaults, 'gemma4-26b', 'decision').decisionApi, 'systemone');
	assert.throws(() => resolveProviderModel(defaults, 'judge::luna', 'generation'), /용도/);
	add(config('judge', 'openai-compatible', { decisionApi: 'systemone' }));
	assert.equal(resolveProviderModel(defaults, 'judge::fast', 'decision').decisionApi, 'systemone');
	assert.equal(checkedProviderSnapshot(JSON.parse(JSON.stringify(pinned))).decision.decisionApi, 'decision');
	const legacy = structuredClone(pinned);
	legacy.decision.kind = 'oev'; delete legacy.decision.decisionApi;
	assert.equal(checkedProviderSnapshot(legacy).decision.decisionApi, 'systemone');
	assert.throws(() => checkedProviderSnapshot({ ...pinned, decision: { ...pinned.decision, decisionApi: 'invalid' } }), /API 유형/);
});

test('Decision API routes participation, identity review, performance review and image checks through named choices', async (t) => {
	const selection = decisionProviders(t), calls = fakeProvider();
	const director = await createDirector(new AbortController().signal, selection);
	assert.deepEqual(await director.decide(state), { act: true, model: 'judge::luna', decisionApi: 'decision' });
	await director.perform(state, actions);
	assert.equal(await createImageDirector(selection, new AbortController().signal).shouldGenerate({ scene: 'Synthetic stage', gameTime: { day: 1, hour: 18, minute: 0, tick: 1 }, imageGeneration: { conditions: 'Only important scenes.', promptFormat: 'natural', promptInstructions: '' }, objectStates: [] }), false);
	const decisions = calls.filter(call => call.url.endsWith('/decisions'));
	assert.deepEqual(decisions.map(call => call.body.questions[0].name), ['participation', 'identity_check', 'performance_check', 'image_generation']);
	assert.ok(decisions.every(call => call.headers.authorization === 'Bearer judge-key' && call.body.model === 'gpt-6-luna' && typeof call.body.input === 'string' && !('state' in call.body)));
	assert.deepEqual(decisions[0].body.questions[0].choices.map(choice => choice.value), ['act', 'wait']);
	assert.ok(calls.some(call => call.url.startsWith('http://writer.test/') && call.url.endsWith('/chat/completions')));
	assert.ok(!calls.some(call => call.url.endsWith('/systemone')));
});

test('Decision API inactivity remains a separate question and a one-outfit wardrobe needs no unsupported one-choice request', async (t) => {
	const selection = decisionProviders(t), calls = fakeProvider(), original = globalThis.fetch;
	globalThis.fetch = async (url, init) => {
		const response = await original(url, init), body = JSON.parse(init.body);
		if (body.questions?.[0]?.name === 'participation') return new Response(JSON.stringify({ answers: [{ type: 'choice', name: 'participation', choice: 'wait' }] }));
		return response;
	};
	const director = await createDirector(new AbortController().signal, selection);
	assert.deepEqual(await director.decide(state), { act: false, inactivity: 'idle', model: 'judge::luna', decisionApi: 'decision' });
	assert.deepEqual(calls.map(call => call.body.questions[0].name), ['participation', 'inactivity']);
	const before = calls.length;
	assert.deepEqual(await director.chooseAppearance(state, [{ id: 'coat', name: '외투', appearance: '회색 외투', context: '추운 날' }]), { outfitId: 'coat', model: 'judge::luna', decisionApi: 'decision' });
	assert.equal(calls.length, before);
});

test('Decision API logs protocol and input usage without logging credentials or observation content', async (t) => {
	const selection = decisionProviders(t), logs = [];
	t.mock.method(console, 'info', message => { try { logs.push(JSON.parse(message)); } catch {} });
	fakeProvider();
	const director = await createDirector(new AbortController().signal, selection);
	await director.decide({ ...state, privateContext: 'private-observation-never-log' });
	const response = logs.find(log => log.event === '[OEV] HTTP 응답 수신');
	assert.equal(response.decisionApi, 'decision');
	assert.equal(response.question, 'participation');
	assert.equal(response.promptTokens, 12);
	assert.equal(response.completionTokens, 0);
	assert.ok(!JSON.stringify(logs).includes('judge-key'));
	assert.ok(!JSON.stringify(logs).includes('private-observation-never-log'));
});

test('Decision API refusal is terminal while invalid names, types and candidates cannot become actions', async (t) => {
	const selection = decisionProviders(t);
	const previousRetries = process.env.NEWERA_MAX_RETRIES;
	process.env.NEWERA_MAX_RETRIES = '0';
	t.after(() => { if (previousRetries === undefined) delete process.env.NEWERA_MAX_RETRIES; else process.env.NEWERA_MAX_RETRIES = previousRetries; });
	for (const answer of [{ type: 'refusal', name: 'participation' }, { type: 'choice', name: 'wrong', choice: 'act' }, { type: 'predicate', name: 'participation', probability: 1 }, { type: 'choice', name: 'participation', choice: 'invented' }]) {
		let calls = 0;
		globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ answers: [answer] })); };
		const director = await createDirector(new AbortController().signal, selection);
		await assert.rejects(director.decide(state));
		assert.equal(calls, 1);
	}
});

test('decision-only Luna aliases appear only among decision options and discovery recognizes the model purpose', async (t) => {
	decisionProviders(t); fakeProvider();
	const catalog = await getModelCatalog(new AbortController().signal);
	const luna = catalog.options.find(option => option.value === 'judge::luna');
	assert.equal(luna.decision, true);
	assert.equal(luna.generation, false);
	assert.equal(luna.decisionApi, 'decision');
	globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ id: 'gpt-6-luna' }] }));
	assert.deepEqual((await discoverProviderModels('judge', new AbortController().signal)).models, [{ id: 'gpt-6-luna', task: 'decision' }]);
});

test('native TypeSafe catalogs discover and persist decision-only aliases with either provider kind', async (t) => {
	environment(t);
	const calls = [];
	globalThis.fetch = async (url, init) => {
		calls.push({ url: String(url), authorization: init.headers.authorization });
		return new Response(JSON.stringify(String(url).includes('typesafe.test') ? {
			models: [{ name: 'jev-latest', description: 'Latest System One model', release_date: '2026-10-22T02:00:00+00:00' }, { name: 'jev-preview', description: 'Preview', release_date: '2026-10-14T20:14:00+00:00' }]
		} : { data: [{ id: 'legacy', task: 'generation' }] }));
	};
	for (const kind of ['oev', 'openai-compatible']) {
		add(config('typesafe', kind, { decisionApi: 'systemone', apiKey: 'typesafe-secret', models: [] }));
		assert.deepEqual((await discoverProviderModels('typesafe', AbortSignal.timeout(1000))).models, [{ id: 'jev-latest', task: 'decision' }, { id: 'jev-preview', task: 'decision' }]);
		const catalog = await refreshModelCatalog(AbortSignal.timeout(1000));
		const options = catalog.options.filter(option => option.providerId === 'typesafe');
		assert.equal(options.length, 2);
		assert.ok(options.every(option => option.decision && !option.generation && option.decisionApi === 'systemone'));
		assert.equal(resolveProviderModel(defaults, options[0].value, 'decision').model, 'jev-latest');
		assert.throws(() => resolveProviderModel(defaults, options[0].value, 'generation'), /용도/);
	}
	assert.ok(calls.filter(call => call.url.includes('typesafe.test')).every(call => call.url.endsWith('/v1/models') && call.authorization === 'Bearer typesafe-secret'));
});

test('native TypeSafe discovery rejects missing model names and malformed lists without saving aliases', async (t) => {
	environment(t);
	add(config('typesafe', 'openai-compatible', { decisionApi: 'systemone', models: [] }));
	for (const payload of [{ models: {} }, { models: [{ id: 'not-a-name' }] }, { models: [{ name: '' }] }, { models: [null] }]) {
		globalThis.fetch = async () => new Response(JSON.stringify(payload));
		await assert.rejects(discoverProviderModels('typesafe', AbortSignal.timeout(1000)));
		assert.deepEqual(getProviders(defaults).providers.find(provider => provider.id === 'typesafe').models, []);
	}
	globalThis.fetch = async () => new Response(JSON.stringify({ models: [] }));
	assert.deepEqual((await discoverProviderModels('typesafe', AbortSignal.timeout(1000))).models, []);
});
