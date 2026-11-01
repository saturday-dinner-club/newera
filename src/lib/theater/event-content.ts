import type { ExpressionPart, StageEvent } from './types.ts';
import { bodyParts, summarizeParts } from './expression-parts.ts';

/** Older events without separated fields use their event kind to supply the display role. */
export function eventContent(event: StageEvent): { narrative: string | null; utterance: string | null } {
	if (event.parts) return summarizeParts(event.parts);
	return {
		narrative: event.narrative ?? (event.kind === 'speak' ? null : event.text),
		utterance: event.utterance ?? (event.kind === 'speak' ? event.text : null)
	};
}

export function eventParts(event: StageEvent): ExpressionPart[] {
	return event.parts ?? bodyParts(eventContent(event));
}
