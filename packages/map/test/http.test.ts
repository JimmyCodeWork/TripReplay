import { describe, expect, it } from "vitest";
import { listOvertureReleases, overtureUrl } from "../src/region/overture.ts";
import { httpRangeSource } from "../src/region/range-source.ts";

function fakeFetch(respond: (range: string) => { status: number; body?: string; headers?: Record<string, string> }) {
  return (async (_url: string, init?: RequestInit) => {
    const range = new Headers(init?.headers).get("Range") ?? "";
    const { status, body = "", headers = {} } = respond(range);
    return new Response(status === 204 ? null : body, { status, headers });
  }) as typeof fetch;
}

const partial = (range: string, body: string, etag = '"a"') => {
  const [start = 0] = range.replace("bytes=", "").split("-").map(Number);
  return {
    status: 206,
    body,
    headers: { "Content-Range": `bytes ${start}-${start + body.length - 1}/1000`, ETag: etag },
  };
};

describe("httpRangeSource", () => {
  it("reads the requested range and keeps the ETag", async () => {
    const source = httpRangeSource(
      "https://example.test/a",
      fakeFetch((range) => partial(range, "abcd")),
    );
    expect(new TextDecoder().decode(await source.read(10, 4))).toBe("abcd");
    expect(source.etag).toBe('"a"');
  });

  it("rejects a full response to a range request", async () => {
    const source = httpRangeSource(
      "https://example.test/a",
      fakeFetch(() => ({ status: 200, body: "all" })),
    );
    await expect(source.read(0, 4)).rejects.toMatchObject({ code: "http" });
  });

  it("rejects a response for another range", async () => {
    const source = httpRangeSource(
      "https://example.test/a",
      fakeFetch(() => partial("bytes=0-3", "abcd")),
    );
    await expect(source.read(10, 4)).rejects.toMatchObject({ code: "http" });
  });

  it("fails with `changed` when the ETag changes between reads", async () => {
    let etag = '"a"';
    const source = httpRangeSource(
      "https://example.test/a",
      fakeFetch((range) => partial(range, "ab", etag)),
    );
    await source.read(0, 2);
    etag = '"b"';
    await expect(source.read(2, 2)).rejects.toMatchObject({ code: "changed" });
  });
});

describe("Overture", () => {
  it("lists the releases in the bucket, newest first", async () => {
    const xml = `<ListBucketResult><CommonPrefixes><Prefix>tiles/2026-09-23.0/</Prefix></CommonPrefixes>
      <CommonPrefixes><Prefix>tiles/2026-10-21.0/</Prefix></CommonPrefixes>
      <CommonPrefixes><Prefix>tiles/2026-09-23.1/</Prefix></CommonPrefixes></ListBucketResult>`;
    const releases = await listOvertureReleases(fakeFetch(() => ({ status: 200, body: xml })));
    expect(releases).toEqual(["2026-10-21.0", "2026-09-23.1", "2026-09-23.0"]);
  });

  it("builds the archive URL of a theme", () => {
    expect(overtureUrl("2026-10-21.0", "base")).toBe(
      "https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-10-21.0/base.pmtiles",
    );
  });
});
