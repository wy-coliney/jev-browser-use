#!/usr/bin/env node
import { cp, mkdir, realpath, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const models = { typesafe: 'jev-latest', openrouter: '~typesafe/jev-latest', opencode: 'jev-1.13-free' };
const modelPatterns = {
  typesafe: /^jev-[a-z0-9.-]{1,80}$/,
  openrouter: /^(?:~?typesafe\/)?jev-[a-z0-9.-]{1,80}$/,
  opencode: /^jev-[a-z0-9.-]{1,80}$/,
};
const runtimeFiles = ['SKILL.md', 'bridge.mjs', 'references'];

async function exists(path) {
  try { await stat(path); return true; } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

/** Installs runtime files only. Existing configuration and unrelated files survive updates. */
export async function install({ source = sourceRoot, home = homedir(), config } = {}) {
  source = await realpath(source);
  const target = join(home, '.agents', 'skills', 'jev-browser-use');
  const configPath = join(home, '.config', 'jev-browser-use', 'config.json');
  const canonicalTarget = await exists(target) ? await realpath(target) : resolve(target);
  const distance = relative(source, canonicalTarget);
  if (!distance || (!distance.startsWith('..') && !isAbsolute(distance))) {
    throw new Error('Choose a source outside the installed skill directory.');
  }
  const preserveConfig = await exists(configPath);
  if (config && !preserveConfig) {
    if (!Object.hasOwn(models, config.provider)) throw new Error('Choose typesafe, openrouter, or opencode.');
    const pattern = modelPatterns[config.provider];
    if (typeof config.model !== 'string' || !pattern.test(config.model)) throw new Error('Enter a valid Jev model ID.');
    if (!isAbsolute(config.envFile ?? '') || !(await exists(config.envFile)) || !(await stat(config.envFile)).isFile()) {
      throw new Error('Provide an absolute path to an existing dotenv file.');
    }
  }
  // Validate the complete source before touching an installed skill.
  const skillSource = join(source, 'skills', 'jev-browser-use');
  for (const name of runtimeFiles) await stat(join(skillSource, name));
  await stat(join(source, 'LICENSE'));
  await mkdir(target, { recursive: true });
  for (const name of runtimeFiles) await cp(join(skillSource, name), join(target, name), { recursive: true });
  await cp(join(source, 'LICENSE'), join(target, 'LICENSE'));
  if (config && !preserveConfig) {
    await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
    await writeFile(configPath, JSON.stringify({ provider: config.provider, model: config.model, envFile: config.envFile }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  }
  return { target, configPath, configured: preserveConfig || Boolean(config) };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node scripts/install.mjs [--no-config]\nInstalls to ~/.agents/skills/jev-browser-use. Existing configuration is preserved.');
    return;
  }
  if (args.some(arg => arg !== '--no-config')) throw new Error('Unknown option. Use --help.');
  let config;
  const configPath = join(homedir(), '.config', 'jev-browser-use', 'config.json');
  if (!args.includes('--no-config') && !(await exists(configPath))) {
    if (!process.stdin.isTTY) throw new Error('Run interactively to configure, or use --no-config.');
    const prompts = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const provider = (await prompts.question('Jev provider (typesafe / openrouter / opencode): ')).trim();
      if (!Object.hasOwn(models, provider)) throw new Error('Choose typesafe, openrouter, or opencode.');
      const model = (await prompts.question(`Model [${models[provider]}]: `)).trim() || models[provider];
      const envFile = (await prompts.question('Absolute path to your existing dotenv file (not the API key): ')).trim();
      config = { provider, model, envFile };
    } finally { prompts.close(); }
  }
  const result = await install({ config });
  console.log(`Skill installed. ${result.configured ? 'Configuration ready.' : 'Configure Jev using references/provider-configuration.md.'} Enable Computer Use MCP and restart Codex.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('Installation failed. Check the source files, provider, model, dotenv path, and directory permissions. Use --help for options.');
    process.exitCode = 1;
  });
}
