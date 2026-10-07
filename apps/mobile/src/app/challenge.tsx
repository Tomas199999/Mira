import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Countdown, Icon, Screen, Text, type IconName } from '@/components';
import { useChallengeState } from '@/features/challenge/useChallengeState';
import { submitPhoto, SubmitError, type SubmitResult } from '@/features/challenge/submit';
import { fonts, radius, space, useTheme } from '@/theme';
import { t } from '@/i18n';

type Phase =
  | { step: 'camera' }
  | { step: 'preview'; uri: string }
  | { step: 'analyzing'; uri: string }
  | { step: 'result'; uri: string; result: SubmitResult }
  | { step: 'error'; uri: string | null; message: string; canRetry: boolean };

/**
 * La pantalla del desafío (§7, §64).
 *
 * La cámara ocupa la pantalla entera y todo lo demás flota encima: el objeto
 * que hay que fotografiar tiene que estar visible mientras se apunta. El
 * recorrido va de un tirón — objeto → foto → "analizando" → resultado — y
 * cada estado conserva la foto de fondo para que se sienta continuo.
 *
 * Sin galería: el desafío diario es una foto sacada ahora, y aceptar la
 * galería haría trivial la trampa.
 */
export default function ChallengeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, reload } = useChallengeState();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ step: 'camera' });
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const camera = useRef<CameraView>(null);

  const copy = t().challenge;
  const open = state.kind === 'open' ? state : null;

  if (!permission) {
    return <Screen><ActivityIndicator color={theme.color.accent} /></Screen>;
  }

  if (!permission.granted) {
    return (
      <Screen>
        <View style={styles.gate}>
          <View style={[styles.gateIcon, { backgroundColor: theme.color.accentSoft }]}>
            <Icon name="camera" size={26} tone="accent" />
          </View>
          <Text variant="title" center>{t().onboarding.cameraTitle}</Text>
          <Text variant="body" tone="secondary" center>{t().errors.cameraPermission}</Text>
          <View style={styles.gateActions}>
            <Button label={t().onboarding.allow} onPress={() => void requestPermission()} size="lg" />
            <Button label={t().common.cancel} variant="ghost" onPress={() => router.back()} />
          </View>
        </View>
      </Screen>
    );
  }

  if (!open) {
    return (
      <Screen>
        <View style={styles.gate}>
          <View style={[styles.gateIcon, { backgroundColor: theme.color.surface }]}>
            <Icon name="moon" size={26} tone="secondary" />
          </View>
          <Text variant="title" center>{t().errors.challengeClosed}</Text>
          <View style={styles.gateActions}>
            <Button label={t().common.done} onPress={() => router.back()} size="lg" />
          </View>
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
    setPhase({ step: 'analyzing', uri });
    try {
      const result = await submitPhoto({
        windowId: open.windowId,
        photoUri: uri,
        deviceId: await deviceId(),
      });
      setPhase({ step: 'result', uri, result });
    } catch (error) {
      const code = error instanceof SubmitError ? error.code : 'internal';
      setPhase({
        step: 'error',
        uri,
        message: messageFor(code),
        // Sólo se reintenta lo que puede salir distinto. Si se acabaron los
        // intentos o el desafío cerró, ofrecer "reintentar" es mentir.
        canRetry: !['attempts_exhausted', 'challenge_not_open',
                    'challenge_already_completed', 'duplicate_photo'].includes(code),
      });
    }
  }

  const shot = 'uri' in phase ? phase.uri : null;
  const remaining = open.maxAttempts - open.attemptsUsed;

  return (
    <View style={[styles.root, { backgroundColor: '#000' }]}>
      {/* Escenario: cámara viva, o la foto que se sacó */}
      {phase.step === 'camera' ? (
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} />
      ) : shot ? (
        <Image source={{ uri: shot }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}

      {/* Velos: arriba para el objeto, abajo para los controles */}
      <View style={[styles.veilTop, { paddingTop: insets.top + space.sm }]}>
        {/* El reloj va centrado en la pantalla, no entre dos bloques de ancho
            distinto: por eso está en su propia capa. */}
        <View style={styles.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.close}
            onPress={() => router.back()}
            hitSlop={10}
            style={styles.glassButton}
          >
            <Icon name="x" size={20} color="#fff" />
          </Pressable>
          <View pointerEvents="none" style={styles.countdownWrap}>
            <View style={styles.countdownPill}>
              <Icon name="clock" size={13} color="#fff" />
              <Countdown until={open.closesAt} onExpire={reload} />
            </View>
          </View>
        </View>

        {phase.step === 'camera' ? (
          <View style={styles.target}>
            <Text variant="overline" style={styles.dim}>{t().home.photograph}</Text>
            <Text style={styles.object}>{open.objectDisplayName}</Text>
          </View>
        ) : null}
      </View>

      {/* Estados que cubren la foto */}
      {phase.step === 'analyzing' ? (
        <Overlay>
          <ActivityIndicator size="large" color={theme.color.accent} />
          <Text variant="heading" center style={styles.onDark}>{t().common.analyzing}</Text>
        </Overlay>
      ) : phase.step === 'result' ? (
        <ResultOverlay result={phase.result} objectName={open.objectDisplayName} />
      ) : phase.step === 'error' ? (
        <Overlay>
          <View style={[styles.resultIcon, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
            <Icon name="alert-circle" size={30} color="#fff" />
          </View>
          <Text variant="body" center style={[styles.onDark, styles.message]}>{phase.message}</Text>
        </Overlay>
      ) : null}

      {/* Controles */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + space.lg }]}>
        {phase.step === 'camera' ? (
          <View style={styles.shutterRow}>
            <View style={styles.side}>
              {/* Los intentos son información del disparo: van donde se dispara. */}
              <View style={styles.attempts}>
                <Text style={styles.attemptsValue}>{remaining}</Text>
                <Text variant="caption" style={styles.dim}>/{open.maxAttempts}</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t().home.openCamera}
              onPress={capture}
              style={({ pressed }) => [styles.shutter, { borderColor: '#fff', opacity: pressed ? 0.6 : 1 }]}
            >
              <View style={[styles.shutterInner, { backgroundColor: theme.color.accent }]} />
            </Pressable>
            <View style={styles.side}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.flipCamera}
                onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
                style={styles.glassButton}
              >
                <Icon name="refresh-cw" size={20} color="#fff" />
              </Pressable>
            </View>
          </View>
        ) : phase.step === 'preview' ? (
          <View style={styles.stack}>
            <Button
              label={copy.sendPhoto}
              onPress={() => void send(phase.uri)}
              size="lg"
              icon={<Icon name="send" size={18} tone="onAccent" />}
            />
            <Button label={t().common.retake} variant="ghost" onPress={() => setPhase({ step: 'camera' })} />
          </View>
        ) : phase.step === 'result' ? (
          <Button label={t().common.done} onPress={() => router.back()} size="lg" />
        ) : phase.step === 'error' ? (
          <View style={styles.stack}>
            {phase.canRetry ? (
              <Button label={t().common.retry} onPress={() => setPhase({ step: 'camera' })} size="lg" />
            ) : null}
            <Button label={t().common.done} variant="ghost" onPress={() => router.back()} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return <View style={[StyleSheet.absoluteFill, styles.overlay]}>{children}</View>;
}

function ResultOverlay({ result, objectName }: { result: SubmitResult; objectName: string }) {
  const theme = useTheme();
  const copy = t().challenge;

  const [icon, tint, title, body]: [IconName, string, string, string] =
    result.status === 'accepted'
      ? ['check', theme.color.accent, copy.accepted, result.wasLate ? copy.acceptedLate : copy.streakGrew]
      : result.status === 'in_review'
      ? ['eye', theme.color.info, copy.inReview, copy.inReviewBody]
      : result.status === 'blocked'
      ? ['slash', theme.color.danger, copy.blocked, copy.blockedBody]
      : ['search', theme.color.textSecondary, copy.notFound, copy.notFoundBody.replace('{{object}}', objectName)];

  const grew = result.status === 'accepted' && !result.wasLate;

  return (
    <Overlay>
      <View style={[styles.resultIcon, { backgroundColor: tint }]}>
        <Icon name={icon} size={30} color={theme.color.background} />
      </View>
      <Text variant="title" center style={styles.onDark}>{title}</Text>
      <Text variant="body" center style={[styles.dim, styles.message]}>{body}</Text>
      {grew ? (
        <View style={[styles.streak, { backgroundColor: theme.color.streakSoft }]}>
          <Icon name="zap" size={20} tone="streak" />
          <Text style={[styles.streakNumber, { color: theme.color.streak }]}>{result.streak.current}</Text>
        </View>
      ) : null}
    </Overlay>
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

const GLASS = 'rgba(255,255,255,0.16)';

const styles = StyleSheet.create({
  root: { flex: 1 },

  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.lg },
  gateIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  gateActions: { alignSelf: 'stretch', gap: space.sm, marginTop: space.lg },

  veilTop: { paddingHorizontal: space.lg, paddingBottom: space.lg, backgroundColor: 'rgba(0,0,0,0.45)' },
  topRow: { flexDirection: 'row', alignItems: 'center', minHeight: 40 },
  countdownWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  glassButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: GLASS },
  countdownPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: GLASS },
  attempts: { flexDirection: 'row', alignItems: 'baseline', gap: 1 },
  attemptsValue: { fontFamily: fonts.displayBold, fontSize: 18, lineHeight: 22, color: '#fff', fontVariant: ['tabular-nums'] },

  target: { alignItems: 'center', marginTop: space.lg, gap: 2 },
  object: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.8, color: '#fff', textAlign: 'center' },

  overlay: { alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.xl, backgroundColor: 'rgba(0,0,0,0.72)' },
  resultIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  streak: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.lg, borderRadius: radius.pill, marginTop: space.md },
  streakNumber: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, fontVariant: ['tabular-nums'] },
  message: { maxWidth: 320 },
  onDark: { color: '#fff' },
  dim: { color: 'rgba(255,255,255,0.7)' },

  controls: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingTop: space.lg },
  shutterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  side: { width: 44, alignItems: 'center', justifyContent: 'center' },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29 },
  stack: { gap: space.sm },
});
