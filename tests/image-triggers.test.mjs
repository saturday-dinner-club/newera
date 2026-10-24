import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exampleWorld } from '../src/lib/theater/fixtures.ts';
import { initialState } from '../src/lib/theater/runtime.ts';
import { validateDefinition } from '../src/lib/theater/validation.ts';
import { imageSceneSnapshot, imageGenerationPolicy } from '../src/lib/images/triggers.ts';
import { buildBundle } from '../skills/newera-lore-authoring/scripts/lore-format.mjs';
import { withInferenceLogContext } from '../src/lib/server/inference-log.ts';

const directory = mkdtempSync(join(tmpdir(), 'newera-lore-images-'));
process.env.NEWERA_DATA_DIR = directory;
process.env.NEWERA_LORE_IMAGE_KEY = 'private-lore-image-key';
const stage = await import('../src/lib/server/stage-store.ts');
const presets = await import('../src/lib/server/images/presets.ts');
const images = await import('../src/lib/server/images/trigger-store.ts');
const { processImageCheck } = await import('../src/lib/server/images/trigger-worker.ts');
const nativeFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = nativeFetch; });
test.after(() => { stage.store().close(); rmSync(directory, { recursive: true, force: true }); });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const config = { provider: 'openai', baseUrl: 'https://images.example.test/v1', apiKeyEnv: 'NEWERA_LORE_IMAGE_KEY', model: 'image-model', options: {}, stylePrompt: 'Watercolor.' };
const preset = presets.saveImagePreset({ revision: 0, name: 'Unchanged image preset', config });
const policy = (extra = {}) => ({ conditions: '새 장소나 중요한 만남이 생기거나 게임 내 시각이 18시 이후인 장면을 삽화로 그린다.', promptFormat: 'natural', promptInstructions: '영어로 현재 차림과 표정을 묘사한다.', ...extra });
const createWorld = (imageGeneration = policy()) => {
	const definition = { ...exampleWorld(), imageGeneration };
	const id = stage.importWorld(JSON.stringify({ format: 'newera-theater', version: 2, world: { definition }, saves: [] }));
	stage.setWorldImagePreset(id, preset.id); stage.setWorldModels(id, { decisionModel: 'judge-model', textModel: 'writer-model' });
	assert.equal(images.queueImageCheck(id), null, 'selection/lore edits establish a baseline without generating');
	return id;
};
const advance = (id, minutes = 5, operation = () => {}) => stage.editWorld(id, stage.getWorld(id).revision, world => { world.state.minute += minutes; world.state.day += Math.floor(world.state.minute / 1440); world.state.minute %= 1440; world.state.tick++; operation(world); });
const queue = (id) => { const jobId = images.queueImageCheck(id); assert.ok(jobId); const row = stage.store().prepare('SELECT * FROM theater_illustrations WHERE id=?').get(jobId); return { id: jobId, worldId: id, settingsRevision: row.settings_revision, input: JSON.parse(row.input_json) }; };
const choice = (value = 'generate') => ({ answers: { image_generation: { type: 'choice', choice: value } } });
const completion = value => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] });
function mockPipeline({ decision = 'generate', prompt = 'A quiet theater entrance after rain.', imageStatus = 200 } = {}) {
	const calls = [];
	globalThis.fetch = async (url, init) => {
		const body = JSON.parse(init.body); calls.push({ path: new URL(url).pathname, body });
		if (String(url).endsWith('/systemone')) return Response.json(choice(decision));
		if (String(url).endsWith('/chat/completions')) return Response.json(completion({ prompt }));
		return imageStatus === 200 ? Response.json({ data: [{ b64_json: png.toString('base64') }] }) : new Response('private-lore-image-key', { status: imageStatus });
	};
	return calls;
}

test('lorebook image conditions and prompt format validate, round-trip through authoring, export, slots and import', () => {
	assert.equal(validateDefinition(exampleWorld()).imageGeneration, undefined, 'old version 2 lorebooks stay valid');
	for (const imageGeneration of [policy({ promptFormat: 'other' }), policy({ conditions: 'x'.repeat(8001) }), policy({ promptInstructions: 'x'.repeat(4001) }), { ...policy(), apiKey: 'no' }]) assert.throws(() => validateDefinition({ ...exampleWorld(), imageGeneration }));
	const bundle = buildBundle({ format: 'newera-theater-source', version: 2, definition: { ...exampleWorld(), imageGeneration: policy({ promptFormat: 'tags' }) } });
	assert.equal(bundle.world.definition.imageGeneration.promptFormat, 'tags');
	const id = createWorld(policy({ promptFormat: 'tags' })); stage.saveWorld(id, 1);
	stage.editWorld(id, stage.getWorld(id).revision, world => { world.definition.imageGeneration.conditions = ''; });
	stage.loadWorld(id, stage.getWorld(id).revision, 1); assert.equal(stage.getWorld(id).definition.imageGeneration.conditions, policy().conditions);
	const exported = stage.exportWorld(id); assert.ok(exported.includes('promptInstructions')); assert.ok(!exported.includes(preset.id));
	const imported = stage.importWorld(exported); assert.deepEqual(stage.getWorld(imported).definition.imageGeneration, policy({ promptFormat: 'tags' })); assert.equal(stage.getWorld(imported).imagePresetId, null);
});

