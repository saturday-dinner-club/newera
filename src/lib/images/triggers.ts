import type { ImageGenerationPolicy, Properties, World } from '$lib/theater/types';

export interface ImageRequestContext {
	tick: number; minute: number; sceneId: string; eventId: string | null; prompt: string;
}
/** Internal progress only. Generation conditions belong to the lorebook definition. */
export interface ImageTriggerCursor {
	revision: number; tick: number; eventId: string | null; minute: number; startedMinute: number; sceneId: string; lastRequest: ImageRequestContext | null;
}
export interface ImageSceneSnapshot {
	revision: number; tick: number; minute: number; sceneId: string; eventId: string | null;
	context: string; objectStates: { id: string; name: string; state: Properties }[];
}
export interface Illustration {
	id: string; worldId: string; eventId: string | null; tick: number; sceneId: string;
	status: 'pending' | 'checking' | 'prompting' | 'generating' | 'completed' | 'failed' | 'skipped';
	reason: string; error: string | null; createdAt: string;
}
export const imageGenerationPolicy = (world: World): ImageGenerationPolicy => world.definition.imageGeneration ?? { conditions: '', promptFormat: 'natural', promptInstructions: '' };
export const storyMinute = (world: World) => world.state.day * 1440 + world.state.minute;
export function imageTriggerCursor(world: World): ImageTriggerCursor {
	return { revision: world.revision, tick: world.state.tick, eventId: world.state.events.at(-1)?.id ?? null, minute: storyMinute(world), startedMinute: storyMinute(world), sceneId: world.state.activeSceneId, lastRequest: null };
}

/** Private character state, memories, goals and relationships do not enter illustration inference. */
export function imageSceneSnapshot(world: World): ImageSceneSnapshot {
	const sceneId = world.state.activeSceneId;
	const scene = world.definition.scenes.find((entry) => entry.id === sceneId)!;
	const residents = world.state.instances.filter((entity) => entity.active && entity.sceneId === sceneId);
	const context = JSON.stringify({
		scene: { id: scene.id, name: scene.name, description: scene.description.slice(0, 4000) },
		time: { day: world.state.day, minute: world.state.minute, tick: world.state.tick },
		cast: residents.map((entity) => ({ id: entity.id, name: entity.name, appearance: (entity.appearance ?? '').slice(0, 1000) })),
		recentEvents: world.state.events.filter((event) => event.sceneId === sceneId).slice(-8).map((event) => ({ id: event.id, tick: event.tick, actor: event.actorId === 'player' ? '플레이어' : world.state.instances.find((entity) => entity.id === event.actorId)?.name ?? '무대', kind: event.kind, narrative: (event.narrative ?? event.text).slice(0, 1500), utterance: event.utterance?.slice(0, 1500) ?? null }))
	}).slice(0, 20000);
	const objectStates = residents.filter((entity) => world.definition.templates.find((template) => template.id === entity.templateId)?.kind === 'object').map((entity) => ({ id: entity.id, name: entity.name, state: structuredClone(entity.state) }));
	return { revision: world.revision, tick: world.state.tick, minute: storyMinute(world), sceneId, eventId: world.state.events.at(-1)?.id ?? null, context, objectStates };
}
