import { z } from "zod";

export const pageInput = z.number().int().positive().default(1).describe("Page number (1 or greater)");

export type Pagination = {
  page: number;
  perPage: number;
  hasNextPage: boolean;
};

function hasNextRelation(link: string | null): boolean {
  if (!link) return false;
  return link.split(",").some((entry) => {
    const parameters = entry.split(";").slice(1);
    return parameters.some((parameter) => {
      const match = /^\s*rel\s*=\s*(?:"([^"]*)"|([^;\s]*))\s*$/i.exec(parameter);
      const relations = (match?.[1] ?? match?.[2] ?? "").split(/\s+/);
      return relations.includes("next");
    });
  });
}

export function paginationFromLink(
  link: string | null,
  page: number,
  perPage: number,
): Pagination {
  return { page, perPage, hasNextPage: hasNextRelation(link) };
}
