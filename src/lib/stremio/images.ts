const IMG = "https://image.tmdb.org/t/p";

/** w342 posters stay well below Stremio's recommended 100 kB. */
export function posterUrl(path: string | null | undefined): string | undefined {
  return path ? `${IMG}/w342${path}` : undefined;
}

export function backdropUrl(path: string | null | undefined): string | undefined {
  return path ? `${IMG}/w1280${path}` : undefined;
}

export function stillUrl(path: string | null | undefined): string | undefined {
  return path ? `${IMG}/w300${path}` : undefined;
}
