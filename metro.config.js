const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const mobileRoot = path.resolve(projectRoot, 'packages/mobile');

const config = getDefaultConfig(projectRoot);

config.watchFolders = Array.from(
  new Set([...(config.watchFolders ?? []), mobileRoot, path.resolve(projectRoot, 'packages/shared')]),
);

config.resolver.nodeModulesPaths = [
  path.resolve(mobileRoot, 'node_modules'),
  path.resolve(projectRoot, 'node_modules'),
];

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  '@gymbit/shared': path.resolve(projectRoot, 'packages/shared/src'),
};

module.exports = config;
