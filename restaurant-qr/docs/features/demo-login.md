# Feature: Demo Auto-Login

## Objetivo
Permitir que visitantes de la landing page accedan al dashboard de prueba con un solo click, sin ver ni ingresar credenciales.

## Flujo
```
Landing page → botón "Ver Demo" → /demo → auto-login → /dashboard
```

## Implementación
- **Ruta:** `src/app/demo/page.tsx`
- **Tipo:** Client Component (`'use client'`)
- **Método:** `supabase.auth.signInWithPassword()` en `useEffect` al montar
- **Credenciales:** Leídas desde variables de entorno `NEXT_PUBLIC_DEMO_*`
- **Redirección:** `window.location.href = '/dashboard'` tras login exitoso

## Variables de Entorno Requeridas
| Variable | Descripción |
|----------|-------------|
| `NEXT_PUBLIC_DEMO_EMAIL` | Email del usuario demo en Supabase |
| `NEXT_PUBLIC_DEMO_PASSWORD` | Contraseña del usuario demo |

## Usuario Demo en Supabase
- Creado manualmente en Supabase → Authentication → Users
- Tiene datos pre-cargados (clientes ficticios, campañas, métricas)
- Es una cuenta real de Supabase Auth con acceso completo al dashboard

## Seguridad
- Las credenciales son intencionalmente públicas (cuenta de demo)
- El usuario demo tiene acceso de solo lectura recomendado (configurar RLS si se desea)
- No tiene acceso a datos de producción
