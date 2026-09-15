import { fetchGreenFoldA3m } from "./greenfoldClient";

describe("fetchGreenFoldA3m", () => {
  it("sends mutation-pattern on the same-origin proxy first", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toContain("/greenfold-api/v1/download_a3m/P00519?kind=paired");
      expect(new Headers(init?.headers).get("mutation-pattern")).toBe("P00519[M1-N49del]");
      return new Response(">query\nACDE\n", {
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": 'attachment; filename="P00519_paired.a3m"',
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = await fetchGreenFoldA3m({
      accession: "P00519",
      greenfold: "P00519[M1-N49del]",
      kind: "paired",
    });

    expect(file.filename).toBe("P00519_paired.a3m");
    expect(file.blob).toBeInstanceOf(Blob);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("omits mutation-pattern for the wild-type accession", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("mutation-pattern")).toBeNull();
      return new Response(">query\nA\n", {
        headers: { "content-type": "application/octet-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = await fetchGreenFoldA3m({
      accession: "P00519",
      greenfold: "P00519",
      kind: "unpaired",
    });

    expect(file.filename).toBe("P00519_unpaired.a3m");
  });

  it("falls back to the GreenFold origin when the proxy serves HTML", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes("greenfold-api")) {
        return new Response("<!doctype html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      expect(String(url)).toBe("https://greenfold.dsdd.one/v1/download_a3m/P00519?kind=paired");
      expect(new Headers(init?.headers).get("mutation-pattern")).toBe("P00519[12-13del]");
      return new Response(">query\nGG\n", {
        headers: { "content-type": "application/octet-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = await fetchGreenFoldA3m({
      accession: "P00519",
      greenfold: "P00519[12-13del]",
      kind: "paired",
    });

    expect(file.filename).toBe("P00519_paired.a3m");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the GreenFold origin when the proxy returns 500", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes("greenfold-api")) {
        return new Response("proxy error", { status: 500 });
      }
      return new Response(">query\nA\n", {
        headers: { "content-type": "application/octet-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = await fetchGreenFoldA3m({
      accession: "P00519",
      greenfold: "P00519",
      kind: "paired",
    });

    expect(file.filename).toBe("P00519_paired.a3m");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps a GreenFold 404 to an actionable error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "Not found" }), { status: 404 })),
    );

    await expect(
      fetchGreenFoldA3m({ accession: "P00519", greenfold: "P00519", kind: "paired" }),
    ).rejects.toMatchObject({ code: "greenfold_unavailable" });
  });
});