test('blank lore conditions and no image selection do no inference; old session rules are ignored', () => {
	globalThis.fetch = async () => assert.fail('must not fetch');
	const id = createWorld(policy({ conditions: '' }));
	stage.store().prepare('UPDATE theater_image_settings SET config_json=? WHERE world_id=?').run(JSON.stringify({ enabled: true, rules: [{ when: 'interval', minutes: 1 }] }), id);
	advance(id); assert.equal(images.queueImageCheck(id), null);
	assert.deepEqual(presets.getImagePreset(preset.id).config, config, 'preset settings are preserved');
	stage.setWorldImagePreset(id, null); assert.equal(images.queueImageCheck(id), null);
});

test('public prompt context excludes private character state while System One can inspect visible object state', () => {
	const definition = exampleWorld(); const world = { id: 'privacy', revision: 0, definition, state: initialState(definition) };
	const character = world.state.instances.find(entity => definition.templates.find(template => template.id === entity.templateId).kind === 'character');
	character.state.secret = 'private-state'; character.memo = { summary: 'private-memo' }; character.memories = [{ text: 'private-memory' }];
	const scene = imageSceneSnapshot(world);
	for (const marker of ['private-state', 'private-memo', 'private-memory']) assert.ok(!JSON.stringify(scene).includes(marker));
	assert.ok(!scene.context.includes('objectStates')); assert.deepEqual(imageGenerationPolicy({ ...world, definition: exampleWorld() }), { conditions: '', promptFormat: 'natural', promptInstructions: '' });
});

test('System One skip performs neither prompt generation nor image API requests and is not reevaluated on refresh', async () => {
	const calls = mockPipeline({ decision: 'skip' }); const id = createWorld(); advance(id);
	await processImageCheck(queue(id));
	assert.deepEqual(calls.map(call => call.path), ['/v1/systemone']); assert.equal(calls[0].body.model, 'judge-model');
	assert.equal(calls[0].body.questions.image_generation.type, 'choice'); assert.deepEqual(Object.keys(calls[0].body.questions.image_generation.criteria), ['generate', 'skip']);
	assert.equal(calls[0].body.state.imageGeneration.conditions, policy().conditions);
	assert.equal(images.queueImageCheck(id), null); assert.deepEqual(images.listIllustrations(id), []);
	assert.deepEqual(calls[0].body.state.gameTime, { day: 1, hour: 18, minute: 5, tick: 1 });
	advance(id, 360); await processImageCheck(queue(id));
	assert.deepEqual(calls[1].body.state.gameTime, { day: 2, hour: 0, minute: 5, tick: 2 }, 'the accepted game clock crosses midnight without using elapsed time');
});

test('affirmative System One decision precedes a generated natural prompt and the selected image preset', async (t) => {
	const logs = [];
	for (const method of ['info', 'warn', 'error']) t.mock.method(console, method, (line) => logs.push(JSON.parse(line)));
	const calls = mockPipeline(); const id = createWorld(); advance(id); const job = queue(id);
	await withInferenceLogContext({ worldId: 'other-world', jobId: 'other-job', actorId: 'other-actor', operationId: 'other-operation' }, () => processImageCheck(job));
	for (const entry of logs) {
		assert.equal(entry.worldId, id); assert.equal(entry.imageJobId, job.id);
		assert.equal(entry.jobId, undefined); assert.equal(entry.actorId, undefined); assert.notEqual(entry.operationId, 'other-operation');
	}
	assert.deepEqual(calls.map(call => call.path), ['/v1/systemone', '/v1/chat/completions', '/v1/images/generations']);
	assert.equal(calls[1].body.model, 'writer-model'); assert.equal(calls[1].body.response_format.json_schema.name, 'image_prompt');
	assert.ok(!('max_completion_tokens' in calls[1].body) && !('max_tokens' in calls[1].body));
	assert.equal(calls[2].body.model, 'image-model'); assert.equal(calls[2].body.prompt, 'Watercolor.\n\nA quiet theater entrance after rain.');
	assert.ok(!calls[2].body.prompt.includes('recentEvents'), 'raw JSON scene is never sent as an image prompt');
	const row = stage.store().prepare('SELECT bytes,media_type,input_json FROM theater_illustrations WHERE id=?').get(job.id);
	assert.deepEqual(Buffer.from(row.bytes), png); assert.equal(row.media_type, 'image/png'); assert.ok(!row.input_json.includes('private-lore-image-key'));
	assert.equal(images.listIllustrations(id)[0].status, 'completed'); assert.equal(images.queueImageCheck(id), null);
});

