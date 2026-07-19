const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// ── Monorepo: make Metro aware of the pnpm workspace root ────────────────────
// All node_modules are hoisted to workspaceRoot in a pnpm workspace.
// Without this, Metro cannot find packages that are not symlinked into
// artifacts/vee/node_modules.
config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Replit: cap workers to avoid OOM in the containerised environment.
config.maxWorkers = 2;

module.exports = config;
