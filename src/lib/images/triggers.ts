import type { ImageGenerationPolicy, Properties, World } from '$lib/theater/types';

/** Internal progress only. Generation conditions belong to the lorebook definition. */
export interface ImageTriggerCursor {
	revision: number; tick: number; eventId: string | null;
}
export interface ImageGameTime { day: number; hour: number; minute: number; tick: number }
export interface ImageSceneSnapshot {
	revision: number; tick: number; minute: number; sceneId: string; eventId: string | null;
	context: string; objectStates: { id: string; name: string; state: Properties }[];
}
export interface ImageJudgmentInput {
	imageGeneration: ImageGenerationPolicy;
	gameTime: ImageGameTime;
	scene: string;
	objectStates: ImageSceneSnapshot['objectStates'];
}
export interface Illustration {
	id: string; worldId: string; eventId: string | null; tick: number; sceneId: string;
	status: 'pending' | 'checking' | 'prompting' | 'generating' | 'completed' | 'failed' | 'skipped';
	reason: string; error: string | null; createdAt: string;
}
export const imageGenerationPolicy = (world: World): ImageGenerationPolicy => world.definition.imageGeneration ?? { conditions: '', promptFormat: 'natural', promptInstructions: '' };
export const storyMinute = (world: World) => world.state.day * 1440 + world.state.minute;
/** Derive the clock from the accepted scene, including persisted jobs from earlier versions. */
export function imageGameTime(scene: Pick<ImageSceneSnapshot, 'minute' | 'tick'>): ImageGameTime {
	const minuteOfDay = scene.minute % 1440;
	return { day: Math.floor(scene.minute / 1440), hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60, tick: scene.tick };
}
export function imageTriggerCursor(world: World): ImageTriggerCursor {
	return { revision: world.revision, tick: world.state.tick, eventId: world.state.events.at(-1)?.id ?? null };
}

/** Private character state, memories, goals and relationships do not enter illustration inference. */
export function imageSceneSnapshot(world: World): ImageSceneSnapshot {
	const sceneId = world.state.activeSceneId;
	const scene = world.definition.scenes.find((entry) => entry.id === sceneId)!;
	const residents = world.state.instances.filter((entity) => entity.active && entity.sceneId === sceneId);
	const context = JSON.stringify({
		scene: { id: scene.id, name: scene.name, description: scene.description.slice(0, 4000) },
		time: imageGameTime({ minute: storyMinute(world), tick: world.state.tick }),
		cast: residents.map((entity) => ({ id: entity.id, name: entity.name, appearance: (entity.appearance ?? '').slice(0, 1000) })),
		recentEvents: world.state.events.filter((event) => event.sceneId === sceneId).slice(-8).map((event) => ({ id: event.id, tick: event.tick, actor: event.actorId === 'player' ? '플레이어' : world.state.instances.find((entity) => entity.id === event.actorId)?.name ?? '무대', kind: event.kind, narrative: (event.narrative ?? event.text).slice(0, 1500), utterance: event.utterance?.slice(0, 1500) ?? null }))
	}).slice(0, 20000);
	const objectStates = residents.filter((entity) => world.definition.templates.find((template) => template.id === entity.templateId)?.kind === 'object').map((entity) => ({ id: entity.id, name: entity.name, state: structuredClone(entity.state) }));
	return { revision: world.revision, tick: world.state.tick, minute: storyMinute(world), sceneId, eventId: world.state.events.at(-1)?.id ?? null, context, objectStates };
}
