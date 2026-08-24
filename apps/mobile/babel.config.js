module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4 usa el plugin de worklets y tiene que ir siempre último.
    plugins: ['react-native-worklets/plugin'],
  };
};
