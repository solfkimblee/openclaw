# OpenClaw Gateway API Reference

> Auto-generated from TypeBox schemas. Do not edit manually.
>
> Protocol version: 3 | Generated: 2026-02-10

## Table of Contents

- [System](#system)
- [Chat & Messaging](#chat-messaging)
- [Agents & Models](#agents-models)
- [Sessions](#sessions)
- [Configuration](#configuration)
- [Channels](#channels)
- [Text-to-Speech](#text-to-speech)
- [Skills](#skills)
- [Cron Jobs](#cron-jobs)
- [Nodes](#nodes)
- [Devices](#devices)
- [Execution Approvals](#execution-approvals)
- [Setup Wizard](#setup-wizard)
- [Usage & Cost](#usage-cost)

## Protocol Overview

The Gateway communicates over **WebSocket** using JSON-RPC style frames:

```jsonc
// Request → server
{ "type": "req", "id": "1", "method": "chat.send", "params": { ... } }

// Response ← server
{ "type": "res", "id": "1", "ok": true, "payload": { ... } }

// Event ← server (push)
{ "type": "event", "event": "chat", "payload": { ... } }
```

### Authorization Scopes

| Scope                | Description                                 |
| -------------------- | ------------------------------------------- |
| `operator.admin`     | Full access to all methods                  |
| `operator.read`      | Read-only methods (status, list, get)       |
| `operator.write`     | Read + write methods (send, invoke, toggle) |
| `operator.approvals` | Execution approval request/resolve          |
| `operator.pairing`   | Device and node pairing operations          |
| `node` role          | Methods callable by paired nodes only       |

---

## System

### `health`

Return a health snapshot of the gateway and connected channels.

**Scope:** `operator.read`

**Params:** none

---

### `status`

Return the full gateway state snapshot.

**Scope:** `operator.read`

**Params:** none

**Result** (`Snapshot`):

| Field             | Type           | Required |
| ----------------- | -------------- | -------- |
| `presence`        | array          | Yes      |
| `health`          | unknown        | Yes      |
| `stateVersion`    | object         | Yes      |
| `uptimeMs`        | integer, min:0 | Yes      |
| `configPath`      | string, min:1  | No       |
| `stateDir`        | string, min:1  | No       |
| `sessionDefaults` | object         | No       |

---

### `logs.tail`

Stream recent log lines from the gateway log file.

**Scope:** `operator.read`

**Params** (`LogsTailParams`):

| Field      | Type                        | Required |
| ---------- | --------------------------- | -------- |
| `cursor`   | integer, min:0              | No       |
| `limit`    | integer, min:1, max:5000    | No       |
| `maxBytes` | integer, min:1, max:1000000 | No       |

**Result** (`LogsTailResult`):

| Field       | Type           | Required |
| ----------- | -------------- | -------- |
| `file`      | string, min:1  | Yes      |
| `cursor`    | integer, min:0 | Yes      |
| `size`      | integer, min:0 | Yes      |
| `lines`     | array          | Yes      |
| `truncated` | boolean        | No       |
| `reset`     | boolean        | No       |

---

### `last-heartbeat`

Return the timestamp of the most recent heartbeat.

**Scope:** `operator.read`

**Params:** none

---

### `set-heartbeats`

Enable or disable periodic heartbeat ticks.

**Scope:** `operator.write`

**Params:** none

---

### `wake`

Trigger an immediate or next-heartbeat wake event.

**Scope:** `operator.write`

**Params** (`WakeParams`):

| Field  | Type                          | Required |
| ------ | ----------------------------- | -------- |
| `mode` | `"now"` \| `"next-heartbeat"` | Yes      |
| `text` | string, min:1                 | Yes      |

---

### `system-presence`

Return the list of connected client presence entries.

**Scope:** `operator.read`

**Params:** none

---

### `system-event`

Broadcast a system-level event to all connected clients.

**Scope:** `operator.write`

**Params:** none

---

### `update.run`

Trigger a self-update check and optionally apply the update.

**Scope:** `operator.admin`

**Params** (`UpdateRunParams`):

| Field            | Type           | Required |
| ---------------- | -------------- | -------- |
| `sessionKey`     | string         | No       |
| `note`           | string         | No       |
| `restartDelayMs` | integer, min:0 | No       |
| `timeoutMs`      | integer, min:1 | No       |

---

### `browser.request`

Submit a browser automation request to the Playwright controller.

**Scope:** `operator.write`

**Params:** none

---

## Chat & Messaging

### `chat.send`

Send a message to a session and receive streamed agent responses via events.

**Scope:** `operator.write`

**Params** (`ChatSendParams`):

| Field            | Type           | Required |
| ---------------- | -------------- | -------- |
| `sessionKey`     | string, min:1  | Yes      |
| `message`        | string         | Yes      |
| `thinking`       | string         | No       |
| `deliver`        | boolean        | No       |
| `attachments`    | array          | No       |
| `timeoutMs`      | integer, min:0 | No       |
| `idempotencyKey` | string, min:1  | Yes      |

---

### `chat.history`

Retrieve the message history for a session.

**Scope:** `operator.read`

**Params** (`ChatHistoryParams`):

| Field        | Type                     | Required |
| ------------ | ------------------------ | -------- |
| `sessionKey` | string, min:1            | Yes      |
| `limit`      | integer, min:1, max:1000 | No       |

---

### `chat.abort`

Abort an in-progress agent run for a session.

**Scope:** `operator.write`

**Params** (`ChatAbortParams`):

| Field        | Type          | Required |
| ------------ | ------------- | -------- |
| `sessionKey` | string, min:1 | Yes      |
| `runId`      | string, min:1 | No       |

---

### `send`

Send an outbound message to a channel peer (e.g. WhatsApp, Telegram).

**Scope:** `operator.write`

**Params** (`SendParams`):

| Field            | Type          | Required |
| ---------------- | ------------- | -------- |
| `to`             | string, min:1 | Yes      |
| `message`        | string, min:1 | Yes      |
| `mediaUrl`       | string        | No       |
| `mediaUrls`      | array         | No       |
| `gifPlayback`    | boolean       | No       |
| `channel`        | string        | No       |
| `accountId`      | string        | No       |
| `sessionKey`     | string        | No       |
| `idempotencyKey` | string, min:1 | Yes      |

---

### `agent`

Submit a message to the agent engine with full routing options.

**Scope:** `operator.write`

**Params** (`AgentParams`):

| Field               | Type                  | Required |
| ------------------- | --------------------- | -------- |
| `message`           | string, min:1         | Yes      |
| `agentId`           | string, min:1         | No       |
| `to`                | string                | No       |
| `replyTo`           | string                | No       |
| `sessionId`         | string                | No       |
| `sessionKey`        | string                | No       |
| `thinking`          | string                | No       |
| `deliver`           | boolean               | No       |
| `attachments`       | array                 | No       |
| `channel`           | string                | No       |
| `replyChannel`      | string                | No       |
| `accountId`         | string                | No       |
| `replyAccountId`    | string                | No       |
| `threadId`          | string                | No       |
| `groupId`           | string                | No       |
| `groupChannel`      | string                | No       |
| `groupSpace`        | string                | No       |
| `timeout`           | integer, min:0        | No       |
| `lane`              | string                | No       |
| `extraSystemPrompt` | string                | No       |
| `idempotencyKey`    | string, min:1         | Yes      |
| `label`             | string, min:1, max:64 | No       |
| `spawnedBy`         | string                | No       |

---

### `agent.identity.get`

Get the display identity (name, avatar, emoji) of an agent.

**Scope:** `operator.read`

**Params** (`AgentIdentityParams`):

| Field        | Type          | Required |
| ------------ | ------------- | -------- |
| `agentId`    | string, min:1 | No       |
| `sessionKey` | string        | No       |

**Result** (`AgentIdentityResult`):

| Field     | Type          | Required |
| --------- | ------------- | -------- |
| `agentId` | string, min:1 | Yes      |
| `name`    | string, min:1 | No       |
| `avatar`  | string, min:1 | No       |
| `emoji`   | string, min:1 | No       |

---

### `agent.wait`

Block until a specific agent run completes or times out.

**Scope:** `operator.write`

**Params** (`AgentWaitParams`):

| Field       | Type           | Required |
| ----------- | -------------- | -------- |
| `runId`     | string, min:1  | Yes      |
| `timeoutMs` | integer, min:0 | No       |

---

### `chat.inject`

Inject a synthetic message into a session transcript.

**Scope:** `operator.write`

**Params** (`ChatInjectParams`):

| Field        | Type            | Required |
| ------------ | --------------- | -------- |
| `sessionKey` | string, min:1   | Yes      |
| `message`    | string, min:1   | Yes      |
| `label`      | string, max:100 | No       |

---

### `poll`

Send a poll with multiple choice options to a channel peer.

**Scope:** `operator.write`

**Params** (`PollParams`):

| Field            | Type                   | Required |
| ---------------- | ---------------------- | -------- |
| `to`             | string, min:1          | Yes      |
| `question`       | string, min:1          | Yes      |
| `options`        | array                  | Yes      |
| `maxSelections`  | integer, min:1, max:12 | No       |
| `durationHours`  | integer, min:1         | No       |
| `channel`        | string                 | No       |
| `accountId`      | string                 | No       |
| `idempotencyKey` | string, min:1          | Yes      |

---

## Agents & Models

### `agents.list`

List all configured agents and the default agent ID.

**Scope:** `operator.read`

**Params:** none (empty object)

**Result** (`AgentsListResult`):

| Field       | Type                         | Required |
| ----------- | ---------------------------- | -------- |
| `defaultId` | string, min:1                | Yes      |
| `mainKey`   | string, min:1                | Yes      |
| `scope`     | `"per-sender"` \| `"global"` | Yes      |
| `agents`    | array                        | Yes      |

---

### `agents.create`

Create a new agent with a name and workspace directory.

**Scope:** `operator.admin`

**Params** (`AgentsCreateParams`):

| Field       | Type          | Required |
| ----------- | ------------- | -------- |
| `name`      | string, min:1 | Yes      |
| `workspace` | string, min:1 | Yes      |
| `emoji`     | string        | No       |
| `avatar`    | string        | No       |

**Result** (`AgentsCreateResult`):

| Field       | Type          | Required |
| ----------- | ------------- | -------- |
| `ok`        | `true`        | Yes      |
| `agentId`   | string, min:1 | Yes      |
| `name`      | string, min:1 | Yes      |
| `workspace` | string, min:1 | Yes      |

---

### `agents.update`

Update an existing agent's name, workspace, model, or avatar.

**Scope:** `operator.admin`

**Params** (`AgentsUpdateParams`):

| Field       | Type          | Required |
| ----------- | ------------- | -------- |
| `agentId`   | string, min:1 | Yes      |
| `name`      | string, min:1 | No       |
| `workspace` | string, min:1 | No       |
| `model`     | string, min:1 | No       |
| `avatar`    | string        | No       |

**Result** (`AgentsUpdateResult`):

| Field     | Type          | Required |
| --------- | ------------- | -------- |
| `ok`      | `true`        | Yes      |
| `agentId` | string, min:1 | Yes      |

---

### `agents.delete`

Delete an agent and optionally remove its workspace files.

**Scope:** `operator.admin`

**Params** (`AgentsDeleteParams`):

| Field         | Type          | Required |
| ------------- | ------------- | -------- |
| `agentId`     | string, min:1 | Yes      |
| `deleteFiles` | boolean       | No       |

**Result** (`AgentsDeleteResult`):

| Field             | Type           | Required |
| ----------------- | -------------- | -------- |
| `ok`              | `true`         | Yes      |
| `agentId`         | string, min:1  | Yes      |
| `removedBindings` | integer, min:0 | Yes      |

---

### `agents.files.list`

List configuration files for an agent's workspace.

**Scope:** `operator.read`

**Params** (`AgentsFilesListParams`):

| Field     | Type          | Required |
| --------- | ------------- | -------- |
| `agentId` | string, min:1 | Yes      |

**Result** (`AgentsFilesListResult`):

| Field       | Type          | Required |
| ----------- | ------------- | -------- |
| `agentId`   | string, min:1 | Yes      |
| `workspace` | string, min:1 | Yes      |
| `files`     | array         | Yes      |

---

### `agents.files.get`

Read the content of a specific agent configuration file.

**Scope:** `operator.read`

**Params** (`AgentsFilesGetParams`):

| Field     | Type          | Required |
| --------- | ------------- | -------- |
| `agentId` | string, min:1 | Yes      |
| `name`    | string, min:1 | Yes      |

**Result** (`AgentsFilesGetResult`):

| Field       | Type          | Required |
| ----------- | ------------- | -------- |
| `agentId`   | string, min:1 | Yes      |
| `workspace` | string, min:1 | Yes      |
| `file`      | object        | Yes      |

---

### `agents.files.set`

Write content to an agent configuration file.

**Scope:** `operator.admin`

**Params** (`AgentsFilesSetParams`):

| Field     | Type          | Required |
| --------- | ------------- | -------- |
| `agentId` | string, min:1 | Yes      |
| `name`    | string, min:1 | Yes      |
| `content` | string        | Yes      |

**Result** (`AgentsFilesSetResult`):

| Field       | Type          | Required |
| ----------- | ------------- | -------- |
| `ok`        | `true`        | Yes      |
| `agentId`   | string, min:1 | Yes      |
| `workspace` | string, min:1 | Yes      |
| `file`      | object        | Yes      |

---

### `models.list`

List all available AI models across configured providers.

**Scope:** `operator.read`

**Params:** none (empty object)

**Result** (`ModelsListResult`):

| Field    | Type  | Required |
| -------- | ----- | -------- |
| `models` | array | Yes      |

---

## Sessions

### `sessions.list`

List active sessions with optional filtering by agent, label, or search.

**Scope:** `operator.read`

**Params** (`SessionsListParams`):

| Field                  | Type                  | Required |
| ---------------------- | --------------------- | -------- |
| `limit`                | integer, min:1        | No       |
| `activeMinutes`        | integer, min:1        | No       |
| `includeGlobal`        | boolean               | No       |
| `includeUnknown`       | boolean               | No       |
| `includeDerivedTitles` | boolean               | No       |
| `includeLastMessage`   | boolean               | No       |
| `label`                | string, min:1, max:64 | No       |
| `spawnedBy`            | string, min:1         | No       |
| `agentId`              | string, min:1         | No       |
| `search`               | string                | No       |

---

### `sessions.preview`

Get a short transcript preview for one or more sessions.

**Scope:** `operator.read`

**Params** (`SessionsPreviewParams`):

| Field      | Type            | Required |
| ---------- | --------------- | -------- |
| `keys`     | array           | Yes      |
| `limit`    | integer, min:1  | No       |
| `maxChars` | integer, min:20 | No       |

---

### `sessions.patch`

Update session settings (label, model, thinking level, etc.).

**Scope:** `operator.admin`

**Params** (`SessionsPatchParams`):

| Field             | Type                                                   | Required |
| ----------------- | ------------------------------------------------------ | -------- |
| `key`             | string, min:1                                          | Yes      |
| `label`           | string, min:1, max:64 \| unknown                       | No       |
| `thinkingLevel`   | string, min:1 \| unknown                               | No       |
| `verboseLevel`    | string, min:1 \| unknown                               | No       |
| `reasoningLevel`  | string, min:1 \| unknown                               | No       |
| `responseUsage`   | `"off"` \| `"tokens"` \| `"full"` \| `"on"` \| unknown | No       |
| `elevatedLevel`   | string, min:1 \| unknown                               | No       |
| `execHost`        | string, min:1 \| unknown                               | No       |
| `execSecurity`    | string, min:1 \| unknown                               | No       |
| `execAsk`         | string, min:1 \| unknown                               | No       |
| `execNode`        | string, min:1 \| unknown                               | No       |
| `model`           | string, min:1 \| unknown                               | No       |
| `spawnedBy`       | string, min:1 \| unknown                               | No       |
| `sendPolicy`      | `"allow"` \| `"deny"` \| unknown                       | No       |
| `groupActivation` | `"mention"` \| `"always"` \| unknown                   | No       |

---

### `sessions.reset`

Clear the transcript and reset a session to its initial state.

**Scope:** `operator.admin`

**Params** (`SessionsResetParams`):

| Field | Type          | Required |
| ----- | ------------- | -------- |
| `key` | string, min:1 | Yes      |

---

### `sessions.delete`

Delete a session and optionally its transcript file.

**Scope:** `operator.admin`

**Params** (`SessionsDeleteParams`):

| Field              | Type          | Required |
| ------------------ | ------------- | -------- |
| `key`              | string, min:1 | Yes      |
| `deleteTranscript` | boolean       | No       |

---

### `sessions.resolve`

Resolve a session by key, ID, label, or agent, returning its metadata.

**Scope:** `operator.read`

**Params** (`SessionsResolveParams`):

| Field            | Type                  | Required |
| ---------------- | --------------------- | -------- |
| `key`            | string, min:1         | No       |
| `sessionId`      | string, min:1         | No       |
| `label`          | string, min:1, max:64 | No       |
| `agentId`        | string, min:1         | No       |
| `spawnedBy`      | string, min:1         | No       |
| `includeGlobal`  | boolean               | No       |
| `includeUnknown` | boolean               | No       |

---

### `sessions.compact`

Compact a session transcript by summarizing older messages.

**Scope:** `operator.admin`

**Params** (`SessionsCompactParams`):

| Field      | Type           | Required |
| ---------- | -------------- | -------- |
| `key`      | string, min:1  | Yes      |
| `maxLines` | integer, min:1 | No       |

---

## Configuration

### `config.get`

Read the current gateway configuration (full or a specific key path).

**Scope:** `operator.admin`

**Params:** none (empty object)

---

### `config.set`

Write a value to a specific configuration key path.

**Scope:** `operator.admin`

**Params** (`ConfigSetParams`):

| Field      | Type          | Required |
| ---------- | ------------- | -------- |
| `raw`      | string, min:1 | Yes      |
| `baseHash` | string, min:1 | No       |

---

### `config.apply`

Replace the full configuration object and reload.

**Scope:** `operator.admin`

**Params** (`ConfigApplyParams`):

| Field            | Type           | Required |
| ---------------- | -------------- | -------- |
| `raw`            | string, min:1  | Yes      |
| `baseHash`       | string, min:1  | No       |
| `sessionKey`     | string         | No       |
| `note`           | string         | No       |
| `restartDelayMs` | integer, min:0 | No       |

---

### `config.patch`

Deep-merge a partial configuration object into the current config.

**Scope:** `operator.admin`

**Params** (`ConfigPatchParams`):

| Field            | Type           | Required |
| ---------------- | -------------- | -------- |
| `raw`            | string, min:1  | Yes      |
| `baseHash`       | string, min:1  | No       |
| `sessionKey`     | string         | No       |
| `note`           | string         | No       |
| `restartDelayMs` | integer, min:0 | No       |

---

### `config.schema`

Return the JSON Schema for the gateway configuration.

**Scope:** `operator.admin`

**Params:** none (empty object)

**Result** (`ConfigSchemaResponse`):

| Field         | Type          | Required |
| ------------- | ------------- | -------- |
| `schema`      | unknown       | Yes      |
| `uiHints`     | object        | Yes      |
| `version`     | string, min:1 | Yes      |
| `generatedAt` | string, min:1 | Yes      |

---

## Channels

### `channels.status`

Return the connection status of all or a specific messaging channel.

**Scope:** `operator.read`

**Params** (`ChannelsStatusParams`):

| Field       | Type           | Required |
| ----------- | -------------- | -------- |
| `probe`     | boolean        | No       |
| `timeoutMs` | integer, min:0 | No       |

**Result** (`ChannelsStatusResult`):

| Field                     | Type           | Required |
| ------------------------- | -------------- | -------- |
| `ts`                      | integer, min:0 | Yes      |
| `channelOrder`            | array          | Yes      |
| `channelLabels`           | object         | Yes      |
| `channelDetailLabels`     | object         | No       |
| `channelSystemImages`     | object         | No       |
| `channelMeta`             | array          | No       |
| `channels`                | object         | Yes      |
| `channelAccounts`         | object         | Yes      |
| `channelDefaultAccountId` | object         | Yes      |

---

### `channels.logout`

Disconnect and log out of a messaging channel.

**Scope:** `operator.admin`

**Params** (`ChannelsLogoutParams`):

| Field       | Type          | Required |
| ----------- | ------------- | -------- |
| `channel`   | string, min:1 | Yes      |
| `accountId` | string        | No       |

---

### `talk.mode`

Enable, disable, or toggle voice talk mode.

**Scope:** `operator.write`

**Params** (`TalkModeParams`):

| Field     | Type    | Required |
| --------- | ------- | -------- |
| `enabled` | boolean | Yes      |
| `phase`   | string  | No       |

---

### `web.login.start`

Initiate a web-based login flow for channel authentication.

**Scope:** `operator.admin`

**Params** (`WebLoginStartParams`):

| Field       | Type           | Required |
| ----------- | -------------- | -------- |
| `force`     | boolean        | No       |
| `timeoutMs` | integer, min:0 | No       |
| `verbose`   | boolean        | No       |
| `accountId` | string         | No       |

---

### `web.login.wait`

Wait for a web-based login flow to complete.

**Scope:** `operator.admin`

**Params** (`WebLoginWaitParams`):

| Field       | Type           | Required |
| ----------- | -------------- | -------- |
| `timeoutMs` | integer, min:0 | No       |
| `accountId` | string         | No       |

---

### `voicewake.get`

Get the current voice wake-word configuration.

**Scope:** `operator.read`

**Params:** none

---

### `voicewake.set`

Set or update the voice wake-word configuration.

**Scope:** `operator.write`

**Params:** none

---

## Text-to-Speech

### `tts.status`

Return the current text-to-speech engine status.

**Scope:** `operator.read`

**Params:** none

---

### `tts.providers`

List available TTS provider engines.

**Scope:** `operator.read`

**Params:** none

---

### `tts.enable`

Enable text-to-speech output.

**Scope:** `operator.write`

**Params:** none

---

### `tts.disable`

Disable text-to-speech output.

**Scope:** `operator.write`

**Params:** none

---

### `tts.convert`

Convert a text string to speech audio.

**Scope:** `operator.write`

**Params:** none

---

### `tts.setProvider`

Switch the active TTS provider engine.

**Scope:** `operator.write`

**Params:** none

---

## Skills

### `skills.status`

Return installed skills and their enabled/disabled status.

**Scope:** `operator.read`

**Params** (`SkillsStatusParams`):

| Field     | Type          | Required |
| --------- | ------------- | -------- |
| `agentId` | string, min:1 | No       |

---

### `skills.bins`

List skill binary paths available on the host node.

**Scope:** `node` role

**Params:** none (empty object)

**Result** (`SkillsBinsResult`):

| Field  | Type  | Required |
| ------ | ----- | -------- |
| `bins` | array | Yes      |

---

### `skills.install`

Install a skill package by name.

**Scope:** `operator.admin`

**Params** (`SkillsInstallParams`):

| Field       | Type              | Required |
| ----------- | ----------------- | -------- |
| `name`      | string, min:1     | Yes      |
| `installId` | string, min:1     | Yes      |
| `timeoutMs` | integer, min:1000 | No       |

---

### `skills.update`

Update a skill's enabled state, API key, or environment variables.

**Scope:** `operator.admin`

**Params** (`SkillsUpdateParams`):

| Field      | Type          | Required |
| ---------- | ------------- | -------- |
| `skillKey` | string, min:1 | Yes      |
| `enabled`  | boolean       | No       |
| `apiKey`   | string        | No       |
| `env`      | object        | No       |

---

## Cron Jobs

### `cron.list`

List all scheduled cron jobs.

**Scope:** `operator.read`

**Params** (`CronListParams`):

| Field             | Type    | Required |
| ----------------- | ------- | -------- |
| `includeDisabled` | boolean | No       |

---

### `cron.status`

Get the status and next run time of a specific cron job.

**Scope:** `operator.read`

**Params:** none (empty object)

---

### `cron.add`

Create a new scheduled cron job.

**Scope:** `operator.admin`

**Params** (`CronAddParams`):

| Field            | Type                          | Required |
| ---------------- | ----------------------------- | -------- |
| `name`           | string, min:1                 | Yes      |
| `agentId`        | string, min:1 \| unknown      | No       |
| `description`    | string                        | No       |
| `enabled`        | boolean                       | No       |
| `deleteAfterRun` | boolean                       | No       |
| `schedule`       | object \| object \| object    | Yes      |
| `sessionTarget`  | `"main"` \| `"isolated"`      | Yes      |
| `wakeMode`       | `"next-heartbeat"` \| `"now"` | Yes      |
| `payload`        | object \| object              | Yes      |
| `delivery`       | object                        | No       |

---

### `cron.update`

Update an existing cron job's schedule or configuration.

**Scope:** `operator.admin`

**Params:** none (empty object)

---

### `cron.remove`

Delete a scheduled cron job.

**Scope:** `operator.admin`

**Params:** none (empty object)

---

### `cron.run`

Manually trigger a cron job to run immediately.

**Scope:** `operator.admin`

**Params:** none (empty object)

---

### `cron.runs`

List recent execution history for a cron job.

**Scope:** `operator.read`

**Params:** none (empty object)

---

## Nodes

### `node.pair.request`

Initiate a pairing request from a remote node.

**Scope:** `operator.pairing`

**Params** (`NodePairRequestParams`):

| Field             | Type          | Required |
| ----------------- | ------------- | -------- |
| `nodeId`          | string, min:1 | Yes      |
| `displayName`     | string, min:1 | No       |
| `platform`        | string, min:1 | No       |
| `version`         | string, min:1 | No       |
| `coreVersion`     | string, min:1 | No       |
| `uiVersion`       | string, min:1 | No       |
| `deviceFamily`    | string, min:1 | No       |
| `modelIdentifier` | string, min:1 | No       |
| `caps`            | array         | No       |
| `commands`        | array         | No       |
| `remoteIp`        | string, min:1 | No       |
| `silent`          | boolean       | No       |

---

### `node.pair.list`

List pending and approved node pairing entries.

**Scope:** `operator.pairing`

**Params:** none (empty object)

---

### `node.pair.approve`

Approve a pending node pairing request.

**Scope:** `operator.pairing`

**Params** (`NodePairApproveParams`):

| Field       | Type          | Required |
| ----------- | ------------- | -------- |
| `requestId` | string, min:1 | Yes      |

---

### `node.pair.reject`

Reject a pending node pairing request.

**Scope:** `operator.pairing`

**Params** (`NodePairRejectParams`):

| Field       | Type          | Required |
| ----------- | ------------- | -------- |
| `requestId` | string, min:1 | Yes      |

---

### `node.pair.verify`

Verify a node's pairing status using its public key.

**Scope:** `operator.pairing`

**Params** (`NodePairVerifyParams`):

| Field    | Type          | Required |
| -------- | ------------- | -------- |
| `nodeId` | string, min:1 | Yes      |
| `token`  | string, min:1 | Yes      |

---

### `node.rename`

Rename a paired node's display name.

**Scope:** `operator.pairing`

**Params** (`NodeRenameParams`):

| Field         | Type          | Required |
| ------------- | ------------- | -------- |
| `nodeId`      | string, min:1 | Yes      |
| `displayName` | string, min:1 | Yes      |

---

### `node.list`

List all paired and connected nodes.

**Scope:** `operator.read`

**Params:** none (empty object)

---

### `node.describe`

Get detailed information about a specific node.

**Scope:** `operator.read`

**Params** (`NodeDescribeParams`):

| Field    | Type          | Required |
| -------- | ------------- | -------- |
| `nodeId` | string, min:1 | Yes      |

---

### `node.invoke`

Invoke a tool or skill on a remote paired node.

**Scope:** `operator.write`

**Params** (`NodeInvokeParams`):

| Field            | Type           | Required |
| ---------------- | -------------- | -------- |
| `nodeId`         | string, min:1  | Yes      |
| `command`        | string, min:1  | Yes      |
| `params`         | unknown        | No       |
| `timeoutMs`      | integer, min:0 | No       |
| `idempotencyKey` | string, min:1  | Yes      |

---

### `node.invoke.result`

Return the result of a node invocation (sent by the node).

**Scope:** `node` role

**Params** (`NodeInvokeResultParams`):

| Field         | Type          | Required |
| ------------- | ------------- | -------- |
| `id`          | string, min:1 | Yes      |
| `nodeId`      | string, min:1 | Yes      |
| `ok`          | boolean       | Yes      |
| `payload`     | unknown       | No       |
| `payloadJSON` | string        | No       |
| `error`       | object        | No       |

---

### `node.event`

Emit an event from a remote node to the gateway.

**Scope:** `node` role

**Params** (`NodeEventParams`):

| Field         | Type          | Required |
| ------------- | ------------- | -------- |
| `event`       | string, min:1 | Yes      |
| `payload`     | unknown       | No       |
| `payloadJSON` | string        | No       |

---

## Devices

### `device.pair.list`

List pending and approved device pairing entries.

**Scope:** `operator.pairing`

**Params:** none (empty object)

---

### `device.pair.approve`

Approve a pending device pairing request.

**Scope:** `operator.pairing`

**Params** (`DevicePairApproveParams`):

| Field       | Type          | Required |
| ----------- | ------------- | -------- |
| `requestId` | string, min:1 | Yes      |

---

### `device.pair.reject`

Reject a pending device pairing request.

**Scope:** `operator.pairing`

**Params** (`DevicePairRejectParams`):

| Field       | Type          | Required |
| ----------- | ------------- | -------- |
| `requestId` | string, min:1 | Yes      |

---

### `device.token.rotate`

Rotate the authentication token for a paired device.

**Scope:** `operator.pairing`

**Params** (`DeviceTokenRotateParams`):

| Field      | Type          | Required |
| ---------- | ------------- | -------- |
| `deviceId` | string, min:1 | Yes      |
| `role`     | string, min:1 | Yes      |
| `scopes`   | array         | No       |

---

### `device.token.revoke`

Revoke a device's authentication token, disconnecting it.

**Scope:** `operator.pairing`

**Params** (`DeviceTokenRevokeParams`):

| Field      | Type          | Required |
| ---------- | ------------- | -------- |
| `deviceId` | string, min:1 | Yes      |
| `role`     | string, min:1 | Yes      |

---

## Execution Approvals

### `exec.approvals.get`

Get the current execution approval policy snapshot.

**Scope:** `operator.admin`

**Params:** none (empty object)

**Result** (`ExecApprovalsSnapshot`):

| Field    | Type          | Required |
| -------- | ------------- | -------- |
| `path`   | string, min:1 | Yes      |
| `exists` | boolean       | Yes      |
| `hash`   | string, min:1 | Yes      |
| `file`   | object        | Yes      |

---

### `exec.approvals.set`

Set the execution approval policy.

**Scope:** `operator.admin`

**Params** (`ExecApprovalsSetParams`):

| Field      | Type          | Required |
| ---------- | ------------- | -------- |
| `file`     | object        | Yes      |
| `baseHash` | string, min:1 | No       |

---

### `exec.approvals.node.get`

Get the execution approval policy for a specific node.

**Scope:** `operator.admin`

**Params** (`ExecApprovalsNodeGetParams`):

| Field    | Type          | Required |
| -------- | ------------- | -------- |
| `nodeId` | string, min:1 | Yes      |

---

### `exec.approvals.node.set`

Set the execution approval policy for a specific node.

**Scope:** `operator.admin`

**Params** (`ExecApprovalsNodeSetParams`):

| Field      | Type          | Required |
| ---------- | ------------- | -------- |
| `nodeId`   | string, min:1 | Yes      |
| `file`     | object        | Yes      |
| `baseHash` | string, min:1 | No       |

---

### `exec.approval.request`

Request execution approval for a pending tool invocation.

**Scope:** `operator.approvals`

**Params** (`ExecApprovalRequestParams`):

| Field          | Type              | Required |
| -------------- | ----------------- | -------- |
| `id`           | string, min:1     | No       |
| `command`      | string, min:1     | Yes      |
| `cwd`          | string \| unknown | No       |
| `host`         | string \| unknown | No       |
| `security`     | string \| unknown | No       |
| `ask`          | string \| unknown | No       |
| `agentId`      | string \| unknown | No       |
| `resolvedPath` | string \| unknown | No       |
| `sessionKey`   | string \| unknown | No       |
| `timeoutMs`    | integer, min:1    | No       |

---

### `exec.approval.resolve`

Approve or deny a pending execution approval request.

**Scope:** `operator.approvals`

**Params** (`ExecApprovalResolveParams`):

| Field      | Type          | Required |
| ---------- | ------------- | -------- |
| `id`       | string, min:1 | Yes      |
| `decision` | string, min:1 | Yes      |

---

## Setup Wizard

### `wizard.start`

Start the interactive setup wizard.

**Scope:** `operator.admin`

**Params** (`WizardStartParams`):

| Field       | Type                    | Required |
| ----------- | ----------------------- | -------- |
| `mode`      | `"local"` \| `"remote"` | No       |
| `workspace` | string                  | No       |

**Result** (`WizardStartResult`):

| Field       | Type                                                  | Required |
| ----------- | ----------------------------------------------------- | -------- |
| `sessionId` | string, min:1                                         | Yes      |
| `done`      | boolean                                               | Yes      |
| `step`      | object                                                | No       |
| `status`    | `"running"` \| `"done"` \| `"cancelled"` \| `"error"` | No       |
| `error`     | string                                                | No       |

---

### `wizard.next`

Submit the current wizard step and advance to the next.

**Scope:** `operator.admin`

**Params** (`WizardNextParams`):

| Field       | Type          | Required |
| ----------- | ------------- | -------- |
| `sessionId` | string, min:1 | Yes      |
| `answer`    | object        | No       |

**Result** (`WizardNextResult`):

| Field    | Type                                                  | Required |
| -------- | ----------------------------------------------------- | -------- |
| `done`   | boolean                                               | Yes      |
| `step`   | object                                                | No       |
| `status` | `"running"` \| `"done"` \| `"cancelled"` \| `"error"` | No       |
| `error`  | string                                                | No       |

---

### `wizard.cancel`

Cancel the in-progress setup wizard.

**Scope:** `operator.admin`

**Params** (`WizardCancelParams`):

| Field       | Type          | Required |
| ----------- | ------------- | -------- |
| `sessionId` | string, min:1 | Yes      |

---

### `wizard.status`

Get the current status and step of the setup wizard.

**Scope:** `operator.read`

**Params** (`WizardStatusParams`):

| Field       | Type          | Required |
| ----------- | ------------- | -------- |
| `sessionId` | string, min:1 | Yes      |

**Result** (`WizardStatusResult`):

| Field    | Type                                                  | Required |
| -------- | ----------------------------------------------------- | -------- |
| `status` | `"running"` \| `"done"` \| `"cancelled"` \| `"error"` | Yes      |
| `error`  | string                                                | No       |

---

## Usage & Cost

### `sessions.usage`

Return token usage summary for one or all sessions.

**Scope:** `operator.read`

**Params** (`SessionsUsageParams`):

| Field                  | Type                                  | Required |
| ---------------------- | ------------------------------------- | -------- |
| `key`                  | string, min:1                         | No       |
| `startDate`            | string, pattern:`^\d{4}-\d{2}-\d{2}$` | No       |
| `endDate`              | string, pattern:`^\d{4}-\d{2}-\d{2}$` | No       |
| `limit`                | integer, min:1                        | No       |
| `includeContextWeight` | boolean                               | No       |

---

### `sessions.usage.timeseries`

Return time-series usage data for a session.

**Scope:** `operator.read`

**Params:** none

---

### `sessions.usage.logs`

Return detailed usage logs for a session.

**Scope:** `operator.read`

**Params:** none

---

### `usage.status`

Return a summary of token usage across sessions.

**Scope:** `operator.read`

**Params:** none

---

### `usage.cost`

Return estimated cost breakdown by model and session.

**Scope:** `operator.read`

**Params:** none

---
