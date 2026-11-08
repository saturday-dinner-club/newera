# newera · Theater

newera is a scene-based text roleplaying game where characters observe events, form their own impressions, and choose what to do next. Worlds define scenes, character and object templates, and instances with independent state and memory. Companions travel with the player while retaining their identity, relationships, and history.

Built with Svelte 5, SvelteKit, TypeScript, and SQLite. The interface, built-in prompts, and bundled worlds are primarily in Korean.

## Getting started

You need **Node.js 24.10 or later** and model servers for two roles:

- **Decisions:** an OEV System One server or a compatible Decisions API.
- **Generation:** a Chat Completions server that can produce valid structured JSON for actions, dialogue, and character reflection.

The same server can fill both roles if it supports both contracts. Images and embedding-based memory retrieval are optional. Scenes without resident characters can run without a model connection.

From the repository root, run:

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

On macOS or Linux, use `cp .env.example .env` for the first command. Open [localhost:5173](http://localhost:5173) to play, `/lores` to edit worlds, and `/images` to manage illustration presets.

The bundled environment example points to `http://macstudio:12821/v1`. Replace it with your OEV server address, or register other providers through the interface as described below. That hostname is not a service supplied by this repository.

For a production build:

```powershell
npm run build
npm start
```

`npm start` loads `.env` through Node's `--env-file-if-exists` option. The development server also loads the supported server-side environment variables from `.env` at startup. Restart the server after changing environment variables.

## Connecting models

Open **Menu → Model and illustration settings → Provider management** (`메뉴 → 모델과 삽화 설정 → Provider 관리`). Register API base URLs including their `/v1` prefix, credentials when required, and model aliases. Then choose a decision model and a text model for the current world and apply them.

| Role | API | Configuration |
| --- | --- | --- |
| System One decisions | `POST /v1/systemone` | Set the provider's decision API to `systemone`. Existing OEV providers use this by default. |
| TypeSafe Jev decisions | `POST /v1/systemone` | Register `https://api.typesafe.ai/v1` with a key and the System One decision API. Native `models[].name` listings are imported as decision-only aliases. |
| OpenAI Luna decisions | `POST /v1/decisions` | Use **Add OpenAI Luna**; the preset uses `gpt-6-luna`, `OPENAI_API_KEY`, and a decision-only alias. |
| Geniex decisions | `POST /v1/decisions` | Use **Add Geniex**; its default base URL is `http://127.0.0.1:18181/v1`. |
| Text generation and reflection | `POST /v1/chat/completions` | Use OEV or an OpenAI-compatible provider with working structured JSON output. |

Generation API type and decision API type are independent settings. Decision-only aliases appear in the decision selector, and embedding aliases are excluded from both play selectors. The application currently uses finite-choice questions for Decisions API integrations.

After saving a provider, the upper **Refresh list** button (`목록 새로고침`) queries registered servers and saves new models as aliases. Existing aliases, their custom names and purposes, and saved world selections are retained. A failed server does not prevent other available providers from contributing models. Opening the settings alone does not import aliases. Within Provider management, **Fetch server models** adds editable drafts; save the provider to register those drafts.

### Structured output compatibility

Choose **JSON Schema** or **JSON object** under the provider's advanced API options. JSON object mode also sends schema instructions in the conversation. Both modes use the same application-side validation; malformed output is not accepted as plain text.

For OpenAI-compatible JSON Schema servers such as ArliAI, requests omit the unsupported array constraints `contains`, `minContains`, and `uniqueItems`. The app still validates fresh-event evidence and allowed event IDs and normalizes duplicate evidence IDs. Other schema constraints remain in the request.

A successful Geniex `/decisions` request does **not** establish that its `/chat/completions` endpoint can enforce the required output format. If reflection or action generation repeatedly fails JSON validation, use a generation server with working structured output while keeping Geniex for decisions. A standalone `llama-server` can be registered as an OpenAI-compatible generation provider; validate it with the chosen model and output mode before using it for a session.

Provider settings are shared across worlds, while model selections belong to each world. Accepted jobs pin their provider routes and models, including across server restarts. Apply new settings and use the manual retry control to retry a failed job with the current configuration.

See [Providers and model aliases](docs/PROVIDERS.md) for setup, choice limits, authentication, configuration files, retries, and inference diagnostics.

## Playing

The first launch opens **The Theater After the Rain** (`비가 그친 뒤의 극장`). Characters and objects respond to events in the current scene; offstage characters are not simulated independently.

- **Speak or act:** enter `*nods* "Let's begin."`. Asterisks mark actions, and straight or curly double quotes mark speech. Unmarked text is treated as speech. Mixed input preserves its original order; a single submission advances game time by one minute.
- **Choose a recipient:** address everyone present or a specific character. Fewer than eight characters use selectable tags; eight or more use a dropdown. Characters in other scenes do not receive the input.
- **Interact or move:** use the available object interactions and connected exits. Declared rules apply state changes, and companions follow as the same instances. Freeform action text alone does not execute movement or object effects.
- **Watch for a while** (`잠시 지켜본다`): advance game time by five minutes and let the scene react. This also works during a player reply window.
- **Pause and resume:** pause automatic progression while retaining confirmed events and queued input, then resume from the saved position.

When a character speaks to the player, progression waits up to **five real-world minutes** for a reply. A countdown appears above the input. Sending a reply continues immediately; an unsent draft does not count as a reply. **Continue now** (`지금 이어가기`) skips only the reply window, without advancing game time or inventing player dialogue. The deadline survives refreshes and restarts.

Each generated expression contains **one to six ordered action or speech parts**. They can appear independently or consecutively; action/dialogue pairs are not required. Consecutive events by the same character in the same scene render as one group, even across turns. Recipient changes remain visible within that group.

Characters receive opportunities according to reaction speed, talkativeness, and current arousal. They may act, watch, continue their existing activity, or remain idle. Newly witnessed events can update private relationships and memories before a character decides whether to act. Exact repetitions of a character's last actual action are suppressed without duplicating events or effects.

Confirmed expressions appear as they are committed; the interface does not display unfinished JSON or raw token streams. The transcript follows new events when you are near the bottom and preserves your reading position when you scroll back. System, dark, and light themes and story font sizes are available in the **Appearance** (`화면`) menu and are remembered in the browser.

If generation fails after automatic retries, apply any model or provider corrections and use the retry control in the status area. Confirmed events, memories, queued input, and consumed game time are preserved. A retry does not resubmit the player's turn.

## Creating and editing worlds

The workshop at `/lores` provides tabs for worlds, scenes, character/object templates, placements and relationships, and advanced rules. Edit current state separately from the story's starting state. Object interactions and automatic reactions can be authored in the advanced editor.

Unsaved edits survive tab, search, and relationship-target changes within the editor. Drafts are **not autosaved**: save each edited item before leaving. The workshop shows unsaved changes and asks before navigation or refresh would discard them.

World progress is saved automatically. Each world also has three manual save slots containing its definition, instance state, memories, and events. Export a world with its progress and slots as JSON, or download the performance transcript as Markdown.

### Bundled worlds

Import a preset through the workshop to start a separate world. The source files and background guides are included for further editing.

| World | Setting | Contents | Files |
| --- | --- | --- | --- |
| The Theater After the Rain | A small theater and its residents | 3 scenes, 3 characters, 2 objects | [Import preset](static/lore-presets/theater-opening.json) |
| Solbit High: Ten Days Until the Autumn Festival | Korean school life, clubs, a festival, and a light mystery | 44 scenes, 25 characters, 49 objects | [Import preset](static/lore-presets/solbit-high.json) · [Source](lore-sources/solbit-high.json) · [Guide](docs/SOLBIT_HIGH.md) |
| Haon University: A First Semester at Twenty-One | Adult campus romance and a first group assignment | 29 scenes, 10 characters, 38 objects | [Import preset](static/lore-presets/haon-university.json) · [Source](lore-sources/haon-university.json) · [Guide](docs/HAON_UNIVERSITY.md) |

See the [Workshop guide](docs/EDITOR_GUIDE.md) and [World JSON guide](docs/LORE_JSON_GUIDE.md) for authoring details.

## Optional illustrations

At `/images`, create named presets for **OpenAI, xAI, OpenRouter, or ComfyUI**, then select a preset in the session's model and illustration settings. Presets own the image server, model, style, and options. The world's lorebook owns the natural-language generation conditions and prompt instructions.

After story progress is committed, the decision model selects whether to illustrate it. If approved, the generation model writes a tag-based or natural-language prompt, and the selected image provider creates the illustration. Images are stored in SQLite and displayed alongside the transcript. ComfyUI uses `SaveImageWebsocket` output.

Automatic illustration requests require both a selected preset and nonempty world conditions. See [Image generation](docs/IMAGE_GENERATION.md) for provider configuration and workflow requirements.

## Configuration and local data

The optional `data/models.json` file overrides corresponding environment defaults. Use `NEWERA_MODEL_CONFIG` to choose another path. Provider registration is stored separately in `data/providers.json` and can be edited through the interface.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEWERA_OEV_BASE_URL` | `http://macstudio:12821/v1` | Initial default OEV address, used before a provider registry is saved. |
| `NEWERA_DECISION_MODEL` | `gemma4-26b` | Default decision model or `provider-id::alias-id` reference. |
| `NEWERA_TEXT_MODEL` | Decision model | Default generation and reflection model or alias reference. |
| `NEWERA_DECISION_TIMEOUT_MS` | `120000` | Per-request timeout for model discovery and decisions. |
| `NEWERA_LLM_TIMEOUT_MS` | `120000` | Per-request timeout for Chat Completions. |
| `NEWERA_PLAYER_REPLY_TIMEOUT_MS` | `300000` | Real-time player reply window; `0` disables it, maximum `300000`. |
| `NEWERA_GENERATION_HISTORY_TOKENS` | `32768` | Estimated history-token budget for action/dialogue generation. |
| `NEWERA_MAX_RETRIES` | `2` | Additional attempts for retryable failures; `0` disables retries. |
| `NEWERA_RETRY_BASE_MS` / `NEWERA_RETRY_MAX_MS` | `1000` / `8000` | Exponential retry backoff settings. |
| `NEWERA_DATA_DIR` | `./data` | SQLite database and default configuration directory. |
| `NEWERA_MODEL_CONFIG` | `<data>/models.json` | Optional runtime model settings file. |
| `NEWERA_PROVIDER_CONFIG` | `<data>/providers.json` | Provider registry file. |
| `NEWERA_MEMORY_ENABLED` | `true` | Enable long-term memory retrieval. |

Valid model settings and provider files are reread for new jobs and manual retries; existing jobs retain their accepted snapshots. After a registry has been saved, edit the default provider's address there rather than changing only `NEWERA_OEV_BASE_URL`. Environment variables, configuration-file path changes, and the SQLite data directory require a server restart.

Character memory combines recent witnessed events with optional **LanceDB BM25 and embedding retrieval**. Embedding failures fall back to BM25; broader retrieval failures are reported separately. Embeddings can use their own provider alias. See [Memory search](docs/MEMORY_SEARCH.md) and [Generation history](docs/GENERATION_HISTORY.md) for retrieval settings and context budgets.

Worlds, progress, slots, generation jobs, and illustrations are stored in `data/newera.sqlite`. The supported import/export format is **`newera-theater`, version 2**; older formats are not automatically migrated. Memory indexes live separately under `data/memory-lance` by default.

**Keep local settings and database backups private.** Directly entered provider keys are stored in the local provider file, and resolved keys are retained in server-side job snapshots for recovery. These credentials are excluded from page data, world exports, and transcript exports.

The server emits structured JSON logs with request IDs, provider/model details, API type, timings, usage when available, and validation/retry diagnostics. Raw conversations, private memos, model output, reasoning content, and API keys are not logged. The legacy `[OEV]` event label is also used for other providers; inspect the provider and `decisionApi` fields to identify the actual route.

## Development and validation

```powershell
npm run check
npm test
npm run test:integration
```

`check` runs Svelte/TypeScript diagnostics. `test` runs the unit suites. `test:integration` builds the app and runs integration tests with local fixture servers and isolated data directories; it does not establish compatibility with every external model server.

The repository also includes lore authoring commands:

```powershell
npm run lore:build -- skills/newera-lore-authoring/assets/example-source.json output.json
npm run lore:validate -- output.json
```

## Further documentation

The detailed guides are currently in Korean.

- [Product structure and runtime rules](docs/PRODUCT.md)
- [Providers, API contracts, retries, and logs](docs/PROVIDERS.md)
- [Workshop guide](docs/EDITOR_GUIDE.md) and [World JSON format](docs/LORE_JSON_GUIDE.md)
- [Character relationships](docs/CHARACTER_RELATIONSHIPS.md) and [Character presentation](docs/CHARACTER_PRESENTATION.md)
- [Reaction speed](docs/REACTION_SPEED_DESIGN.md) and [Bundled reaction profiles](docs/LORE_REACTION_PROFILES.md)
- [Memory search](docs/MEMORY_SEARCH.md) and [Generation history](docs/GENERATION_HISTORY.md)
- [Image generation](docs/IMAGE_GENERATION.md)
- [Reactive scene design](docs/REACTIVE_SCENE_DESIGN.md) and [Conversation context proposal](docs/CONVERSATION_CONTEXT_DESIGN.md)

Design documents include proposals as well as delivered behavior. Semantic conversation goals and a separate character planning/expression pipeline remain proposed work; the implemented timed player reply window is described above.

## License

This project is licensed under the Mozilla Public License 2.0. See [LICENSE](LICENSE) for the full text.
