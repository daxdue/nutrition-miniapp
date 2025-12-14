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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pairingToken, setPairingToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const qrCodeRegionId = "qr-reader";

  // Get pairing token from URL or generate one
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");
    
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
      setScanning(true);

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
    }
  };

  const stopScanning = () => {
    if (scannerRef.current) {
      scannerRef.current
        .stop()
        .then(() => {
          scannerRef.current = null;
          setScanning(false);
        })
        .catch((err) => {
          console.error("Failed to stop scanner:", err);
          scannerRef.current = null;
          setScanning(false);
        });
    }
  };

  const handleScannedCode = async (scannedData: string) => {
    // Stop scanning once we get a result
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
    if (!pairingToken) {
      setError("No pairing token available.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Check if pairing token is valid
      const pairingTokenResponse = await axios.get(
        `${API_BASE}/api/pairing/token/${pairingToken}`
      );
      
      if (!pairingTokenResponse.data.ok) {
        setError("Pairing token is invalid or expired. Please use the /pair command in the bot to get a new pairing link.");
        return;
      }

      const response = await axios.post(
        `${API_BASE}/api/pairing/pair`,
        {
          token: pairingToken,
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
