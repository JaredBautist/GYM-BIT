module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['@babel/plugin-transform-private-methods', { loose: false }],
      ['@babel/plugin-transform-private-property-in-object', { loose: false }],
      ['@babel/plugin-transform-class-properties', { loose: false }],
      ['@babel/plugin-transform-classes', { loose: false }],
      '@babel/plugin-transform-async-to-generator',
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@gymbit/shared': './packages/shared/src/index.ts',
          },
        },
      ],
    ],
    overrides: [
      {
        test: /\.[cm]?tsx?$/,
        plugins: [['@babel/plugin-transform-typescript', { allowDeclareFields: true }]],
      },
    ],
  };
};
