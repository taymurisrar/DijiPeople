import { escapeHtml, policyDataUrl, renderPolicyHtml } from "./policy-view";

describe("policy-view", () => {
  it("shows the whole policy, however long, with nothing truncated", () => {
    const long = "A clause. ".repeat(5000); // 50,000 characters
    const html = renderPolicyHtml({
      title: "Monitoring policy",
      version: 3,
      contentMarkdown: long,
    });
    expect(html).toContain(long);
    expect(html).toContain("Version 3");
  });

  it("escapes the text so the policy cannot inject markup or scripts", () => {
    const html = renderPolicyHtml({
      title: "<b>x</b>",
      version: 1,
      contentMarkdown: `<script>alert(1)</script> & "quoted"`,
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quoted&quot;");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("forbids scripts and network access by policy", () => {
    const html = renderPolicyHtml({ title: "t", version: 1, contentMarkdown: "x" });
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/<script/i);
  });

  it("round-trips through a data URL", () => {
    const html = renderPolicyHtml({ title: "t", version: 1, contentMarkdown: "a b" });
    expect(decodeURIComponent(policyDataUrl(html).split(",").slice(1).join(","))).toBe(html);
    expect(escapeHtml("'")).toBe("&#39;");
  });
});
