import { applyAction, availableActions, beginTurn, observation, residents, templateFor } from './runtime.ts';
import { checkedExpression, isExactRepeat } from './performance.ts';
import { memoryForEvent } from './memory.ts';
import { bodyParts } from './expression-parts.ts';
import { applyReflection, reflectionContext } from './reflection.ts';
import { applyAppearance, needsAppearance } from './appearance.ts';
import { inactivityModes } from './types.ts';
import { checkedReactionSchedule, consumeReaction, reserveReaction } from './reaction-scheduler.ts';
import type { ActorPerformance, CharacterReflection, InactivityMode, OutfitOption, PlayerRequest, ReflectionContext, StageAction, TurnProgress, WitnessedEvent, World } from './types.ts';

export interface ActorDecision { act: boolean; model: string; inactivity?: InactivityMode }
export interface Director {
	chooseAppearance?(state: Record<string, unknown>, outfits: OutfitOption[]): Promise<{ outfitId: string; model: string }>;
	reflect(state: Record<string, unknown>, context: ReflectionContext): Promise<CharacterReflection>;
	decide(state: Record<string, unknown>): Promise<ActorDecision>;
	perform(state: Record<string, unknown>, actions: StageAction[], writingStyle?: string, previousAction?: WitnessedEvent): Promise<ActorPerformance>;
}

interface TurnExecution {
	progress?: TurnProgress | null;
	onProgress?: (world: World, progress: TurnProgress) => void;
	nextInput?: (consumedInputs: number) => PlayerRequest | null;
	/** Live hosts enable a reply window; headless simulations do not wait by default. */
	playerReplyTimeoutMs?: number;
	skipReply?: (until: number, eventId?: string) => boolean;
	now?: () => number;
	wait?: (ms: number) => Promise<void>;
}

/** Old one-pass jobs resume at their remaining actors without replaying committed events. */
export function restoredProgress(raw: unknown): TurnProgress | null {
	if (!raw) return null;
	const saved = raw as TurnProgress & { actorIds?: string[]; nextActorIndex?: number };
	if (saved.pendingActorIds) return { ...structuredClone(saved), ...(saved.scheduler ? { scheduler: checkedReactionSchedule(saved.scheduler) } : {}) };
	return { pendingActorIds: saved.actorIds!.slice(saved.nextActorIndex), completedDecisions: saved.nextActorIndex!, consumedInputs: 0 };
}

function castIds(world: World, targetId: string | null = null): string[] {
	const cast = residents(world).filter((actor) => templateFor(world, actor).kind === 'character');
	cast.sort((left, right) => Number(right.id === targetId) - Number(left.id === targetId));
	return cast.map((actor) => actor.id);
}

