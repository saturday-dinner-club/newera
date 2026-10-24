import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { inferenceLogContext, logInference, withInferenceLogContext, type InferenceDiagnostic } from './inference-log';

export interface RetryPolicy {
	maxRetries: number;
	retryBaseMs: number;
	retryMaxMs: number;
}

export class InferenceError extends Error {
	readonly diagnostic?: InferenceDiagnostic;
	constructor(message: string, diagnostic?: InferenceDiagnostic) { super(message); this.diagnostic = diagnostic; }
}
export class RetryableError extends InferenceError {}

/** Retry one inference, without replaying any already committed scene action. */
export async function withRetries<T>(label: string, policy: RetryPolicy, signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
	const operationId = randomUUID();
	const parentOperationId = inferenceLogContext().operationId;
	const started = Date.now();
	for (let attempt = 0; ; attempt++) {
		signal.throwIfAborted();
		const fields = { operationId, parentOperationId, operation: label, attempt: attempt + 1, maxAttempts: policy.maxRetries + 1 };
		try {
			return await withInferenceLogContext(fields, async () => {
				logInference('info', '[추론] 시도 시작', {});
				const value = await operation();
				logInference('info', '[추론] 완료', { elapsedMs: Date.now() - started });
				return value;
			});
		}
		catch (error) {
			if (signal.aborted) logInference('info', '[추론] 취소', { ...fields, elapsedMs: Date.now() - started });
			signal.throwIfAborted();
			const diagnostic = error instanceof InferenceError ? error.diagnostic : undefined;
			const failure = { ...fields, ...diagnostic, code: diagnostic?.code ?? 'inference_failed', reason: diagnostic?.reason ?? '요청 처리에 실패했습니다. 같은 operationId의 요청 실패 로그를 확인해 주세요.', elapsedMs: Date.now() - started };
			if (!(error instanceof RetryableError)) { logInference('error', '[추론] 실패', failure); throw error; }
			if (attempt >= policy.maxRetries) {
				logInference('error', policy.maxRetries ? '[추론] 재시도 소진' : '[추론] 실패', failure);
				if (!policy.maxRetries) throw error;
				throw new Error(`${label}: ${attempt + 1}회 시도 후 실패했습니다. ${error.message}`, { cause: error });
			}
			const waitMs = Math.min(policy.retryMaxMs, Math.ceil(policy.retryBaseMs * 2 ** attempt * (0.8 + Math.random() * 0.4)));
			logInference('warn', '[추론] 재시도 예약', { ...failure, delayMs: waitMs, nextAttempt: attempt + 2 });
			try { await delay(waitMs, undefined, { signal }); }
			catch (error) {
				if (signal.aborted) logInference('info', '[추론] 취소', { ...fields, elapsedMs: Date.now() - started });
				signal.throwIfAborted(); throw error;
			}
		}
	}
}
