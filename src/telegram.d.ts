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
  }

  interface TelegramWebAppRoot {
    WebApp: TelegramWebApp;
  }

  interface Window {
    Telegram: TelegramWebAppRoot;
  }
}
