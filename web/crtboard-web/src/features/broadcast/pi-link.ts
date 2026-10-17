/** The Pi's USB gadget IDs (gateway/usb-gadget/crtboard-gadget.sh). */
const FILTERS: SerialPortFilter[] = [{ usbVendorId: 0x1d6b, usbProductId: 0x0104 }];
const REPLY_TIMEOUT_MS = 10_000;
/**
 * A tab closed or reloaded mid-frame leaves crt-display reading that frame
 * for up to 3 s, swallowing our PINGs; keep asking for this long.
 */
const HANDSHAKE_MS = 8000;
const PING_INTERVAL_MS = 1000;
const CLOSE_TIMEOUT_MS = 1000;

/**
 * Serial connection to `crt-display` on the Raspberry Pi, speaking its line
 * protocol (see gateway/crt-display/upload.go).
 */
export class PiLink {
  /** Called once when the Pi is unplugged or stops answering. */
  onclose: (() => void) | null = null;

  #port: SerialPort;
  #writer: WritableStreamDefaultWriter<Uint8Array>;
  #reader: ReadableStreamDefaultReader<Uint8Array>;
  #lines: string[] = [];
  #waiting: ((line: string) => void) | null = null;
  #closed = false;
  /** Older `crt-display` builds only know IMG, which also saves every frame to disk. */
  #frameCommand: "FRAME" | "IMG" = "FRAME";

  static get supported(): boolean {
    return "serial" in navigator;
  }

  /** Shows the WebSerial picker, opens the chosen port and checks that `crt-display` answers. */
  static async open(): Promise<PiLink> {
    const port = await navigator.serial!.requestPort({ filters: FILTERS });
    // The gadget ignores the baud rate; WebSerial requires one.
    await port.open({ baudRate: 115200 });
    const link = new PiLink(port);
    try {
      await link.#handshake();
    } catch (error) {
      await link.close();
      throw error;
    }
    return link;
  }

  private constructor(port: SerialPort) {
    this.#port = port;
    this.#writer = port.writable!.getWriter();
    this.#reader = port.readable!.getReader();
    this.#readLoop();
    navigator.serial!.addEventListener("disconnect", (event) => {
      if (event.target === port) this.close();
    });
  }

  /** Sends one encoded frame and waits until the Pi has shown it. */
  async sendFrame(data: Uint8Array): Promise<void> {
    let ready = await this.#command(`${this.#frameCommand} ${data.length}`);
    if (ready.startsWith("ERR unknown command") && this.#frameCommand === "FRAME") {
      this.#frameCommand = "IMG";
      ready = await this.#command(`IMG ${data.length}`);
    }
    if (ready !== "READY") throw new Error(ready);
    await this.#writer.write(data);
    const result = await this.#reply(30_000);
    if (!result.startsWith("OK")) throw new Error(result);
  }

  /**
   * Pings until crt-display answers, discarding whatever is left over from an
   * earlier session: replies to a closed tab, or the error for a frame it
   * never finished.
   */
  async #handshake(): Promise<void> {
    const deadline = Date.now() + HANDSHAKE_MS;
    while (Date.now() < deadline) {
      await this.#write(`PING`);
      const roundEnd = Date.now() + PING_INTERVAL_MS;
      try {
        while (Date.now() < roundEnd) {
          if ((await this.#nextLine(roundEnd - Date.now())).startsWith("PONG")) return;
        }
      } catch {
        // No answer this round; ask again.
      }
    }
    throw new Error("crt-display did not answer");
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    try {
      this.#writer.releaseLock();
      // A wedged port must not leave the UI waiting on it.
      await Promise.race([
        this.#reader.cancel().then(() => this.#port.close()),
        new Promise((resolve) => setTimeout(resolve, CLOSE_TIMEOUT_MS)),
      ]);
    } catch (error) {
      console.warn("closing the serial port failed", error);
    }
    this.onclose?.();
  }

  async #command(line: string, timeoutMs = REPLY_TIMEOUT_MS): Promise<string> {
    await this.#write(line);
    return this.#reply(timeoutMs);
  }

  #write(line: string): Promise<void> {
    return this.#writer.write(new TextEncoder().encode(`${line}\n`));
  }

  /** The next reply, skipping late PONGs from extra handshake PINGs. */
  async #reply(timeoutMs: number): Promise<string> {
    for (;;) {
      const line = await this.#nextLine(timeoutMs);
      if (!line.startsWith("PONG")) return line;
    }
  }

  async #readLoop(): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await this.#reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, end).trim();
          buffer = buffer.slice(end + 1);
          const waiting = this.#waiting;
          this.#waiting = null;
          if (waiting) waiting(line);
          else this.#lines.push(line);
        }
      }
    } catch (error) {
      if (!this.#closed) console.warn("serial read failed", error);
    } finally {
      this.#reader.releaseLock();
      this.close();
    }
  }

  #nextLine(timeoutMs: number): Promise<string> {
    const queued = this.#lines.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiting = null;
        reject(new Error("no reply from the Pi"));
      }, timeoutMs);
      this.#waiting = (line) => {
        clearTimeout(timer);
        resolve(line);
      };
    });
  }
}
