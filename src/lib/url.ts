const raw = import.meta.env.BASE_URL;

export const basePath = raw.replace(/\/+$/, '');

export function url(path = '/'): string {
  return `${basePath}/${String(path).replace(/^\/+/, '')}`;
}
