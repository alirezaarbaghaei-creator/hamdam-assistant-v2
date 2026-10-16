import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kateb.app',
  appName: 'همدم',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#0f172a',
    overrideUserInterfaceStyle: 'default',
  },
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      androidSpinnerStyle: 'large',
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
