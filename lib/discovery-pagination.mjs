export function discoveryPageNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.min(500, Math.floor(number))) : 1;
}

export function discoveryCatalogPage(results, groups, page) {
  const hasMore = page < 500 && groups.some(([, , payload]) => {
    const current = Number(payload?.page || page);
    const total = Number(payload?.total_pages ?? payload?.totalPages ?? 0);
    return total > 0 ? current < Math.min(500, total) : (payload?.results?.length || 0) >= 20;
  });
  return { results, page, hasMore, nextPage: hasMore ? page + 1 : null };
}
