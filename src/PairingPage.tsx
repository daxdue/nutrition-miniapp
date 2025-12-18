import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import axios from "axios";
import "./PairingPage.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

interface PairingPageProps {
  onBack: () => void;
}

function PairingPage({ onBack }: PairingPageProps) {
  const [scanning, setScanning] = useState(false);
  const [scanMethod, setScanMethod] = useState<"telegram" | "html5" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pairingToken, setPairingToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const qrCodeRegionId = "qr-reader";

  const normalizePairingToken = (raw: unknown): string | null => {
    if (raw == null) return null;

    const acceptIfLooksLikeToken = (value: string): string | null => {
      const trimmed = value.trim().replace(/^"+|"+$/g, "");
      if (!trimmed) return null;
      if (trimmed === "[object Object]") return null;
      // Allow typical tokens: alphanum, dash, underscore (covers hex IDs like the QR sample)
      if (/^[A-Za-z0-9_-]{6,128}$/.test(trimmed)) return trimmed;
      return null;
    };

    const extractFromQueryLike = (value: string): string | null => {
      if (!value.includes("token") && !value.includes("start_param")) return null;

      try {
        const url = new URL(value);
        const direct = url.searchParams.get("token") || url.searchParams.get("start_param");
        if (direct) return direct;
      } catch {
        // not a full URL, fall through to search params
      }

      try {
        const params = new URLSearchParams(value);
        const direct = params.get("token") || params.get("start_param");
        if (direct) return direct;
      } catch {
        // ignore
      }

      return null;
    };

    const parseString = (str: string): string | null => {
      if (!str) return null;
      const trimmed = str.trim();
      if (!trimmed || trimmed === "[object Object]") return null;

      const directAccept = acceptIfLooksLikeToken(trimmed);
      if (directAccept) return directAccept;

      // Query-like token? (token=..., start_param=..., or URL with them)
      const fromQuery = extractFromQueryLike(trimmed);
      if (fromQuery) return parseString(fromQuery);

      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === "string") return parseString(parsed);
        if (parsed && typeof parsed.token === "string") return parseString(parsed.token);
      } catch {
        // not JSON, keep going
      }

      try {
        const decoded = atob(trimmed);
        const decodedParsed = JSON.parse(decoded);
        if (typeof decodedParsed === "string") return parseString(decodedParsed);
        if (decodedParsed && typeof decodedParsed.token === "string") {
          return parseString(decodedParsed.token);
        }

        // Maybe base64 of querystring
        const decodedQuery = extractFromQueryLike(decoded);
        if (decodedQuery) return parseString(decodedQuery);
      } catch {
        // not base64 JSON, fall through
      }

      return trimmed;
    };

    if (typeof raw === "string") return parseString(raw);

    if (typeof raw === "object") {
      const maybeToken = (raw as Record<string, unknown>).token;
      if (typeof maybeToken === "string") return parseString(maybeToken);
      return null;
    }

    return null;
  };

  const resolvePairingToken = (): string | null => {
    const urlParams = new URLSearchParams(window.location.search);

    const candidates = [
      urlParams.get("token"),
      urlParams.get("start_param"),
      window.Telegram?.WebApp?.initDataUnsafe?.start_param,
      (window.Telegram?.WebApp?.initDataUnsafe as any)?.startParam,
      (window.Telegram?.WebApp?.initDataUnsafe as any)?.startapp,
      (window.Telegram?.WebApp as any)?.initData,
      urlParams.toString(), // entire query string
    ];

    for (const candidate of candidates) {
      const token = normalizePairingToken(candidate);
      console.log("Token: ", token);
      if (token) return token;
    }

    return null;
  };

  // Get pairing token from URL or generate one
  useEffect(() => {
    const token = resolvePairingToken();
    
    if (token) {
      setPairingToken(token);
    } else {
      // If no token in URL, try to get it from Telegram user
      const tg = window.Telegram?.WebApp;
      const user = tg?.initDataUnsafe?.user;
      
      if (user?.id) {
        // Generate pairing token for the user
        //generatePairingToken(user.id);
      } else {
        setError("No pairing token found. Please use the /pair command in the bot.");
      }
    }
  }, []);

  /*const generatePairingToken = async (telegramUserId: number) => {
    try {
      setLoading(true);
      // This endpoint should be called from backend with user authentication
      // For now, we'll use the token from URL
      setError("Please use the /pair command in the bot to get a pairing link.");
    } catch (err: any) {
      setError("Failed to generate pairing token: " + (err?.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };*/

  const startScanning = async () => {
    if (!pairingToken) {
      setError("No pairing token available. Please use the /pair command in the bot.");
      return;
    }

    try {
      setError(null);
      const tg = window.Telegram?.WebApp;

      if (tg?.showScanQrPopup) {
        setScanning(true);
        setScanMethod("telegram");

        tg.showScanQrPopup(
          { text: "Scan the QR code from your Garmin watch" },
          (data) => {
            tg.closeScanQrPopup?.(); // ensure popup closes even if state is stale

            if (!data) {
              setScanning(false);
              setScanMethod(null);
              return;
            }

            setScanning(false);
            setScanMethod(null);
            handleScannedCode(data);
          }
        );
        return;
      }

      setScanning(true);
      setScanMethod("html5");

      const html5QrCode = new Html5Qrcode(qrCodeRegionId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" }, // Use back camera
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          // QR code scanned successfully
          handleScannedCode(decodedText);
        },
        (errorMessage) => {
          // Ignore scanning errors (they're frequent during scanning)
          console.log(errorMessage);
        }
      );
    } catch (err: any) {
      console.error("Failed to start camera:", err);
      setError("Failed to access camera. Please grant camera permissions.");
      setScanning(false);
      setScanMethod(null);
    }
  };

  const stopScanning = () => {
    if (scanMethod === "telegram") {
      window.Telegram?.WebApp?.closeScanQrPopup?.();
      setScanning(false);
      setScanMethod(null);
      return;
    }

    if (scannerRef.current) {
      scannerRef.current
        .stop()
        .then(() => {
          scannerRef.current = null;
          setScanning(false);
          setScanMethod(null);
        })
        .catch((err) => {
          console.error("Failed to stop scanner:", err);
          scannerRef.current = null;
          setScanning(false);
          setScanMethod(null);
        });
    } else {
      setScanning(false);
      setScanMethod(null);
    }
  };

  const handleScannedCode = async (scannedData: string) => {
    // Stop scanning once we get a result
    console.log("Scanned QR data: ", scannedData);
    stopScanning();

    // The QR code should contain the deviceId from the Garmin watch
    // Format: deviceId or a JSON with deviceId
    let deviceId: string;

    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(scannedData);
      deviceId = parsed.deviceId || scannedData;
    } catch {
      // If not JSON, assume it's just the deviceId
      deviceId = scannedData.trim();
    }

    if (!deviceId) {
      setError("Invalid QR code format. Please scan the QR code from your Garmin watch.");
      return;
    }

    // Send pairing request
    await pairDevice(deviceId);
  };

  const pairDevice = async (deviceId: string) => {
    let normalizedToken = pairingToken;

    if (!normalizedToken || normalizedToken === "[object Object]") {
      normalizedToken = resolvePairingToken();
      if (normalizedToken) {
        setPairingToken(normalizedToken);
      }
    }

    if (!normalizedToken || normalizedToken === "[object Object]") {
      setError("No pairing token available.");
      return;
    }

    const tokenForUrl = encodeURIComponent(normalizedToken);

    try {
      setLoading(true);
      setError(null);

      // Check if pairing token is valid
      const pairingTokenResponse = await axios.get(
        `${API_BASE}/api/pairing/token/${tokenForUrl}`,
        { validateStatus: (status) => status < 500 } // allow 4xx so we can show friendly message
      );

      if (
        pairingTokenResponse.status >= 400 ||
        !pairingTokenResponse.data?.token
      ) {
        setError("Pairing token is invalid or expired. Please use the /pair command in the bot to get a new pairing link.");
        return;
      }

      const response = await axios.post(
        `${API_BASE}/api/pairing/pair`,
        {
          token: normalizedToken,
          deviceId: deviceId,
        }
      );

      if (response.data.ok) {
        setSuccess(
          `✅ Device paired successfully!\n\nAPI Key:\n${response.data.apiKey}\n\nSave this API key and configure it in your Garmin watch app.`
        );
      } else {
        setError(response.data.error || "Pairing failed");
      }
    } catch (err: any) {
      console.error("Pairing error:", err);
      setError(
        err?.response?.data?.error ||
        "Failed to pair device. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleManualEntry = () => {
    const deviceId = prompt("Enter the Device ID from your Garmin watch:");
    if (deviceId && deviceId.trim()) {
      pairDevice(deviceId.trim());
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
      window.Telegram?.WebApp?.closeScanQrPopup?.();
    };
  }, []);

  return (
    <div className="pairing-page">
      <div className="app-header">
        <div>
          <div className="app-title">⌚ Pair Garmin Watch</div>
          <div className="app-subtitle">
            Scan the QR code from your watch or enter Device ID manually
          </div>
        </div>
        <button onClick={onBack} className="back-button">
          ← Back
        </button>
      </div>

      {success && (
        <div className="card success-card">
          <h3>✅ Success!</h3>
          <pre className="api-key-display">{success}</pre>
          <button
            onClick={() => {
              setSuccess(null);
              onBack();
            }}
            className="primary-button"
          >
            Done
          </button>
        </div>
      )}

      {error && !success && (
        <div className="card error-card">
          <p>{error}</p>
        </div>
      )}

      {!success && (
        <>
          {!scanning ? (
            <div className="card">
              <h3>Instructions</h3>
              <ol className="instructions-list">
                <li>Open the Nutrition Assistant app on your Garmin watch</li>
                <li>If not paired, the watch will display a Device ID</li>
                <li>Click "Scan QR Code" to scan the QR code from your watch, or</li>
                <li>Click "Enter Device ID Manually" to type it in</li>
              </ol>

              <div className="button-group">
                <button
                  onClick={startScanning}
                  disabled={!pairingToken || loading}
                  className="primary-button"
                >
                  📷 Scan QR Code
                </button>
                <button
                  onClick={handleManualEntry}
                  disabled={!pairingToken || loading}
                  className="secondary-button"
                >
                  ⌨️ Enter Device ID Manually
                </button>
              </div>

              {!pairingToken && (
                <p className="small" style={{ marginTop: 16, color: "#f97373" }}>
                  No pairing token found. Please use the /pair command in the bot to get a pairing link.
                </p>
              )}
            </div>
          ) : scanMethod === "telegram" ? (
            <div className="card">
              <h3>Scanning in Telegram...</h3>
              <p>
                The Telegram scanner popup is active. Point your camera at the QR code from your Garmin watch or close the popup to cancel.
              </p>
              <button
                onClick={stopScanning}
                className="secondary-button"
                style={{ marginTop: 16 }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="card">
              <h3>Scanning QR Code...</h3>
              <div id={qrCodeRegionId} className="qr-scanner-container"></div>
              <button
                onClick={stopScanning}
                className="secondary-button"
                style={{ marginTop: 16 }}
              >
                Stop Scanning
              </button>
            </div>
          )}

          {loading && (
            <div className="card">
              <p>Pairing device...</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default PairingPage;
