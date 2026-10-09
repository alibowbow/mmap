import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function check(values: Record<string, string>) {
  return spawnSync(process.execPath, ["--input-type=module", "-e", "await import('./next.config.mjs')"], {
    cwd: process.cwd(), encoding: "utf8",
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", ...values },
  });
}
const legacy = (role: string) => `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;

test("build configuration permits only public cloud keys and unconfigured local mode", () => {
  const cases: Record<string, string>[] = [{}, { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" }, { NEXT_PUBLIC_SUPABASE_ANON_KEY: legacy("anon") }];
  for (const values of cases) {
    assert.equal(check(values).status, 0);
  }
});

test("privileged or malformed public keys fail before a browser bundle is built without printing the key", () => {
  for (const key of ["sb_secret_never_expose_this_test_value", legacy("service_role"), "malformed_key_test"]) {
    for (const name of ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
      const result = check({ [name]: key });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /must contain a publishable or legacy anon key/);
      assert.ok(!result.stderr.includes(key));
    }
  }
});
