// Next.js instrumentation hook — runs once when the server process boots.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
//
// On at least one dev machine this app has run on, the OS/network DNS
// resolver intermittently — and sometimes persistently — hands back a wrong
// or unreachable IP for the Supabase hostname. That breaks every server-side
// fetch() (session checks, Gemini calls, etc.) with a misleading
// UNABLE_TO_VERIFY_LEAF_SIGNATURE error, even though the same hostname
// resolves correctly through a trusted public resolver. Pin every outbound
// fetch() in the Node runtime to try 1.1.1.1/8.8.8.8 first, falling back to
// the OS resolver for anything the public resolver can't answer (localhost,
// internal hostnames, IP literals, etc.) so this is purely additive.
import type { LookupOptions } from "node:dns";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const dns = await import("node:dns");
  const { Agent, setGlobalDispatcher } = await import("undici");

  const resolver = new dns.Resolver();
  resolver.setServers(["1.1.1.1", "8.8.8.8"]);

  const lookup = (
    hostname: string,
    options: LookupOptions,
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | { address: string; family: number }[],
      family?: number,
    ) => void,
  ) => {
    resolver.resolve4(hostname, (err, addresses) => {
      if (err || !addresses?.length) {
        // Covers anything the public resolver can't answer — localhost,
        // internal hostnames, IP literals — by deferring to the OS resolver
        // that handled these correctly before this hook existed.
        dns.lookup(hostname, options, callback);
        return;
      }
      // The caller's `all` option changes the expected shape of `address`
      // (a single string vs. an array of {address, family}) — get this
      // wrong and the caller silently reads garbage instead of erroring.
      if (options?.all) {
        callback(
          null,
          addresses.map((address) => ({ address, family: 4 })),
        );
      } else {
        callback(null, addresses[0], 4);
      }
    });
  };

  setGlobalDispatcher(new Agent({ connect: { lookup } }));
}
