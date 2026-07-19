import { Socket } from "node:net";

export interface HotReloadOptions {
  host?: string;
  port?: number;
  timeoutMs?: number;
}

export interface HotReloadResult {
  ok: boolean;
  message: string;
  detail?: string;
}

export function hotReload(opts: HotReloadOptions = {}): Promise<HotReloadResult> {
  const host = opts.host ?? "127.0.0.1";
  const port = opts.port ?? 8001;
  const timeoutMs = opts.timeoutMs ?? 2000;

  return new Promise<HotReloadResult>((resolve) => {
    let settled = false;
    let socket: Socket | null = null;
    let response = "";
    let timer: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (socket) {
        socket.removeAllListeners();
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
        socket = null;
      }
    };

    const finish = (result: HotReloadResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    try {
      socket = new Socket();
      socket.setTimeout(timeoutMs);

      socket.on("error", (err) => {
        finish({
          ok: false,
          message:
            "Could not connect to Defold engine service. Hot reload is experimental and may not be supported by this Defold version / the engine may not be running. Use defold_build + relaunch instead.",
          detail: err instanceof Error ? err.message : String(err),
        });
      });

      socket.on("data", (chunk: Buffer) => {
        response += chunk.toString("utf8");
      });

      socket.on("timeout", () => {
        // Treat a socket timeout as "no prompt acknowledgement"; still report ok.
        finish({
          ok: true,
          message:
            "Connected to engine service; reload signal sent (experimental). No acknowledgement received within the timeout window.",
          detail: response.length > 0 ? response : undefined,
        });
      });

      socket.on("close", () => {
        // Socket closed (possibly before our timer). Report whatever we collected.
        finish({
          ok: true,
          message:
            "Connected to engine service; reload signal sent (experimental). Connection closed by remote.",
          detail: response.length > 0 ? response : undefined,
        });
      });

      socket.connect(port, host, () => {
        try {
          socket?.write('{"type":"reload"}\n');
        } catch {
          /* write may fail; error/close handlers will resolve */
        }

        // Best-effort wait for any response, then resolve.
        timer = setTimeout(() => {
          finish({
            ok: true,
            message:
              "Connected to engine service; reload signal sent (experimental).",
            detail: response.length > 0 ? response : undefined,
          });
        }, timeoutMs);
      });
    } catch (err) {
      finish({
        ok: false,
        message:
          "Hot reload failed unexpectedly. Use defold_build + relaunch instead.",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }).catch(
    (err): HotReloadResult => ({
      ok: false,
      message:
        "Hot reload failed unexpectedly. Use defold_build + relaunch instead.",
      detail: err instanceof Error ? err.message : String(err),
    })
  );
}
