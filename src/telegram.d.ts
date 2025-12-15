export {};

declare global {
  interface TelegramWebAppUser {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  }

  interface TelegramWebApp {
    initDataUnsafe?: {
      user?: TelegramWebAppUser;
      [key: string]: any;
    };
    expand: () => void;
    ready: () => void;
    themeParams?: Record<string, any>;
    showScanQrPopup?: (
      params: { text?: string },
      callback: (data: string | null) => void
    ) => void;
    closeScanQrPopup?: () => void;
  }

  interface TelegramWebAppRoot {
    WebApp: TelegramWebApp;
  }

  interface Window {
    Telegram: TelegramWebAppRoot;
  }
}
