const path = require('path');
const mobileConfig = require('./packages/mobile/app.json');

const mobileRoot = path.resolve(__dirname, 'packages/mobile');
const resolveFromMobile = (moduleName) => require.resolve(moduleName, { paths: [mobileRoot] });

function resolvePlugin(plugin) {
  const name = Array.isArray(plugin) ? plugin[0] : plugin;
  const options = Array.isArray(plugin) ? plugin.slice(1) : [];

  if (typeof name !== 'string') return plugin;

  try {
    const resolved = resolveFromMobile(`${name}/app.plugin.js`);
    return options.length > 0 ? [resolved, ...options] : resolved;
  } catch {
    try {
      const resolved = resolveFromMobile(name);
      return options.length > 0 ? [resolved, ...options] : resolved;
    } catch {
      return plugin;
    }
  }
}

module.exports = {
  ...mobileConfig,
  expo: {
    ...mobileConfig.expo,
    plugins: mobileConfig.expo.plugins.map(resolvePlugin),
  },
};
