import { describe, expect, it } from "vitest";
import {
  publicationErrors,
  type PublicationRecord,
} from "../../shared/editorial";

describe("unpositioned source publication", () => {
  it("keeps a verified registry URL with unknown political coordinates out of public charts", () => {
    const source: PublicationRecord = {
      kind: "source",
      verificationStatus: "verified",
      provenanceNote: "Registry URL checked",
      methodology: "URL-only review; no position analysis",
      editorialDisclosure: "Position unknown",
      evidenceUrl: "https://example.org/evidence",
      payload: {
        s: "fixture",
        n: "Fixture source",
        u: "https://example.org",
        lean: null,
      },
    };
    expect(publicationErrors(source)).toContain(
      "Source profiles require explicitly reviewed 0–100 coordinates; unknown positions must remain drafts"
    );
    expect(source.payload.lean).toBeNull();
  });
});
