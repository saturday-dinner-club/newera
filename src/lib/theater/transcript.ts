import type { StageEvent } from './types.ts';

export interface TranscriptGroup {
	id: string;
	sceneId: string;
	firstEvent: StageEvent | null;
	startsScene: boolean;
	entries: { event: StageEvent; visible: boolean; targetChanged: boolean }[];
}

/** A reading view only: keep the original events, turns and attached illustrations in order. */
export function transcriptGroups(events: StageEvent[]): TranscriptGroup[] {
	const groups: TranscriptGroup[] = [];
	let previousVisible: StageEvent | undefined;
	for (const event of events) {
		const visible = event.kind !== 'wait' || event.actorId === 'player';
		let group = groups.at(-1);
		if (!group || group.sceneId !== event.sceneId || (visible && group.firstEvent && group.firstEvent.actorId !== event.actorId)) {
			group = { id: event.id, sceneId: event.sceneId, firstEvent: null, startsScene: false, entries: [] };
			groups.push(group);
		}
		const targetChanged = visible && group.firstEvent !== null && previousVisible?.targetId !== event.targetId;
		if (visible) {
			if (!group.firstEvent) {
				group.firstEvent = event;
				group.startsScene = previousVisible?.sceneId !== event.sceneId;
			}
			previousVisible = event;
		}
		// Silent NPC waits do not interrupt a speaker, but their linked images keep their place.
		group.entries.push({ event, visible, targetChanged });
	}
	return groups;
}
