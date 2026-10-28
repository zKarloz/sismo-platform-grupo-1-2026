# Centro de alertas — Fase B: historial de entregas

## Alcance

- **API**: `GET /api/v1/alert-deliveries?page=1&page_size=5&status=&channel=` en el router ya existente de `services/api/app/routes/alerts.py`. Lee `alert_deliveries` junto a `alerts`, `alert_rules`, `seismic_events` y `data_sources`, con conteo y paginación **SQL**. Solo expone eventos **IGP/CENSIS**.
- **Autorización en FastAPI**: acceso para `administrador`, `operador_alertas` y `auditor`. Los roles `analista` y `solo_lectura` reciben 403 y el usuario sin sesión recibe 401. La interfaz avisa cuando el rol carece de acceso.
- **Privacidad**: el endpoint nunca devuelve `destination_ref`; muestra una versión enmascarada del correo (ejemplo `p***@example.com`), y restringe códigos de error a valores técnicos predefinidos. No devuelve errores crudos de SMTP ni secretos.
- **Frontend**: pestaña Entregas conectada a FastAPI con filtros independientes por canal y estado, `TablePagination` (5 registros iniciales, opciones 5/10/20), fechas en zona `America/Lima`, loading/error/empty states, tabla en escritorio y tarjetas en móvil. Se conservan prueba SMTP y configuración técnica solo para Administrador.
- **Modal Crear regla**: se elimina el indicador duplicado `M ≥ 3.7` situado junto al título; queda la etiqueta **Valor exacto M ≥** con entrada numérica a su lado. Se mantiene sincronizada con el deslizador, sin modificar las validaciones.

## Límites y seguridad

- **No** se modificaron tablas, migraciones, servicios de envío, jobs de GitHub Actions ni reglas de aprobación. **No** se activó el envío operativo por correo: es responsabilidad de las fases C y D.
- Un estado `sent` significa publicación en el canal interno o aceptación por SMTP; no garantiza entrega final al buzón ni lectura. Un código de error no contiene información del servidor SMTP.
- Las preferencias y correos personales siguen ejecutándose temporalmente hasta la transición controlada de la Fase E.
- Si no hay registros en `alert_deliveries` que correspondan a eventos IGP, la pestaña mostrará un estado vacío. Las pruebas SMTP técnicas no se convierten en alertas ni en entradas de esta tabla.

## Despliegue y validación

1. Guardar los cambios existentes e instalar el parche desde la raíz del proyecto. **Requiere Fase A instalada**.
2. Desplegar primero el **backend Render**, que sirve `/api/v1/alert-deliveries`. Comprobar autenticación con un usuario autorizado antes de desplegar el frontend Vercel.
3. En terminal 2, ejecutar `cd apps/web && npm run build && npm run dev`.
4. En terminal 3, desde la raíz, ejecutar:

   ```bash
   PYTHONPATH=services/api python -m pytest tests/backend/test_centro_alertas_fase_b.py -q
   node --test tests/frontend/centro-alertas-fase-a.test.cjs tests/frontend/centro-alertas-fase-b.test.cjs tests/frontend/alertas-tabs-shared.test.cjs tests/frontend/alertas-modales-pestanas-02.test.cjs
   ```

5. Revisar `/alertas/entregas` en escritorio y móvil; cambiar canal, estado, tamaño y página, abrir detalles y comprobar que los correos estén enmascarados. En `/alertas/reglas`, abrir Crear regla y comprobar sincronización de magnitud.
6. Verificar respuestas 401 sin sesión, 403 con `analista` o `solo_lectura`, y que solo se devuelven registros IGP/CENSIS.

## Pruebas locales del parche

- Se verificó sintaxis Python y TSX/TypeScript de los archivos modificados.
- **19 pruebas estáticas frontend aprobadas**.
- **3 pruebas HTTP backend aprobadas** en SQLite aislado, usando un ensamblado mínimo del router porque el ZIP de revisión no contenía el `app.main` y otros archivos para ejecutar el proyecto entero.
- La compilación integral Vite y las pruebas integradas en el repositorio original deben ejecutarse en el entorno del proyecto.

## Próximos pasos

- **Fase C**: concurrencia, reserva atómica e idempotencia del despachador SMTP, reintentos y auditoría.
- **Fase D**: habilitación controlada de correos operativos aprobados.
- **Fase E**: desactivación y retirada gradual de las notificaciones personales, conservando su historial.
