import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
  useFonts,
} from "@expo-google-fonts/space-grotesk";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { HeroUINativeProvider } from "heroui-native";
import { useEffect } from "react";
import type { JSX } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { startAlerts } from "@/lib/alerts/alerts";
import { startBackground } from "@/lib/background/background";
import { qwatch } from "@/lib/ble/client";
import { loadAppSettings } from "@/lib/store/appSettings";
import { colors } from "@/lib/theme";
import { startUploader } from "@/lib/upload/uploader";

import "../global.css";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout(): JSX.Element | null {
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    const stops = [startUploader(), startAlerts(), startBackground()];
    void loadAppSettings().then(() => qwatch.restore());
    return () => {
      for (const stop of stops) stop();
    };
  }, []);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.cream },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="connect" options={{ presentation: "modal" }} />
        </Stack>
        <StatusBar style="dark" />
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  );
}
