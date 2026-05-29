const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Permitir que Metro resuelva módulos desde la raíz del monorepo
config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Resolver el alias @gymbit/shared
config.resolver.extraNodeModules = {
  '@gymbit/shared': path.resolve(monorepoRoot, 'packages/shared/src'),
};

module.exports = config;
