import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Sähkön Kulutus",
  slug: "sahko-kulutus-app",
  version: "1.0.4",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "myapp",
  userInterfaceStyle: "automatic",
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff"
  },
  assetBundlePatterns: [
    "**/*"
  ],
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.rkuustie.sahkokulutusapp"
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#ffffff"
    },
    package: "com.rkuustie.sahkokulutusapp"
  },
  web: {
    bundler: "metro",
    favicon: "./assets/images/favicon.png"
  },
  plugins: [
    "expo-secure-store"
  ],
  extra: {
    YEAR: new Date().getFullYear().toString(),
    SPOT_MARGIN: '0.6',
    version: "1.0.4",  // Add version to extra
    eas: {
      projectId: "e2fb547e-f1ca-4b23-a523-f6cd28dfe547"
    }
  }
});