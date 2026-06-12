import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { DeviceAuthManager, parseDevicePrompt } from "../src/codex/device-auth";

describe("parseDevicePrompt", () => {
  test("extracts url and grouped code from typical output", () => {
    const out = "To authenticate, visit:\n\n  https://auth.openai.com/device\n\nand enter code:\n\n  BDSF-HKLM\n";
    expect(parseDevicePrompt(out)).toEqual({ url: "https://auth.openai.com/device", code: "BDSF-HKLM" });
  });

  test("handles inline phrasing and trailing punctuation", () => {
    const out = "Go to https://chatgpt.com/device. Your code is ABCD-1234.";
    const parsed = parseDevicePrompt(out);
    expect(parsed.url).toBe("https://chatgpt.com/device");
    expect(parsed.code).toBe("ABCD-1234");
  });

  test("does not invent a code from URL fragments", () => {
    const out = "Visit https://auth.openai.com/activate?user_code=pending soon";
    const parsed = parseDevicePrompt(out);
    expect(parsed.code).toBeNull();
  });

  test("returns nulls on partial output", () => {
    expect(parseDevicePrompt("Starting device auth…")).toEqual({ url: null, code: null });
  });
});

type FakeChild = EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: (sig?: string) => void; killed: boolean };

function fakeSpawn(): { spawn: (...args: unknown[]) => FakeChild; child: () => FakeChild } {
  let current: FakeChild;
  const spawn = () => {
    const child = new EventEmitter() as FakeChild;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = () => { child.killed = true; };
    current = child;
    return child;
  };
  return { spawn: spawn as never, child: () => current };
}

describe("DeviceAuthManager", () => {
  test("walks idle → pending(with code) → success", () => {
    const fake = fakeSpawn();
    const manager = new DeviceAuthManager(fake.spawn as never);
    expect(manager.status()).toEqual({ state: "idle" });

    manager.start();
    expect(manager.status().state).toBe("pending");

    fake.child().stdout.emit("data", Buffer.from("Visit https://auth.openai.com/device and enter code WXYZ-9876\n"));
    const pending = manager.status();
    expect(pending).toMatchObject({ state: "pending", url: "https://auth.openai.com/device", code: "WXYZ-9876" });

    fake.child().emit("close", 0);
    expect(manager.status()).toEqual({ state: "success" });
  });

  test("reports failure output on non-zero exit", () => {
    const fake = fakeSpawn();
    const manager = new DeviceAuthManager(fake.spawn as never);
    manager.start();
    fake.child().stderr.emit("data", Buffer.from("error: device code login is disabled for this workspace\n"));
    fake.child().emit("close", 1);
    const s = manager.status();
    expect(s.state).toBe("error");
    expect((s as { message: string }).message).toContain("disabled");
  });

  test("start is single-flight while pending", () => {
    const fake = fakeSpawn();
    const manager = new DeviceAuthManager(fake.spawn as never);
    manager.start();
    const first = fake.child();
    manager.start();
    expect(fake.child()).toBe(first);
  });

  test("cancel kills the child and resets to idle", () => {
    const fake = fakeSpawn();
    const manager = new DeviceAuthManager(fake.spawn as never);
    manager.start();
    manager.cancel();
    expect(fake.child().killed).toBe(true);
    expect(manager.status()).toEqual({ state: "idle" });
  });
});