test('tag format is passed to the writer; legacy image request history is excluded from System One input', async () => {
	const calls = mockPipeline({ prompt: 'theater, rain, red umbrella' }); const id = createWorld(policy({ promptFormat: 'tags' })); advance(id); await processImageCheck(queue(id));
	assert.ok(calls[1].body.messages[0].content.includes('쉼표로 구분한 이미지 생성 태그'));
	const writer = JSON.parse(calls[1].body.messages[1].content); assert.equal(writer.promptFormat, 'tags'); assert.equal(writer.promptInstructions, policy().promptInstructions); assert.ok(!('objectStates' in writer));
	const cursor = images.getImageCursor(id);
	stage.store().prepare('UPDATE theater_image_settings SET cursor_json=? WHERE world_id=?').run(JSON.stringify({ ...cursor, minute: 2525, startedMinute: 2520, lastRequest: { prompt: 'old prompt must stay out of the judgment' } }), id);
	advance(id, 30); await processImageCheck(queue(id)); const state = calls[3].body.state;
	assert.deepEqual(Object.keys(state).sort(), ['gameTime', 'imageGeneration', 'objectStates', 'scene']);
	assert.deepEqual(state.gameTime, { day: 1, hour: 18, minute: 35, tick: 2 });
	assert.deepEqual(JSON.parse(state.scene).time, state.gameTime);
	assert.ok(!JSON.stringify(state).includes('old prompt must stay out of the judgment'));
	assert.deepEqual(Object.keys(images.getImageCursor(id)).sort(), ['eventId', 'revision', 'tick']);
});

test('invalid decision, malformed prompt and empty prompt fail closed without an image call', async () => {
	for (const invalid of ['decision', 'malformed', 'empty']) {
		const calls = []; globalThis.fetch = async (url, init) => { calls.push(String(url)); if (String(url).endsWith('/systemone')) return Response.json(choice(invalid === 'decision' ? 'anything' : 'generate')); return Response.json(completion(invalid === 'malformed' ? { unexpected: 'field' } : { prompt: '' })); };
		const id = createWorld(); advance(id); await processImageCheck(queue(id));
		assert.equal(images.listIllustrations(id)[0].status, 'failed'); assert.ok(calls.every(url => !url.endsWith('/images/generations'))); assert.equal(images.queueImageCheck(id), null);
	}
});

test('model and image preset snapshots apply to accepted jobs; failures are not automatically replayed', async () => {
	const calls = mockPipeline({ imageStatus: 500 }); const id = createWorld(); advance(id); const job = queue(id);
	stage.setWorldModels(id, { decisionModel: 'next-judge', textModel: 'next-writer' });
	presets.saveImagePreset({ ...preset, config: { ...config, model: 'next-image' } });
	await processImageCheck(job); assert.equal(calls[0].body.model, 'judge-model'); assert.equal(calls[1].body.model, 'writer-model'); assert.equal(calls[2].body.model, 'image-model');
	assert.equal(images.listIllustrations(id)[0].status, 'failed'); assert.ok(!images.listIllustrations(id)[0].error.includes('private-lore-image-key')); assert.equal(images.queueImageCheck(id), null);
});

test('lore edits fence an in-flight decision and editor changes alone do not request a new image', async () => {
	const id = createWorld(); stage.editWorld(id, stage.getWorld(id).revision, world => { world.definition.name += ' edited'; }); assert.equal(images.queueImageCheck(id), null);
	advance(id); const job = queue(id); let release; let calls = 0;
	globalThis.fetch = async () => { calls++; return await new Promise(resolve => { release = () => resolve(Response.json(choice())); }); };
	const pending = processImageCheck(job); await new Promise(resolve => setTimeout(resolve, 0));
	stage.editWorld(id, stage.getWorld(id).revision, world => { world.definition.imageGeneration.conditions = ''; }); release(); await pending;
	assert.equal(calls, 1); assert.deepEqual(images.listIllustrations(id), []);
});

test('reset and record clearing discard late image responses; interrupted work is not replayed after restart', async () => {
	const id = createWorld(); let release;
	globalThis.fetch = async (url) => String(url).endsWith('/systemone') ? Response.json(choice()) : String(url).endsWith('/chat/completions') ? Response.json(completion({ prompt: 'theater' })) : await new Promise(resolve => { release = () => resolve(Response.json({ data: [{ b64_json: png.toString('base64') }] })); });
	advance(id); const pending = processImageCheck(queue(id)); await new Promise(resolve => setTimeout(resolve, 0));
	stage.resetWorld(id, stage.getWorld(id).revision); release(); await pending; assert.deepEqual(images.listIllustrations(id), []); assert.equal(stage.getWorld(id).definition.imageGeneration.conditions, policy().conditions);
	advance(id); const interrupted = queue(id); images.setImageCheckStatus(interrupted.id, 'prompting'); images.recoverImageChecks(); assert.equal(images.listIllustrations(id)[0].status, 'failed'); assert.notEqual(images.pendingImageCheck()?.id, interrupted.id);
	images.clearIllustrations(id); assert.deepEqual(images.listIllustrations(id), []); assert.equal(images.queueImageCheck(id), null);
});
