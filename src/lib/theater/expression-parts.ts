import type { EventBody, ExpressionPart } from './types.ts';

export const maxExpressionParts = 6;

export function summarizeParts(parts: ExpressionPart[]): EventBody {
	return {
		narrative: parts.filter((part) => part.kind === 'act').map((part) => part.text).join('\n') || null,
		utterance: parts.filter((part) => part.kind === 'speak').map((part) => part.text).join('\n') || null
	};
}

/** Preserve older pairs as two ordered pieces without changing their saved records. */
export function bodyParts(body: EventBody): ExpressionPart[] {
	return body.parts ?? [
		...(body.narrative ? [{ kind: 'act' as const, text: body.narrative }] : []),
		...(body.utterance ? [{ kind: 'speak' as const, text: body.utterance }] : [])
	];
}

/** Shared by model output, saved events and memories; never truncate or reorder a proposal. */
export function checkedParts(value: unknown): ExpressionPart[] {
	if (!Array.isArray(value) || value.length < 1 || value.length > maxExpressionParts) throw new Error('행동·대사 parts는 합계 1~6개여야 합니다.');
	const parts = value.map((item): ExpressionPart => {
		if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('표현 조각이 올바르지 않습니다.');
		const part = item as Record<string, unknown>;
		if (Object.keys(part).length !== 2 || !Object.hasOwn(part, 'kind') || !Object.hasOwn(part, 'text') || (part.kind !== 'act' && part.kind !== 'speak')) throw new Error('표현 조각에는 act 또는 speak kind와 text만 필요합니다.');
		if (typeof part.text !== 'string' || !part.text.trim() || part.text.length > (part.kind === 'act' ? 2000 : 4000)) throw new Error('표현 조각의 내용 또는 길이가 올바르지 않습니다.');
		return { kind: part.kind, text: part.text.trim() };
	});
	const summary = summarizeParts(parts);
	if ((summary.narrative?.length ?? 0) > 2000 || (summary.utterance?.length ?? 0) > 4000) throw new Error('전체 행동 묘사는 2000자, 전체 대사는 4000자 이하여야 합니다.');
	return parts;
}
