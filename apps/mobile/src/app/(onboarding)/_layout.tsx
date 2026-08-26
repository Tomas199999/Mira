import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

export default function OnboardingLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.color.background },
        // Sin gesto de retroceso: el alta de perfil no es opcional.
        gestureEnabled: false,
      }}
    />
  );
}
