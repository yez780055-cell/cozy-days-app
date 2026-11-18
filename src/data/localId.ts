// getRandomValues also works on a phone opening the app over plain LAN HTTP.
export function localId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}
