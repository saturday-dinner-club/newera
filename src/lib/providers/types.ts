import type { DecisionApi } from '../theater/types.ts';

export type ProviderKind = 'oev' | 'openai-compatible';
export const decisionApiFor = (provider: { kind: ProviderKind; decisionApi?: DecisionApi | 'none' }): DecisionApi | 'none' => provider.decisionApi ?? (provider.kind === 'oev' ? 'systemone' : 'none');
export interface ModelAlias {
	id: string;
	label: string;
	modelId: string;
	task: 'generation' | 'decision' | 'embedding';
}
export interface PublicProvider {
	id: string;
	label: string;
	kind: ProviderKind;
	decisionApi: DecisionApi | 'none';
	decisionMaxChoices: number;
	baseUrl: string;
	apiKeyEnv: string;
	apiKeyConfigured: boolean;
	models: ModelAlias[];
	/** Legacy setting retained for saved providers and job snapshots; requests omit output token caps. */
	outputTokenParameter: 'max_completion_tokens' | 'max_tokens';
	structuredOutput: 'json_schema' | 'json_object';
}
export interface ProviderView { revision: number; providers: PublicProvider[] }
export interface ModelOption {
	value: string;
	label: string;
	providerId: string;
	providerLabel: string;
	modelId: string;
	decision: boolean;
	generation: boolean;
	decisionApi?: DecisionApi;
}
