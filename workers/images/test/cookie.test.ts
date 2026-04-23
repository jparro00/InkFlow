import { describe, expect, it } from "vitest";
import { extractJwt, getCookie } from "../src/cookie.ts";

function mkReq(headers: Record<string, string>): Request {
  return new Request("https://example.com/", { headers });
}

describe("getCookie", () => {
  it("returns null when no cookie header", () => {
    expect(getCookie(mkReq({}), "sb-access-token")).toBeNull();
  });

  it("parses a single cookie", () => {
    const req = mkReq({ Cookie: "sb-access-token=abc.def.ghi" });
    expect(getCookie(req, "sb-access-token")).toBe("abc.def.ghi");
  });

  it("parses when cookie is among many", () => {
    const req = mkReq({
      Cookie: "foo=1; sb-access-token=abc.def.ghi; bar=2",
    });
    expect(getCookie(req, "sb-access-token")).toBe("abc.def.ghi");
  });

  it("returns null when name not present", () => {
    const req = mkReq({ Cookie: "foo=1; bar=2" });
    expect(getCookie(req, "sb-access-token")).toBeNull();
  });
});

describe("extractJwt", () => {
  it("prefers Authorization header over cookie", () => {
    const req = mkReq({
      Authorization: "Bearer header.token.sig",
      Cookie: "sb-access-token=cookie.token.sig",
    });
    expect(extractJwt(req, "sb-access-token")).toBe("header.token.sig");
  });

  it("falls back to cookie when no Authorization header", () => {
    const req = mkReq({ Cookie: "sb-access-token=cookie.token.sig" });
    expect(extractJwt(req, "sb-access-token")).toBe("cookie.token.sig");
  });

  it("returns null when neither present", () => {
    expect(extractJwt(mkReq({}), "sb-access-token")).toBeNull();
  });

  it("ignores non-Bearer Authorization schemes", () => {
    const req = mkReq({ Authorization: "Basic dXNlcjpwYXNz" });
    expect(extractJwt(req, "sb-access-token")).toBeNull();
  });
});
