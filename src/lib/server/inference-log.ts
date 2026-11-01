import { AsyncLocalStorage } from 'node:async_hooks';

export interface InferenceLogContext {
	worldId?: string;
	jobId?: string;
	imageJobId?: string;
	actorId?: string;
	sceneId?: string;
	tick?: number;
	operationId?: string;
	parentOperationId?: string;
	parentRequestId?: string;
	operation?: string;
	attempt?: number;
	maxAttempts?: number;
}
export interface InferenceDiagnostic {
	stage: string;
	code: string;
	reason: string;
	requestId?: string;
	providerId?: string;
	providerLabel?: string;
	model?: string;
	decisionApi?: 'systemone' | 'decision';
	finishReason?: string | null;
	outputTokenLimit?: number;
	contentChars?: number;
	reasoningChars?: number;
	completionTokens?: number;
	reasoningTokens?: number;
	missingFields?: string[];
	unexpectedFieldCount?: number;
	fieldTypes?: Record<string, string>;
}

const context = new AsyncLocalStorage<InferenceLogContext>();
export const inferenceLogContext = (): InferenceLogContext => context.getStore() ?? {};
export function withInferenceLogContext<T>(fields: InferenceLogContext, operation: () => T): T {
	return context.run({ ...inferenceLogContext(), ...fields }, operation);
}
/** A newly scheduled job must not inherit IDs from the job that happened to wake its worker. */
export function withInferenceRootContext<T>(fields: InferenceLogContext, operation: () => T): T {
	return context.run(fields, operation);
}
export function logInference(level: 'info' | 'warn' | 'error', label: string, fields: Record<string, unknown>): void {
	console[level](JSON.stringify({ timestamp: new Date().toISOString(), level, event: label, ...inferenceLogContext(), ...fields }));
}
