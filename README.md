# Sentinel P2P by Kurukin

SaaS con IA que emite señales de trading P2P (Telegram + Web).  
Este repo usa Docker Swarm + Traefik + Portainer.  
Ruta en servidor: **/opt/projects/sentinel**.

## Estructura (inicial)
- apps/       -> Frontend (web/panel)
- api/        -> API pública/interna
- workers/    -> collector/engine/notifier (ingesta, señales, alertas)
- infra/      -> configs infra (traefik, backups, etc.)
- stacks/     -> definiciones de stacks para Swarm
- scripts/    -> utilidades de deploy/ops

## Cómo empezar
1. Copia `.env.example` a `.env` y ajusta valores.
2. Commits semánticos (convencional commits).
3. Despliegues via `stacks/` (se agregan en pasos posteriores).
