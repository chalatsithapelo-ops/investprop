import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ScenarioPanel } from "./ScenarioPanel";
import { TaxSourceEditor } from "./TaxSourceEditor";
import { VoiceRecorder } from "./VoiceRecorder";

vi.mock("~/trpc/react", () => ({ trpcClient: {} }));

describe("web office safety affordances", () => {
  it("renders no invented baseline and requires an explicit stress vacancy input", () => {
    const client = new QueryClient();
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><ScenarioPanel authToken="test-token" accountId={1} holdings={[]} /></QueryClientProvider>);
    expect(html).toContain("No baseline or stress figures are assumed");
    const vacancy = html.match(/<input\b(?=[^>]*name="vacancyRatePct")[^>]*>/)?.[0];
    expect(vacancy).toContain('required=""');
    expect(vacancy).not.toContain("value=");
    expect(html).toContain("flip and development properties are not supported");
    client.clear();
  });
  it.each(["INVESTOR", "PROPERTY_OWNER", "STAFF"])("does not render the tax source editor for %s", (role) => {
    const client = new QueryClient();
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><TaxSourceEditor authToken="test-token" accountId={1} role={role} /></QueryClientProvider>);
    expect(html).toBe("");
    client.clear();
  });
  it("gives ADMIN draft fields but no publication control before an exact draft exists", () => {
    const client = new QueryClient();
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><TaxSourceEditor authToken="test-token" accountId={1} role="ADMIN" /></QueryClientProvider>);
    expect(html).toContain("Save immutable draft for review");
    for (const name of ["title", "url", "authority", "effectiveFrom", "effectiveTo", "applicability", "content", "previousSourceId"]) expect(html).toContain(`name="${name}"`);
    expect(html).not.toContain("Publish exact reviewed draft");
    client.clear();
  });
  it("discloses third-party voice processing before recording and leaves recording disabled without opt-in", () => {
    const html = renderToStaticMarkup(<VoiceRecorder enabled busy={false} contextKey="test" onSend={async () => {}} onError={() => {}} onRecordingChange={() => {}} />);
    expect(html).toContain("third-party processing: OpenAI");
    expect(html).toContain("Transcripts and answers are saved in office history");
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).not.toContain('checked=""');
  });
  it("renders returned exception units, evidence, gaps and incomplete status without a risk score", () => {
    const client = new QueryClient();
    client.setQueryData(["ai-office", 1, "test-token", "accountingExceptions"], {
      readOnly: true, evaluatedAt: "2026-11-04T10:00:00.000Z", complete: false,
      counts: { payouts: 1, holdings: 0, certificates: 0, contributions: 0 },
      exceptions: [{ code: "PAYOUT_UNALLOCATED_DIFFERENCE", propertyId: 7, message: "Fees may explain this difference; not a fraud finding.",
        observed: { unallocatedDifferenceCents: 125, allocatedFeeCents: null }, evidence: [{ id: "payout:1", kind: "PAID_PAYOUT", asOf: null }] }],
      gaps: ["Records truncated; results incomplete."], unitNotes: ["Differences are integer ZAR cents."],
    });
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><ScenarioPanel authToken="test-token" accountId={1} holdings={[]} /></QueryClientProvider>);
    expect(html).toContain("INCOMPLETE");
    expect(html).toContain("integer ZAR cents");
    expect(html).toContain("payout:1");
    expect(html).toContain("Records truncated; results incomplete.");
    expect(html).not.toContain("risk score");
    client.clear();
  });
});