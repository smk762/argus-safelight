// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GenerateHandlers } from "@/lib/api";
import type { Preflight } from "@/lib/types";

import { ComposeProvider, useCompose, type Compose } from "./ComposeProvider";

const calls = vi.hoisted(() => ({ preflight: [] as ((value: unknown) => void)[], generate: [] as unknown[] }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("./DarkroomProvider", () => ({ useDarkroom: () => ({ health: null, policies: null, models: null, error: null }) }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  preflight: () => new Promise((resolve) => calls.preflight.push(resolve)),
  generate: (_request: unknown, handlers: GenerateHandlers) => {
    calls.generate.push(handlers);
    return new Promise(() => {});
  },
}));

const verdict = (name: string) => ({ name, enforcing_policy: "default", advisory_policies: [], outcome: "ok" }) as unknown as Preflight;

const seen: { compose: Compose | null } = { compose: null };
function Probe() {
  const value = useCompose();
  useEffect(() => {
    seen.compose = value;
  });
  return null;
}
const compose = () => seen.compose!;

afterEach(() => {
  cleanup();
  calls.preflight.length = 0;
  calls.generate.length = 0;
});

describe("pre-flight in the compose provider", () => {
  it("shows the latest check's verdict, though an earlier check answers last", async () => {
    render(
      <ComposeProvider>
        <Probe />
      </ComposeProvider>,
    );
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => {
      first = compose().check();
    });
    act(() => compose().update({ userPrompt: "a flat green field" }));
    act(() => {
      second = compose().check();
    });
    await act(async () => {
      calls.preflight[1](verdict("newer"));
      await second;
    });
    await act(async () => {
      calls.preflight[0](verdict("older"));
      await first;
    });
    expect(compose().preflight.result).toEqual(verdict("newer"));
  });

  it("keeps the generation's own pre-flight over a manual check that answers after Generate", async () => {
    render(
      <ComposeProvider>
        <Probe />
      </ComposeProvider>,
    );
    let pending!: Promise<unknown>;
    act(() => {
      pending = compose().check();
    });
    act(() => compose().start());
    act(() => (calls.generate[0] as GenerateHandlers).onPreflight?.(verdict("generation")));
    await act(async () => {
      calls.preflight[0](verdict("manual"));
      await pending;
    });
    expect(compose().preflight.result).toEqual(verdict("generation"));
  });
});
