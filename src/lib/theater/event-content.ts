import type { StageEvent } from './types.ts';

/** Older events without separated fields use their event kind to supply the display role. */
export function eventContent(event: StageEvent): { narrative: string | null; utterance: string | null } {
	return {
		narrative: event.narrative ?? (event.kind === 'speak' ? null : event.text),
		utterance: event.utterance ?? (event.kind === 'speak' ? event.text : null)
	};
}
