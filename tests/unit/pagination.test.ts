import { describe, expect, it, vi } from "vitest";
import { fetchAllPages, type Page } from "@/lib/tmdb/pagination";

function source(total: number, pageSize = 20) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
  const totalPages = Math.ceil(total / pageSize);
  return vi.fn(async (page: number): Promise<Page<{ id: number }>> => ({
    page, total_pages: totalPages, total_results: total, results: all.slice((page - 1) * pageSize, page * pageSize),
  }));
}

describe("fetchAllPages", () => {
  it("fetches every page in order", async () => {
    const f = source(95);
    const r = await fetchAllPages(f);
    expect(r.items.map((i) => i.id)).toEqual(Array.from({ length: 95 }, (_, i) => i + 1));
    expect(f).toHaveBeenCalledTimes(5);
  });

  it("handles empty lists", async () => {
    const r = await fetchAllPages(source(0));
    expect(r.items).toEqual([]);
  });

  it("reuses a provided first page", async () => {
    const f = source(45);
    const first = await f(1);
    f.mockClear();
    await fetchAllPages(f, { firstPage: first });
    expect(f.mock.calls.map((c) => c[0])).toEqual([2, 3]);
  });

  it("fails (instead of truncating) when a page errors", async () => {
    const f = source(60);
    f.mockImplementationOnce(f.getMockImplementation()!).mockRejectedValueOnce(new Error("boom"));
    await expect(fetchAllPages(f)).rejects.toThrow("boom");
  });

  it("fails when the list changes during the fetch", async () => {
    const f = vi.fn(async (page: number) => ({ page, total_pages: 2, total_results: page === 1 ? 40 : 39, results: Array.from({ length: 20 }, (_, i) => ({ id: page * 100 + i })) }));
    await expect(fetchAllPages(f)).rejects.toThrow(/changed/);
  });

  it("fails when a page is unexpectedly short", async () => {
    const f = vi.fn(async (page: number) => ({ page, total_pages: 3, total_results: 60, results: page === 2 ? [] : Array.from({ length: 20 }, (_, i) => ({ id: page * 100 + i })) }));
    await expect(fetchAllPages(f)).rejects.toThrow(/incomplete/);
  });

  it("refuses lists over the page cap", async () => {
    await expect(fetchAllPages(source(300), { maxPages: 10 })).rejects.toThrow(/too large/);
  });
});
