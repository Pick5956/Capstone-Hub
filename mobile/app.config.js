const googleClientIdSuffix = '.apps.googleusercontent.com';

function googleIosUrlScheme(clientId) {
  if (!clientId) {
    return null;
  }
  if (!clientId.endsWith(googleClientIdSuffix)) {
    throw new Error(
      'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must be an iOS OAuth client ID.',
    );
  }

  const identifier = clientId.slice(0, -googleClientIdSuffix.length);
  return `com.googleusercontent.apps.${identifier}`;
}

module.exports = ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const easProjectId = process.env.EXPO_EAS_PROJECT_ID?.trim();
  const expoOwner = process.env.EXPO_EAS_OWNER?.trim();
  const iosUrlScheme =
    googleIosUrlScheme(iosClientId) ||
    'com.googleusercontent.apps.REPLACE_WITH_IOS_CLIENT_ID';
  const plugins = [...(config.plugins || [])];

  plugins.push([
    'react-native-nitro-google-signin',
    { iosUrlScheme },
  ]);

  return {
    ...config,
    ...(expoOwner ? { owner: expoOwner } : {}),
    extra: {
      ...(config.extra || {}),
      ...(easProjectId
        ? {
          eas: {
            ...(config.extra?.eas || {}),
            projectId: easProjectId,
          },
        }
        : {}),
    },
    plugins,
  };
};
