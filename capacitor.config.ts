import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'app.nightgram.mobile',
  appName: 'NightGram',
  webDir: 'native-shell',
  server: {
    url: 'https://app.nightgram.example',
    cleartext: false,
    allowNavigation: ['app.nightgram.example']
  },
  android: { allowMixedContent: false },
  ios: { contentInset: 'automatic' },
  plugins: {
    SplashScreen: { launchShowDuration: 1200, backgroundColor: '#08070f', showSpinner: false },
    Keyboard: { resize: 'native' },
    PushNotifications: { presentationOptions: ['badge','sound','alert'] }
  }
};
export default config;
