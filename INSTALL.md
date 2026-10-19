# Agent installation

Follow these steps when the user asks to install or update Jev Browser Use for Codex.

If the user requests a Codex plugin or marketplace installation, use:

```sh
codex plugin marketplace add wy-coliney/jev-browser-use
codex plugin add jev-browser-use@jev-browser-use
```

Check `codex plugin --help` first. For older clients without that command, use the npx route below. Choose one installation route, preserve existing Jev configuration, and restart Codex after plugin installation. Do not also install a duplicate standalone Skill.

For the standard Skill installer, use:

```sh
npx skills add wy-coliney/jev-browser-use --skill jev-browser-use -g -a codex -y
```

Use `-a claude-code` only when the user requests Claude Code. Installation is supported, but Claude browser execution is not yet integrated. Omit `-g` for a requested project-local installation. Then help configure the provider using the [configuration guide](skills/jev-browser-use/references/provider-configuration.md), preserving any existing settings. This CLI installs files, not API credentials or browser permissions.

For manual installation and guided API setup:

1. Check Node.js 22+ and Git are available.
2. Clone `https://github.com/wy-coliney/jev-browser-use.git` into a new temporary directory.
3. From that checkout, run `node scripts/install.mjs --no-config`. This installs to `~/.agents/skills/jev-browser-use` without interactive prompts or changing existing settings.
4. If `~/.config/jev-browser-use/config.json` already exists, preserve it. Otherwise, ask which provider the user wants (`typesafe`, `openrouter`, or `opencode`) and the absolute path to their local credential dotenv file. Never ask for a key in chat or print the file.
5. Configure using the installer's exported function, run from the checkout with `node --input-type=module`:

```js
import { install } from './scripts/install.mjs';
await install({
  config: {
    provider: 'typesafe',
    model: 'jev-latest',
    envFile: '/absolute/path/to/existing/credentials.env',
  },
});
```

Use the user's chosen settings and the default model for their provider (`jev-latest` for TypeSafe, `~typesafe/jev-latest` for OpenRouter, or `jev-1.13-free` for OpenCode Console). Pass paths safely, not as unescaped shell substitutions. See [provider configuration](skills/jev-browser-use/references/provider-configuration.md) for credential variable names. If API access is not ready, finish installing and report configuration as pending.

Confirm the installed `SKILL.md` and `bridge.mjs` match `skills/jev-browser-use/` in the checkout, then remove only the temporary directory you created. Report installation and configuration status separately; no paid API test is needed.

The user needs Computer Use MCP and Chrome or Codex's in-app browser. This installer does not set up the browser plugin. Start a new Codex task after installation; restart Codex if the Skill is not discovered. For browser capability checks, follow the installed Skill's direct `mcp__cua_repl` probe.

Preserve existing settings and credentials. Do not change global agent instructions or run live browser tasks as part of installation.
