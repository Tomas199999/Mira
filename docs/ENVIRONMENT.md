# Variables de entorno

Copiar `.env.example` a `.env` y completar. `.env` está en `.gitignore` y nunca
se commitea.

## La única regla que importa

Todo lo que empieza con `EXPO_PUBLIC_` **se embebe en el binario de la app** y
es legible por cualquiera que descomprima el `.ipa` o el `.apk`.

Nunca, bajo ninguna circunstancia:

```
EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY   ← catastrófico
EXPO_PUBLIC_ANTHROPIC_API_KEY           ← catastrófico
EXPO_PUBLIC_UPLOAD_TOKEN_SECRET         ← catastrófico
```

## Inventario

| Variable | Dónde vive | Notas |
|---|---|---|
| `SUPABASE_URL` | backend | |
| `SUPABASE_ANON_KEY` | backend y app | pública por diseño; su poder lo limita RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **sólo backend** | saltea RLS por completo |
| `DATABASE_URL` | migraciones y jobs | |
| `ANTHROPIC_API_KEY` | **sólo backend** | |
| `VISION_MODEL_PRIMARY` | backend | `claude-haiku-4-5` |
| `VISION_MODEL_ESCALATION` | backend | `claude-opus-5` |
| `UPLOAD_TOKEN_SECRET` | **sólo backend** | firma los tokens de subida |
| `CRON_SECRET` | **sólo backend** | valida que un cron viene de Vercel |
| `APPLE_APP_ATTEST_TEAM_ID` / `_BUNDLE_ID` | backend | verificación de App Attest |
| `GOOGLE_PLAY_INTEGRITY_PROJECT_NUMBER` | backend | verificación de Play Integrity |
| `EXPO_ACCESS_TOKEN` | CI | builds de EAS |
| `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` / `_API_BASE_URL` / `_ENV` | app | públicas a propósito |

## Entornos

| Entorno | Proyecto Supabase | Notas |
|---|---|---|
| `development` | local o proyecto de desarrollo | datos descartables |
| `preview` | proyecto de staging | cada PR de Vercel apunta acá |
| `production` | proyecto de producción | acceso restringido |
