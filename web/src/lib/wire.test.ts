import { readFileSync } from "node:fs";
import { join } from "node:path";

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

import { opsecHits } from "../../scripts/opsec.mjs";
import { versionFromDescribe } from "../../scripts/darkroom-sync.mjs";
import { fixtureRecords } from "./fixture.test-util";

const WEB = join(__dirname, "..", "..");
const schema = JSON.parse(readFileSync(join(WEB, "schema", "darkroom-wire.schema.json"), "utf8"));

describe("the fixture against darkroom's wire schema", () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
  // Every field present, as darkroom serializes a record, and nothing darkroom would drop.
  const serialized = structuredClone(schema);
  for (const def of Object.values(serialized.$defs) as { properties?: object; required?: string[]; additionalProperties?: boolean }[]) {
    if (!def.properties) continue;
    def.required = Object.keys(def.properties);
    def.additionalProperties = false;
  }
  ajv.addSchema(serialized, "darkroom");

  it.each(fixtureRecords().map((record) => [record.id, record]))("%s is a record darkroom would serve", (_id, record) => {
    const validate = ajv.getSchema("darkroom#/$defs/GenerationRecord")!;
    expect(validate(record), ajv.errorsText(validate.errors)).toBe(true);
  });
});

describe("the sync record's version", () => {
  it("reads hatch-vcs's version from git describe", () => {
    expect(versionFromDescribe("v0.1.3-0-g3cf0818")).toBe("0.1.3");
    expect(versionFromDescribe("v0.1.3-18-g3cf0818\n")).toBe("0.1.4.dev18+g3cf0818");
    expect(() => versionFromDescribe("3cf0818")).toThrow();
  });
});

describe("the opsec gate", () => {
  it("passes loopback, placeholders and container paths", () => {
    expect(opsecHits("darkroom on 127.0.0.1:8106, ComfyUI at http://<GPU_HOST>:8188, workflows in /app/examples")).toEqual([]);
  });

  it("refuses private addresses, home paths and emails, with the line", () => {
    const hits = opsecHits("one\nhttp://192.168.1.20:8106\n/home/someone/models\nmail a@b.example\nfe80::1:2\n");
    expect(hits.map((hit) => [hit.line, hit.kind])).toEqual([
      [2, "private IPv4 address"],
      [3, "home directory path"],
      [4, "email address"],
      [5, "link-local or unique-local IPv6 address"],
    ]);
  });

  it("matches the private denylist without echoing the term", () => {
    const hits = opsecHits("hosted on Secret-Box today", ["secret-box"]);
    expect(hits).toEqual([{ kind: "denylisted term", match: "(withheld)", line: 1 }]);
  });
});
