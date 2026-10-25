import type { EntityInstance, EntityTemplate, ReactionSchedule, TurnProgress, World } from './types.ts';

export const reactionThreshold = 100;
const epsilon = 1e-9;
export const defaultReactionProfile = { baseSpeed: 10, talkativeness: 50 };

export function reactionSpeed(template: EntityTemplate, actor: EntityInstance): number {
	const profile = template.reactionProfile ?? defaultReactionProfile;
	return Math.max(1, Math.min(300, profile.baseSpeed * (0.5 + profile.talkativeness / 100) * (1 + (actor.arousal ?? 0) / 100)));
}

/** Reserve without consuming. The caller persists readiness and the reservation together before inference. */
export function reserveReaction(world: World, progress: TurnProgress): ReactionSchedule['reservation'] {
	const schedule = progress.scheduler!;
	if (schedule.reservation) return schedule.reservation;
	const candidates = progress.pendingActorIds.flatMap((id) => {
		const actor = world.state.instances.find((entry) => entry.id === id && entry.active && entry.sceneId === world.state.activeSceneId);
		const template = actor && world.definition.templates.find((entry) => entry.id === actor.templateId && entry.kind === 'character');
		return actor && template ? [{ actor, speed: reactionSpeed(template, actor) }] : [];
	});
	progress.pendingActorIds = candidates.map(({ actor }) => actor.id);
	if (!candidates.length) return null;
	const elapsed = Math.min(...candidates.map(({ actor, speed }) => Math.max(0, reactionThreshold - (actor.reactionGauge ?? 0)) / speed));
	world.state.reactionClock = (world.state.reactionClock ?? 0) + elapsed;
	for (const { actor, speed } of candidates) actor.reactionGauge = Math.min(reactionThreshold, (actor.reactionGauge ?? 0) + speed * elapsed);
	const ready = candidates.filter(({ actor }) => actor.reactionGauge! >= reactionThreshold - epsilon);
	ready.sort((left, right) =>
		Number(right.actor.id === schedule.priorityActorId) - Number(left.actor.id === schedule.priorityActorId)
		|| (left.actor.lastOpportunitySequence ?? 0) - (right.actor.lastOpportunitySequence ?? 0)
		|| progress.pendingActorIds.indexOf(left.actor.id) - progress.pendingActorIds.indexOf(right.actor.id));
	const selected = ready[0];
	if (!selected) throw new Error('다음 행동 판단 기회를 계산하지 못했습니다.');
	schedule.reservation = { actorId: selected.actor.id, clock: world.state.reactionClock, speed: selected.speed };
	return schedule.reservation;
}

/** Consume once, atomically with the complete action or inactivity result at the caller's save boundary. */
export function consumeReaction(world: World, progress: TurnProgress, actorId: string): void {
	const schedule = progress.scheduler!;
	if (schedule.reservation?.actorId !== actorId) throw new Error('예약된 행동 판단 기회가 일치하지 않습니다.');
	const actor = world.state.instances.find((entry) => entry.id === actorId)!;
	actor.reactionGauge = Math.max(0, (actor.reactionGauge ?? 0) - reactionThreshold);
	world.state.reactionSequence = (world.state.reactionSequence ?? 0) + 1;
	actor.lastOpportunitySequence = world.state.reactionSequence;
	schedule.reservation = null;
}

/** Validate persisted job metadata separately from world state; never silently downgrade a new job to FIFO. */
export function checkedReactionSchedule(value: unknown): ReactionSchedule {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('반응 스케줄러 저장 형식이 올바르지 않습니다.');
	const source = value as Record<string, unknown>;
	const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
	if (source.version !== 1 || (source.priorityActorId !== null && !validId(source.priorityActorId))) throw new Error('반응 스케줄러 버전 또는 우선 대상이 올바르지 않습니다.');
	let reservation: ReactionSchedule['reservation'] = null;
	if (source.reservation !== null) {
		const slot = source.reservation as Record<string, unknown> | undefined;
		if (!slot || !validId(slot.actorId) || typeof slot.clock !== 'number' || !Number.isFinite(slot.clock) || slot.clock < 0 || typeof slot.speed !== 'number' || !Number.isFinite(slot.speed) || slot.speed < 1 || slot.speed > 300) throw new Error('예약된 반응 기회가 올바르지 않습니다.');
		reservation = { actorId: slot.actorId, clock: slot.clock, speed: slot.speed };
	}
	return { version: 1, priorityActorId: source.priorityActorId as string | null, reservation };
}
