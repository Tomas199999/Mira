import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Button, Countdown, Screen, StreakBadge, Text } from '@/components';
import { useChallengeState } from '@/features/challenge/useChallengeState';
import { submitPhoto, SubmitError, type SubmitResult } from '@/features/challenge/submit';
import { radius, space, useTheme } from '@/theme';
import { t } from '@/i18n';

type Phase =
  | { step: 'camera' }
  | { step: 'preview'; uri: string }
  | { step: 'analyzing' }
  | { step: 'result'; result: SubmitResult }
  | { step: 'error'; message: string; canRetry: boolean };

/**
 * La pantalla del desafío (§7, §64).
 *
 * El recorrido tiene que sentirse de un tirón: objeto → cámara → foto →
 * "analizando" → resultado. Sin galería: el desafío diario es una foto sacada
 * ahora, y aceptar la galería haría trivial la trampa.
 */
export default function ChallengeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state } = useChallengeState();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ step: 'camera' });
  const camera = useRef<CameraView>(null);

  const copy = t().home;
  const open = state.kind === 'open' ? state : null;

  if (!permission) {
    return <Screen><ActivityIndicator color={theme.color.accent} /></Screen>;
  }

  if (!permission.granted) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text variant="display" center>📷</Text>
          <Text variant="heading" center>{t().onboarding.cameraTitle}</Text>
          <Text variant="body" tone="secondary" center>{t().errors.cameraPermission}</Text>
          <Button label={t().onboarding.allow} onPress={() => void requestPermission()} />
          <Button label={t().common.cancel} variant="ghost" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  if (!open) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text variant="heading" center>{t().errors.challengeClosed}</Text>
          <Button label={t().common.done} onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  async function capture() {
    const photo = await camera.current?.takePictureAsync({ quality: 0.9, skipProcessing: false });
    if (photo?.uri) setPhase({ step: 'preview', uri: photo.uri });
  }

  async function send(uri: string) {
    if (!open) return;
    setPhase({ step: 'analyzing' });
    try {
      const result = await submitPhoto({
        windowId: open.windowId,
        photoUri: uri,
        deviceId: await deviceId(),
      });
      setPhase({ step: 'result', result });
    } catch (error) {
      const code = error instanceof SubmitError ? error.code : 'internal';
      setPhase({
        step: 'error',
        message: messageFor(code),
        // Sólo se reintenta lo que puede salir distinto. Si se acabaron los
        // intentos o el desafío cerró, ofrecer "reintentar" es mentir.
        canRetry: !['attempts_exhausted', 'challenge_not_open',
                    'challenge_already_completed', 'duplicate_photo'].includes(code),
      });
    }
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text variant="caption" tone="tertiary">{copy.photograph.toUpperCase()}</Text>
        <Text variant="title" center>{open.objectDisplayName.toUpperCase()}</Text>
        <Countdown until={open.closesAt} />
        <Text variant="caption" tone="tertiary">
          {open.maxAttempts - open.attemptsUsed} / {open.maxAttempts}
        </Text>
      </View>

      <View style={styles.stage}>
        {phase.step === 'camera' ? (
          <CameraView ref={camera} style={styles.fill} facing="back" />
        ) : phase.step === 'preview' ? (
          <Image source={{ uri: phase.uri }} style={styles.fill} resizeMode="cover" />
        ) : phase.step === 'analyzing' ? (
          <View style={[styles.fill, styles.centered, { backgroundColor: theme.color.surface }]}>
            <ActivityIndicator size="large" color={theme.color.accent} />
            <Text variant="heading" center>{t().common.analyzing}</Text>
          </View>
        ) : phase.step === 'result' ? (
          <ResultPanel result={phase.result} objectName={open.objectDisplayName} />
        ) : (
          <View style={[styles.fill, styles.centered, { backgroundColor: theme.color.surface }]}>
            <Text variant="display" center>😕</Text>
            <Text variant="body" tone="secondary" center style={styles.message}>{phase.message}</Text>
          </View>
        )}
      </View>

      <View style={styles.controls}>
        {phase.step === 'camera' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.openCamera}
            onPress={capture}
            style={[styles.shutter, { borderColor: theme.color.accent }]}
          >
            <View style={[styles.shutterInner, { backgroundColor: theme.color.accent }]} />
          </Pressable>
        ) : phase.step === 'preview' ? (
          <>
            <Button label={t().common.send} onPress={() => void send(phase.uri)} size="lg" />
            <Button label={t().common.retake} variant="ghost" onPress={() => setPhase({ step: 'camera' })} />
          </>
        ) : phase.step === 'result' ? (
          <Button label={t().common.done} onPress={() => router.back()} size="lg" />
        ) : phase.step === 'error' ? (
          <>
            {phase.canRetry ? (
              <Button label={t().common.retry} onPress={() => setPhase({ step: 'camera' })} size="lg" />
            ) : null}
            <Button label={t().common.done} variant="ghost" onPress={() => router.back()} />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function ResultPanel({ result, objectName }: { result: SubmitResult; objectName: string }) {
  const theme = useTheme();
  const copy = t().challenge;

  const [icon, title, body] =
    result.status === 'accepted'
      ? ['✅', copy.accepted, result.wasLate ? copy.acceptedLate : copy.streakGrew]
      : result.status === 'in_review'
      ? ['⏳', copy.inReview, copy.inReviewBody]
      : result.status === 'blocked'
      ? ['🚫', copy.blocked, copy.blockedBody]
      : ['🔍', copy.notFound, copy.notFoundBody.replace('{{object}}', objectName)];

  return (
    <View style={[styles.fill, styles.centered, { backgroundColor: theme.color.surface }]}>
      <Text variant="display" center>{icon}</Text>
      <Text variant="heading" center>{title}</Text>
      <Text variant="body" tone="secondary" center style={styles.message}>{body}</Text>
      {result.status === 'accepted' && !result.wasLate ? (
        <StreakBadge days={result.streak.current} size="lg" />
      ) : null}
    </View>
  );
}

function messageFor(code: string): string {
  const errors = t().errors;
  switch (code) {
    case 'attempts_exhausted': return errors.attemptsExhausted;
    case 'challenge_not_open': return errors.challengeClosed;
    case 'challenge_already_completed': return errors.alreadyCompleted;
    case 'duplicate_photo': return errors.duplicatePhoto;
    case 'moderation_blocked': return errors.moderationBlocked;
    case 'vision_unavailable': return errors.visionUnavailable;
    case 'upload_failed': return errors.uploadFailed;
    case 'rate_limited': return errors.rateLimited;
    default: return errors.generic;
  }
}

/** Identificador estable del dispositivo, para el anti-fraude (§35). */
async function deviceId(): Promise<string> {
  const KEY = 'mira.device_id';
  const existing = await SecureStore.getItemAsync(KEY);
  if (existing) return existing;
  const fresh = Crypto.randomUUID();
  await SecureStore.setItemAsync(KEY, fresh);
  return fresh;
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: space.xs, paddingHorizontal: space.lg, paddingBottom: space.md },
  stage: { flex: 1, marginHorizontal: space.lg, borderRadius: radius.xl, overflow: 'hidden' },
  fill: { flex: 1, width: '100%' },
  centered: { alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  message: { maxWidth: 300 },
  controls: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.sm, alignItems: 'center' },
  shutter: {
    width: 76, height: 76, borderRadius: 38, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30 },
});