/** Publish only complete actions and a resume cursor; never publish incomplete model output. */
export async function resolveTurn(original: World, request: PlayerRequest, director: Director, checkpoint: () => void = () => {}, execution: TurnExecution = {}): Promise<World> {
	const draft = structuredClone(original);
	const playerReplyTimeoutMs = execution.playerReplyTimeoutMs ?? 0;
	const now = execution.now ?? Date.now;
	const wait = execution.wait ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
	let progress = restoredProgress(execution.progress);
	if (!progress) {
		checkpoint();
		beginTurn(draft, request);
		const targetId = request.kind === 'input' || request.kind === 'speak' || request.kind === 'interact' ? request.targetId : null;
		progress = { pendingActorIds: castIds(draft, targetId), completedDecisions: 0, consumedInputs: 0, scheduler: { version: 1, priorityActorId: targetId, reservation: null } };
		execution.onProgress?.(draft, progress);
	}
	while (true) {
		checkpoint();
		// Consume chat at action boundaries; its event and consumed cursor commit together.
		const input = execution.nextInput?.(progress.consumedInputs);
		if (input) {
			delete progress.playerReplyUntil;
			delete progress.playerReplyEventId;
			beginTurn(draft, input);
			progress.consumedInputs++;
			const targetId = input.kind === 'input' || input.kind === 'speak' || input.kind === 'interact' ? input.targetId : null;
			progress.pendingActorIds = castIds(draft, targetId);
			if (progress.scheduler) {
				// The reserved readiness is durable, but a proposal made before this input is obsolete.
				progress.scheduler.reservation = null;
				progress.scheduler.priorityActorId = targetId;
			}
			execution.onProgress?.(draft, progress);
			continue;
		}
		// No reflection, scheduling or generation may overtake the player's reply window.
		if (progress.playerReplyUntil !== undefined) {
			const remaining = progress.playerReplyUntil - now();
			if (remaining > 0 && !execution.skipReply?.(progress.playerReplyUntil, progress.playerReplyEventId)) {
				await wait(Math.min(250, remaining));
				continue;
			}
			delete progress.playerReplyUntil;
			delete progress.playerReplyEventId;
			execution.onProgress?.(draft, progress);
			continue;
		}
		if (!progress.pendingActorIds.length) break;
		// Dress every newly encountered resident before anyone reasons about the scene.
		const dressingActor = residents(draft).find((actor) => templateFor(draft, actor).kind === 'character' && templateFor(draft, actor).wardrobe?.length && needsAppearance(draft, actor));
		if (dressingActor) {
			const template = templateFor(draft, dressingActor);
			if (!director.chooseAppearance) throw new Error('오늘의 옷차림 판단기가 필요합니다.');
			let selected;
			try { selected = await director.chooseAppearance(observation(draft, dressingActor), template.wardrobe!); }
			catch (error) {
				checkpoint();
				if (execution.nextInput?.(progress.consumedInputs)) continue;
				throw error;
			}
			checkpoint();
			if (execution.nextInput?.(progress.consumedInputs)) continue;
			applyAppearance(dressingActor, template, draft, selected.outfitId, selected.model);
			execution.onProgress?.(draft, progress);
			continue;
		}
		if (progress.scheduler && !progress.scheduler.reservation) {
			// Refresh every candidate's arousal before advancing ordering time, including slow candidates.
			let prepared = false;
			for (const id of progress.pendingActorIds) {
				const candidate = draft.state.instances.find((entry) => entry.id === id && entry.active && entry.sceneId === draft.state.activeSceneId);
				if (!candidate) continue;
				const context = reflectionContext(draft, candidate);
				if (!context) continue;
				const state = observation(draft, candidate);
				let reflection: CharacterReflection;
				try { reflection = await director.reflect({ ...state, self: { ...(state.self as Record<string, unknown>), memories: context.evidenceEvents }, recentEvents: context.evidenceEvents }, context); }
				catch (error) {
					checkpoint();
					if (execution.nextInput?.(progress.consumedInputs)) { prepared = true; break; }
					throw error;
				}
				checkpoint();
				if (!execution.nextInput?.(progress.consumedInputs)) {
					applyReflection(candidate, reflection, context);
					execution.onProgress?.(draft, progress);
				}
				prepared = true;
				break;
			}
			if (prepared) continue;
			reserveReaction(draft, progress);
			execution.onProgress?.(draft, progress);
			continue;
		}
		const actorId = progress.scheduler?.reservation?.actorId ?? progress.pendingActorIds[0];
		const eventStart = draft.state.events.length;
		const actor = draft.state.instances.find((candidate) => candidate.id === actorId);
		if (actor?.active && actor.sceneId === draft.state.activeSceneId) {
			const state = observation(draft, actor);
			const context = reflectionContext(draft, actor);
			if (context && !progress.scheduler) {
				let reflection: CharacterReflection;
				// A backlog batch must not see later memories through the ordinary recent-event window.
				const reflectedState = { ...state, self: { ...(state.self as Record<string, unknown>), memories: context.evidenceEvents }, recentEvents: context.evidenceEvents };
				try { reflection = await director.reflect(reflectedState, context); }
				catch (error) {
					checkpoint();
					if (execution.nextInput?.(progress.consumedInputs)) continue;
					throw error;
				}
				checkpoint();
				if (execution.nextInput?.(progress.consumedInputs)) continue;
				applyReflection(actor, reflection, context);
				// Private state and its event cursor commit before deciding, without consuming the actor's turn.
				execution.onProgress?.(draft, progress);
				continue;
			}
			const actions = availableActions(draft, actor.id);
			let decision: ActorDecision;
			try { decision = await director.decide(state); }
			catch (error) {
				checkpoint();
				if (execution.nextInput?.(progress.consumedInputs)) continue;
				throw error;
			}
			checkpoint();
			if (execution.nextInput?.(progress.consumedInputs)) continue;
			if (typeof decision.act !== 'boolean') throw new Error('행동 여부 판단이 올바르지 않습니다.');
			if (!decision.act) {
				// Older directors represented non-participation as watching. New model calls always specify a mode.
				const mode = decision.inactivity ?? 'watch';
				if (!inactivityModes.includes(mode)) throw new Error('비참여 선택이 올바르지 않습니다.');
				actor.inactivity = { mode, tick: draft.state.tick, model: decision.model };
				if (mode === 'watch') {
					const wait = actions.find((action) => action.kind === 'wait')!;
					applyAction(draft, actor.id, wait, '주변을 지켜본다.', { model: decision.model, choice: 'watch', acted: false });
				}
			} else {
				const candidates = actions.filter((action) => action.kind !== 'wait');
				const previous = draft.state.events.findLast((event) => event.actorId === actor.id && ['act', 'speak', 'interact', 'leave', 'move'].includes(event.kind));
				const previousAction = previous ? memoryForEvent(previous) : undefined;
				let performance: ActorPerformance;
				try { performance = await director.perform(state, candidates, draft.definition.writingStyle, previousAction); }
				catch (error) {
					checkpoint();
					if (execution.nextInput?.(progress.consumedInputs)) continue;
					throw error;
				}
				const { model, ...output } = performance;
				checkpoint();
				if (execution.nextInput?.(progress.consumedInputs)) continue;
				const expression = checkedExpression(output, candidates);
				const action = candidates.find((candidate) => candidate.id === expression.actionId)!;
				if (isExactRepeat(previousAction, actor.id, actor.sceneId, action, expression)) {
					actor.inactivity = { mode: 'idle', tick: draft.state.tick, model: decision.model };
				} else {
						const text = bodyParts(expression).map((part) => part.text).join('\n') || action.label;
					applyAction(draft, actor.id, action, text, { model: decision.model, choice: action.id, acted: true, generationModel: model }, expression);
					delete actor.inactivity;
					if (expression.memoUpdate) actor.memo = expression.memoUpdate;
				}
			}
		}
		if (progress.scheduler) consumeReaction(draft, progress, actorId);
		progress.pendingActorIds = progress.pendingActorIds.filter((id) => id !== actorId);
		progress.completedDecisions++;
		// Waking an existing candidate never resets its accumulated readiness. Waiting wakes nobody.
		const emitted = draft.state.events.slice(eventStart).filter((event) => event.kind !== 'wait');
		const cast = castIds(draft);
		for (const id of cast) {
			const witness = draft.state.instances.find((candidate) => candidate.id === id)!;
			if (emitted.some((event) => event.actorId !== id && witness.memories.some((memory) => memory.eventId === event.id)) && !progress.pendingActorIds.includes(id)) {
				progress.pendingActorIds.push(id);
			}
		}
		if (cast.includes(actorId) && emitted.some((event) => event.actorId === actorId) && !progress.pendingActorIds.includes(actorId)) {
			progress.pendingActorIds.push(actorId);
		}
		const replyEvent = emitted.find((event) => event.kind === 'speak' && event.actorId !== 'player' && event.targetId === 'player');
		if (playerReplyTimeoutMs > 0 && replyEvent) {
			progress.playerReplyUntil = now() + playerReplyTimeoutMs;
			progress.playerReplyEventId = replyEvent.id;
		}
		checkpoint();
		execution.onProgress?.(draft, progress);
	}
	return draft;
}
