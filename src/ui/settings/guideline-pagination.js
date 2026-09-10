import { guidelineSetMatchesQuery } from "../../prompts/guideline-sets.js?v=20260910-guideline-pagination";

export const GUIDELINE_PAGE_SIZE = 10;

export function guidelinePageModel(guidelineSets = [], { searchQuery = "", page = 1 } = {}) {
  const query = String(searchQuery || "").trim().toLowerCase();
  const matchingSets = (guidelineSets || []).filter((set) => guidelineSetMatchesQuery(set, query));
  const totalPages = Math.max(1, Math.ceil(matchingSets.length / GUIDELINE_PAGE_SIZE));
  const requestedPage = Number.isFinite(Number(page)) ? Math.trunc(Number(page)) : 1;
  const currentPage = Math.min(totalPages, Math.max(1, requestedPage));
  const startIndex = (currentPage - 1) * GUIDELINE_PAGE_SIZE;
  const pageSets = matchingSets.slice(startIndex, startIndex + GUIDELINE_PAGE_SIZE);

  return Object.freeze({
    query,
    matchingSets,
    pageSets,
    currentPage,
    totalPages,
    totalCount: matchingSets.length,
    startIndex,
    endIndex: startIndex + pageSets.length
  });
}
