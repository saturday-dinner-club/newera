import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transcriptGroups } from '../src/lib/theater/transcript.ts';
import { eventParts } from '../src/lib/theater/event-content.ts';

const event = (id, actorId = 'player', extra = {}) => ({ id, actorId, kind: 'speak', targetId: null, sceneId: 'lobby', tick: 1, text: id, ...extra });

test('consecutive actions and speech share one speaker across turns without changing source records or limiting parts', () => {
	const events = [event('gesture', 'player', { kind: 'act', text: '멋쩍게 웃어 보인다.' }), event('line', 'player', { tick: 2, text: '조장부터 뽑아볼까요?' }), event('six-parts', 'player', { tick: 3, parts: Array.from({ length: 6 }, (_, index) => ({ kind: index % 2 ? 'speak' : 'act', text: `조각 ${index}` })) })];
	const before = structuredClone(events);
	const groups = transcriptGroups(events);
	assert.equal(groups.length, 1);
	assert.equal(groups[0].firstEvent.id, 'gesture');
	assert.deepEqual(groups[0].entries.flatMap(({ event }) => eventParts(event)).map(part => part.text), ['멋쩍게 웃어 보인다.', '조장부터 뽑아볼까요?', ...Array.from({ length: 6 }, (_, index) => `조각 ${index}`)]);
	assert.deepEqual(events, before);
	assert.equal(groups[0].entries[1].event, events[1], 'the presentation keeps each event identity and metadata');
});

test('another speaker or a scene change starts a new group, without merging separate visits to the same speaker', () => {
	const groups = transcriptGroups([event('a', 'seoyeon'), event('b', 'harin'), event('c', 'seoyeon'), event('d', 'seoyeon', { sceneId: 'stage' }), event('e', 'seoyeon', { sceneId: 'lobby' })]);
	assert.deepEqual(groups.map(group => group.entries.map(({ event }) => event.id)), [['a'], ['b'], ['c'], ['d'], ['e']]);
	assert.deepEqual(groups.map(group => group.startsScene), [true, false, false, true, true]);
});

test('recipient changes stay inside the speaker group with a recipient marker, including returning to everyone', () => {
	const groups = transcriptGroups([event('a', 'seoyeon', { targetId: 'player' }), event('b', 'seoyeon', { targetId: 'player', tick: 2 }), event('c', 'seoyeon', { targetId: 'harin' }), event('d', 'seoyeon')]);
	assert.equal(groups.length, 1);
	assert.deepEqual(groups[0].entries.map(entry => entry.targetChanged), [false, false, true, true]);
});

test('silent NPC waits do not split visible speech; all source anchors remain available for inline images', () => {
	const groups = transcriptGroups([event('hidden-first', 'harin', { kind: 'wait' }), event('a'), event('hidden-middle', 'harin', { kind: 'wait' }), event('b', 'player', { tick: 2 })]);
	assert.equal(groups.length, 1);
	assert.equal(groups[0].firstEvent.id, 'a');
	assert.equal(groups[0].startsScene, true);
	assert.deepEqual(groups[0].entries.map(entry => [entry.event.id, entry.visible]), [['hidden-first', false], ['a', true], ['hidden-middle', false], ['b', true]]);
	const waiting = transcriptGroups([event('player-wait', 'player', { kind: 'wait' }), event('a')]);
	assert.equal(waiting[0].firstEvent.id, 'player-wait', 'a player choice to wait remains visible');
});

test('empty and image-only hidden groups have no invented speaker, and hidden scene changes preserve scene headings', () => {
	assert.deepEqual(transcriptGroups([]), []);
	const groups = transcriptGroups([event('hidden', 'harin', { kind: 'wait' }), event('another-scene', 'harin', { kind: 'wait', sceneId: 'stage' }), event('line', 'seoyeon', { sceneId: 'stage' })]);
	assert.equal(groups[0].firstEvent, null);
	assert.equal(groups[1].firstEvent.id, 'line');
	assert.equal(groups[1].startsScene, true);
});
