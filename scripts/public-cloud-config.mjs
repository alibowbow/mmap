// Next inlines NEXT_PUBLIC values at build time. Reject privileged keys before
// bundling rather than relying on a client-side guard after exposure.
export function assertPublicCloudConfig(env = process.env) {
  for (const name of ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
    const key = env[name];
    if (!key) continue;
    let safe = key.startsWith("sb_publishable_");
    if (!safe) {
      try {
        const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
        safe = payload.role === "anon";
      } catch { /* malformed or privileged keys fail closed */ }
    }
    if (!safe) throw new Error(`${name} must contain a publishable or legacy anon key. Never use a privileged key in public configuration.`);
  }
}
