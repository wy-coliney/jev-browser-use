# Jev provider configuration

Read this when installing the skill, changing providers or credentials, or diagnosing API integration failures. Normal browser tasks call `loadConfig()` and do not choose or switch providers themselves.

The installer chooses a supported adapter. The skill does not prefer one provider over another and never falls back automatically.

## Configuration file

Create `~/.config/jev-browser-use/config.json`. It contains only:

- `envFile`: absolute path to a local dotenv file holding the selected provider credential.
- `provider`: a supported adapter ID.
- `model`: the Jev model identifier accepted by that adapter.

Credentials must remain in the referenced dotenv file and must never be copied into `config.json`, the Skill directory, browser pages, logs, or traces.

## Supported adapters

### Official TypeSafe endpoint

```json
{
  "envFile": "/absolute/path/to/your/credentials.env",
  "provider": "typesafe",
  "model": "jev-latest"
}
```

The adapter reads `TYPESAFE_API_KEY` and uses the fixed TypeSafe SystemOne endpoint.

### OpenRouter Decisions endpoint

```json
{
  "envFile": "/absolute/path/to/your/credentials.env",
  "provider": "openrouter",
  "model": "~typesafe/jev-latest"
}
```

The adapter reads `OPENROUTER_API_KEY` (lowercase `openrouter_api_key` is also accepted) and uses OpenRouter's Decisions endpoint. The leading `~` requests the latest compatible Jev release.

## Shared behavior

- Both adapters use Bearer authentication, reject redirects, validate the returned choice schema, confidence, probabilities, and model identity, and keep credentials out of the decision body.
- A transport failure may be retried once within the same bounded run using the same adapter and model. Authentication, schema, and quota failures are not retried.
- Missing credentials are configuration errors. Do not search unrelated files or silently switch adapters.
- Browser tasks should spread `loadConfig()` into `createSession()` or `run()` unchanged. Provider changes belong to installation or maintenance, not task execution.

## Diagnose failures by stage

- If `mcp__cua_repl.js` is absent, follow the [direct-tool discovery and first probe](../SKILL.md#discover-the-browser-tool-correctly--required-before-declaring-it-unavailable). Searching `functions.exec`'s deferred tools cannot establish whether CUA is available.
- If Chrome attachment rejects a login mode, the failure is in the browser connector before any Jev provider request. Use the in-app browser when the task permits it, or report the Chrome connector error with the Codex/CUA version; do not change Jev credentials to fix browser login.
- If a provider request reports `DNS lookup failed in this runtime (ENOTFOUND)`, run the [credential-free CUA transport probe](../SKILL.md#check-provider-transport-inside-cua). No provider response or authentication result was received. Shell connectivity does not establish CUA connectivity.
- HTTP 401/403 comes from a reached provider and calls for checking the selected adapter, credential, and account access without printing the secret.

## References

- [TypeSafe documentation](https://docs.typesafe.ai/introduction)
- [OpenRouter Jev latest](https://openrouter.ai/~typesafe/jev-latest)
- [OpenRouter Decisions schema](https://openrouter.ai/openapi.json)
- [Browser Use Jev example](https://github.com/browser-use/jev-ultrafast)
