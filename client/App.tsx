import { useEffect, useState } from "react";

type Enrollment = {
  qrCode: string;
};

type SseEvent = {
  code: string;
  expiresAt: number;
};

type LogType = "success" | "failure" | "error";
type Log = { type: LogType; message: string };

export default function App() {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState({
    createEnrollment: true,
    verifyCode: false
  });
  const [sseEvent, setSseEvent] = useState<SseEvent | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [log, setLog] = useState<Log | null>(null);
  const remainingMs = sseEvent ? Math.max(0, sseEvent.expiresAt - now) : 0;
  const secondsRemaining = Math.round(remainingMs / 1000);
  const progress = (remainingMs / 30_000) * 100;

  const createEnrollment = async () => {
    setLog(null);
    setLoading((prev) => ({ ...prev, createEnrollment: true }));
    try {
      const response = await fetch("/api/enroll", { method: "POST" });
      if (!response.ok) throw new Error("Enrollment request failed");
      const result = (await response.json()) as Enrollment;
      setEnrollment(result);
    } catch {
      setLog({
        type: "error",
        message: "Could not create enrollment. Please try again."
      });
    } finally {
      setLoading((prev) => ({ ...prev, createEnrollment: false }));
    }
  };

  useEffect(() => {
    void createEnrollment();
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!enrollment) return;

    const eventSource = new EventSource("/events/totp");
    eventSource.onopen = () => setSseConnected(true);
    eventSource.onerror = () => {
      setSseConnected(false);
      setSseEvent(null);
    };
    const handleEvent = (event: MessageEvent<string>) => {
      const { code, expiresAt } = JSON.parse(event.data) as SseEvent;
      setSseEvent({ code, expiresAt });
    };
    eventSource.addEventListener("message", handleEvent);
    return () => {
      eventSource.removeEventListener("message", handleEvent);
      eventSource.close();
      setSseConnected(false);
    };
  }, [enrollment]);

  async function verifyCode(code: string) {
    if (code.length !== 6 || loading.verifyCode) return;
    setLog(null);
    setLoading((prev) => ({ ...prev, verifyCode: true }));
    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code })
      });
      if (!response.ok) throw new Error("Verification request failed");
      const result = (await response.json()) as { ok: boolean };
      setLog({
        type: result.ok ? "success" : "failure",
        message: result.ok
          ? "Code verified successfully"
          : "Invalid or expired code"
      });
    } catch {
      setLog({
        type: "error",
        message: "Something went wrong. Please try again."
      });
    } finally {
      setLoading((prev) => ({ ...prev, verifyCode: false }));
    }
  }

  function handleTokenInput(event: React.InputEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const code = input.value.replace(/\D/g, "").slice(0, 6);
    input.value = code;
    setLog(null);
    if (code.length === 6) {
      void verifyCode(code);
      input.value = "";
    }
  }

  return (
    <main className="shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="TOTP Playground">
          <span>TOTP</span>
          <i />
        </a>
      </header>

      <section className="intro">
        <div className="kicker">TIME-BASED ONE-TIME PASSWORD</div>
        <h1>
          One secret.
          <br />
          <span>Every 30 seconds.</span>
        </h1>
        <p>
          Explore how authenticator apps generate time-based codes, and how a
          server verifies them independently.
        </p>
      </section>

      <section className="panel setup-panel">
        <div className="section-heading">
          <div className="section-title">
            <i /> <h2>SETUP</h2>
          </div>
          <span className="section-index">01 / ENROLLMENT</span>
        </div>

        <div className="qr-area" aria-busy={loading.createEnrollment}>
          {loading.createEnrollment ? (
            <div
              className="qr-skeleton"
              role="status"
              aria-label="Loading enrollment"
            />
          ) : enrollment ? (
            <div className="qr-frame">
              <img src={enrollment.qrCode} alt="TOTP enrollment QR code" />
            </div>
          ) : (
            <p className="scan-copy">ENROLLMENT UNAVAILABLE</p>
          )}
          <p className="scan-copy">
            {loading.createEnrollment
              ? "PREPARING ENROLLMENT"
              : enrollment
                ? "SCAN WITH YOUR AUTHENTICATOR"
                : "PLEASE TRY AGAIN"}
          </p>
          {!loading.createEnrollment && enrollment && (
            <p className="muted small-copy">
              Google Authenticator · Microsoft Authenticator · 1Password
            </p>
          )}
        </div>

        {!loading.createEnrollment && !enrollment && (
          <button className="primary-button" onClick={createEnrollment}>
            TRY AGAIN <span>↗</span>
          </button>
        )}
      </section>

      <section className="panel verify-panel">
        <div className="section-heading">
          <div className="section-title">
            <i /> <h2>VERIFY</h2>
          </div>
          <div className="validation-info">
            <div className="section-index validation-index">
              <span
                className={`live-indicator ${sseConnected ? "connected" : ""}`}
                aria-label={sseConnected ? "SSE connected" : "SSE connecting"}
                title={sseConnected ? "SSE connected" : "SSE connecting"}
              >
                <i />
                {sseConnected ? "LIVE" : "WAIT"}
              </span>
              <code>{sseEvent?.code || "------"}</code>|
              <span>02 / VALIDATION</span>
            </div>
            <div className="code-progress-row">
              <span className="code-remaining">
                {sseEvent && `${secondsRemaining}s`}
              </span>
              <div
                className={`code-progress ${secondsRemaining <= 5 ? "orange" : "teal"}`}
                role="progressbar"
                aria-label="Time remaining for server code"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress ?? 0}
              >
                <span style={{ width: `${progress ?? 0}%` }} />
              </div>
            </div>
          </div>
        </div>
        <p className="panel-description">
          Open your authenticator app and enter the 6-digit code generated. Live
          code updates are displayed above for diagnosis. Real apps wont show
          that here(vibe-coded apps might though).
        </p>

        <form className="verify-form">
          <label htmlFor="otp-code">AUTHENTICATOR CODE</label>
          <input
            id="otp-code"
            className="otp-input"
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="[0-9]{6}"
            placeholder="123456"
            aria-label="Six-digit authenticator code"
            onInput={handleTokenInput}
            disabled={!enrollment || loading.verifyCode}
          />
          {loading.verifyCode && (
            <span className="verify-status" role="status">
              VERIFYING…
            </span>
          )}
        </form>
      </section>

      {log && (
        <div
          className={`log log-${log.type}`}
          role={log.type === "error" ? "alert" : "status"}
        >
          <b>{log.type === "success" ? "✓" : "!"}</b>
          {log.message}
        </div>
      )}

      <footer>
        <span className="footer-brand">
          TOTP <i />
        </span>
      </footer>
    </main>
  );
}
