# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Descripción del proyecto

**SHIFT/LOG** es una aplicación web móvil para gestión de checklists de entrega de turno en un centro de control operativo (contexto: planta de energía o utilidad eléctrica). Está diseñada para operadores de turno en Chile.

## Estructura

Todo el proyecto es un único archivo autocontenido:

- `entrega_turno_mobile.html` — Aplicación completa (HTML + CSS + JS en un solo archivo)

No hay sistema de build, gestión de paquetes, ni dependencias externas. Para ejecutar, abrir el archivo directamente en un navegador móvil o servidor web estático.

## Arquitectura interna

El archivo HTML tiene tres capas integradas:

**CSS (`:root` variables de tema):** Paleta inspirada en GitHub Dark. Variables como `--bg-primary`, `--accent-green`, `--accent-blue` controlan el tema visual. Usa `100dvh` para compatibilidad con altura de viewport móvil.

**HTML:** Componentes secuenciales: header con reloj en vivo → selector de operador → barra de progreso → 7 ítems de checklist → botón de confirmación.

**JavaScript (sin framework):**
- `opStates`: objeto que mantiene el estado del checklist independiente por operador (4 operadores)
- `getISOWeek()` / `getWeekRange()`: cálculo de semana ISO y rango miércoles-martes (ciclo de turno)
- `updateClock()`: reloj en vivo con localización española (`es-CL`)
- `selectOperator(idx)`: cambia operador y restaura su estado guardado
- `toggleItem(el)`: alterna ítems del checklist y actualiza progreso
- `confirmarEntrega()`: valida que todos los ítems obligatorios estén completos antes de confirmar

**Los 4 operadores hardcodeados:** M. Pastén, M. Santander, J.T. Andrade, N. Ramos.

**Los 7 ítems del checklist** tienen categorías (`SCADA`, `CEN`, `O&M`, `Control`) y prioridad (`OBLIGATORIO` / `RECOMENDADO`). La confirmación solo valida los `OBLIGATORIO`.

## Convenciones

- Idioma de la UI: español de Chile (`es-CL`)
- Toda lógica de fechas usa ciclo miércoles-martes, no lunes-domingo
- El estado de cada operador se resetea al recargar la página (no hay persistencia en localStorage)
