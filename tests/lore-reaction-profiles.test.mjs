import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { exampleWorld } from '../src/lib/theater/fixtures.ts';
import { initialState } from '../src/lib/theater/runtime.ts';
import { reactionSpeed } from '../src/lib/theater/reaction-scheduler.ts';
import { buildBundle, validateBundle } from '../skills/newera-lore-authoring/scripts/lore-format.mjs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const examples = [
	['skills/newera-lore-authoring/assets/example-source.json', 'static/lore-presets/theater-opening.json'],
	['lore-sources/solbit-high.json', 'static/lore-presets/solbit-high.json'],
	['lore-sources/haon-university.json', 'static/lore-presets/haon-university.json']
];

test('all lore presets preserve authored reaction profiles and opening arousal through the real builder', () => {
	let characters = 0;
	for (const [sourcePath, presetPath] of examples) {
		const source = read(sourcePath), preset = read(presetPath);
		assert.deepEqual(preset, buildBundle(source), `${presetPath} must match its source`);
		assert.equal(validateBundle(preset).tick, 0);
		assert.deepEqual(preset.world.state.events, []);
		const speeds = new Set();
		for (const template of source.definition.templates) {
			if (template.kind !== 'character') { assert.equal(template.reactionProfile, undefined); continue; }
			characters++;
			assert.ok(template.reactionProfile, `${template.name} needs explicit reaction traits`);
			for (const spawn of source.definition.spawns.filter(spawn => spawn.templateId === template.id)) {
				assert.ok(Number.isInteger(spawn.arousal) && spawn.arousal >= 0 && spawn.arousal <= 100);
				const instance = preset.world.state.instances.find(instance => instance.id === spawn.id);
				assert.equal(instance.arousal, spawn.arousal);
				assert.equal(instance.reactionGauge, 0);
				speeds.add(reactionSpeed(template, instance));
			}
		}
		assert.ok(speeds.size > 1, 'authored cast should have different actual opening opportunity rates');
	}
	assert.equal(characters, 38);
});

test('the built-in opening matches the importable theater reaction traits, initial arousal and image policy', () => {
	const definition = exampleWorld(), source = read(examples[0][0]).definition;
	assert.deepEqual(definition.imageGeneration, source.imageGeneration);
	const state = initialState(definition);
	for (const template of definition.templates.filter(template => template.kind === 'character')) {
		assert.deepEqual(template.reactionProfile, source.templates.find(entry => entry.id === template.id).reactionProfile);
	}
	for (const spawn of source.spawns.filter(spawn => spawn.arousal !== undefined)) assert.equal(state.instances.find(instance => instance.id === spawn.id).arousal, spawn.arousal);
});
