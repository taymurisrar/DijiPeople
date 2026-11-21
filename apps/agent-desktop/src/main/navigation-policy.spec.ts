import { isAllowedNavigation } from "./navigation-policy";

describe("isAllowedNavigation", () => {
  it("allows the local pages the agent loads", () => {
    expect(
      isAllowedNavigation(
        "file:///C:/Program%20Files/Agent/renderer/login.html",
      ),
    ).toBe(true);
    expect(isAllowedNavigation("file:///opt/agent/renderer/login.html")).toBe(
      true,
    );
  });

  it.each([
    "https://example.com/",
    "http://localhost:3001/",
    "data:text/html,<script>alert(1)</script>",
    "javascript:alert(1)",
    "blob:https://example.com/abc",
    "ftp://example.com/x",
    "custom-scheme://anything",
    "about:blank",
    "",
    "not a url",
    "//example.com/x",
  ])("refuses %p", (url) => {
    expect(isAllowedNavigation(url)).toBe(false);
  });
});
