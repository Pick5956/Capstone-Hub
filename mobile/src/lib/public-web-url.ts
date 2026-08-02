const defaultPublicWebUrl = 'https://dishy.pro';

export function publicWebUrl(configuredUrl = process.env.EXPO_PUBLIC_WEB_URL) {
  const value = configuredUrl?.trim() || defaultPublicWebUrl;
  return value.replace(/\/+$/, '');
}

export function invitationUrl(token: string, configuredUrl = process.env.EXPO_PUBLIC_WEB_URL) {
  return `${publicWebUrl(configuredUrl)}/invitations/${encodeURIComponent(token.trim())}`;
}

export function customerTableUrl(token: string, configuredUrl = process.env.EXPO_PUBLIC_WEB_URL) {
  return `${publicWebUrl(configuredUrl)}/customer/t/${encodeURIComponent(token.trim())}`;
}
