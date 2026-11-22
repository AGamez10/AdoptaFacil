# Matriz de roles de la API

> **Archivo generado** por `apps/api/src/core/rbac/role-matrix.spec.ts` a partir de los
> decoradores reales de los controladores. No se edita a mano: si cambias un permiso, la
> prueba falla hasta regenerarlo con
> `UPDATE_ROLE_MATRIX=1 pnpm --filter @adoptafacil/api test -- role-matrix`,
> y el cambio queda a la vista en el PR.

Es la primera barrera (el rol). Las reglas que dependen de datos (firmante designado,
último propietario, conflicto de interés, solo lo propio) las aplica cada servicio y las
prueban las suites de integración. El resumen en palabras está en
`docs/seguridad/roles-y-organizaciones.md`, sección 9.

Rutas: 465. Con `@Roles`: 296. Autenticadas sin `@Roles` (cada una revisada): 86. Públicas: 83.

| Ruta | Prop. | Admin | Oper. | Vet. | Vol. | Temp. | Audit. | P.Admin | P.Super | Otro acceso |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | --- |
| `GET /adoptions` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /adoptions` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /adoptions/:id/transitions` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /adoptions/contracts` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /adoptions/contracts/:id` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `PATCH /adoptions/contracts/:id/data` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /adoptions/contracts/:id/pdf` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /adoptions/contracts/:id/signatures` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /adoptions/contracts/:id/signatures/:signerId/image` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /adoptions/contracts/:id/transitions` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /adoptions/contracts/by-request/:requestId` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /adoptions/contracts/org/:id` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /adoptions/contracts/org/:id/pdf` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /adoptions/contracts/org/:id/signatures/:signerId/image` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /adoptions/deliveries` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /adoptions/deliveries/:id/cancel` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /adoptions/deliveries/:id/code` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /adoptions/deliveries/:id/confirm` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /adoptions/deliveries/by-contract/:contractId` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /adoptions/deliveries/mine` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /adoptions/deliveries/mine/:id` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /adoptions/deliveries/photo-target` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /adoptions/followups` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /adoptions/followups/:id/complete` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /adoptions/followups/:id/photo` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /adoptions/followups/:id/submit` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /adoptions/followups/by-contract/:contractId` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /adoptions/followups/mine` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /adoptions/mine` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /animals` | ✓ | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |
| `POST /animals` | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `POST /animals/:animalId/behavior-disclosures` | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `GET /animals/:animalId/behavior-disclosures/current` | ✓ | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |
| `GET /animals/:animalId/clinical-events` | ✓ | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |
| `POST /animals/:animalId/clinical-events` | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `POST /animals/:animalId/clinical-events/:eventId` | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `GET /animals/:animalId/clinical-events/:eventId/history` | ✓ | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |
| `GET /animals/:animalId/clinical-events/card` | ✓ | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |
| `GET /animals/:animalId/clinical-events/carnet` | ✓ | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |
| `GET /animals/:animalId/clinical-events/carnet.pdf` | ✓ | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |
| `POST /animals/:animalId/clinical-events/uploads` | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `DELETE /animals/:id` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /animals/:id` | ✓ | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |
| `PATCH /animals/:id` | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `POST /animals/:id/activate` | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `POST /animals/:id/deactivate` | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `POST /animals/:id/photos` | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `DELETE /animals/:id/photos/:photoId` | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `POST /animals/:id/register-death` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /animals/breeds` | ✓ | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |
| `POST /animals/breeds` | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `POST /animals/bulk-import` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /animals/bulk-import/template` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /auth/google` |  |  |  |  |  |  |  |  |  | pública |
| `POST /auth/invitations/accept` |  |  |  |  |  |  |  |  |  | pública |
| `POST /auth/invitations/accept/google` |  |  |  |  |  |  |  |  |  | pública |
| `POST /auth/invitations/preview` |  |  |  |  |  |  |  |  |  | pública |
| `POST /auth/login` |  |  |  |  |  |  |  |  |  | pública |
| `POST /auth/logout` |  |  |  |  |  |  |  |  |  | pública |
| `GET /auth/me` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `PATCH /auth/me/profile` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /auth/mfa/enroll` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /auth/mfa/enroll/confirm` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /auth/mfa/status` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /auth/mfa/verify` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /auth/password-reset` |  |  |  |  |  |  |  |  |  | pública |
| `POST /auth/password-reset/confirm` |  |  |  |  |  |  |  |  |  | pública |
| `POST /auth/refresh` |  |  |  |  |  |  |  |  |  | pública |
| `POST /auth/refresh/silent` |  |  |  |  |  |  |  |  |  | pública |
| `POST /auth/register/organization` |  |  |  |  |  |  |  |  |  | pública |
| `POST /auth/register/person` |  |  |  |  |  |  |  |  |  | pública |
| `POST /billing/webhooks/mercadopago` |  |  |  |  |  |  |  |  |  | pública |
| `GET /campaigns` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `POST /campaigns` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /campaigns/:campaignId/evidences` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `POST /campaigns/:campaignId/evidences` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /campaigns/:id` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `PATCH /campaigns/:id` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /campaigns/funding/reconcile` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /clinical-reminders` | ✓ | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |
| `POST /clinical-reminders/:id/acknowledge` | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `POST /clinical-reminders/:id/dismiss` | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `POST /coffee/webhooks/mercadopago` |  |  |  |  |  |  |  |  |  | pública |
| `DELETE /community/comments/:id` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /community/pets` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /community/pets` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `DELETE /community/pets/:id` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `PATCH /community/pets/:id` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /community/posts` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /community/posts` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `DELETE /community/posts/:id` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /community/posts/:id` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `PATCH /community/posts/:id` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /community/posts/:id/comments` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /community/posts/:id/comments` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /community/posts/:id/like` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `PUT /community/posts/:id/reaction` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `PATCH /community/posts/:id/shareable` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /community/posts/mine` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /community/reactions/mine` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /community/services` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `PATCH /community/services/:id` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /community/services/:id/reviews` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /community/services/mine` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /custody/account/summary` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `POST /custody/animals/:animalId/authority-handover` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /custody/animals/:animalId/contract-prefill` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `GET /custody/animals/:animalId/documents` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `POST /custody/animals/:animalId/documents` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /custody/animals/:animalId/events` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /custody/animals/:animalId/intakes` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `POST /custody/animals/:animalId/intakes` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /custody/animals/:animalId/overview` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `POST /custody/animals/:animalId/releases` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /custody/animals/:animalId/report` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /custody/animals/:animalId/timeline` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `GET /custody/charges` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `POST /custody/charges` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /custody/charges/:id/cancel` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /custody/charges/:id/collection` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /custody/charges/:id/extensions` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `DELETE /custody/charges/:id/payment-link` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /custody/charges/:id/payment-link` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /custody/charges/:id/payments` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /custody/contract-templates` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `POST /custody/contract-templates` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `PUT /custody/contract-templates/:key` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /custody/contract-templates/:key/archive` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /custody/contract-templates/:key/versions` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `GET /custody/contracts` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `POST /custody/contracts` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /custody/contracts/:id` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `PUT /custody/contracts/:id` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /custody/contracts/:id/cancel` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /custody/contracts/:id/end` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /custody/contracts/:id/issue` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /custody/contracts/:id/preview` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `GET /custody/documents/:id/file` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `PUT /custody/intakes/:id` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /custody/intakes/:id/finalize` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /custody/intakes/:id/photos` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /custody/online-payments/settings` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `PUT /custody/online-payments/settings` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /custody/payments/:id/void` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /custody/reports/animals` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `GET /custody/reports/animals/csv` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `GET /custody/reports/animals/pdf` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `GET /custody/reports/animals/xlsx` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `GET /custody/responsibles` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `POST /custody/responsibles` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `PUT /custody/responsibles/:id` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /custody/responsibles/:id/statement` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `POST /donations` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /donations/:id/certificate` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /donations/:id/certificate` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /donations/:id/receipt` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /donations/mine` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /donations/received` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /donations/webhook` |  |  |  |  |  |  |  |  |  | pública |
| `POST /donations/webhook/mercadopago` |  |  |  |  |  |  |  |  |  | pública |
| `POST /donations/webhook/mercadopago/:organizationId` |  |  |  |  |  |  |  |  |  | pública |
| `GET /health` |  |  |  |  |  |  |  |  |  | pública |
| `GET /legal/me` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /legal/me/acceptances` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /legal/me/revocations` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /marketplace/products` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `POST /marketplace/products` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /marketplace/products/:id` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `PATCH /marketplace/products/:id` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `PUT /marketplace/products/:id/image` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /marketplace/products/:id/images` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `DELETE /marketplace/products/:id/images/:imageId` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `PUT /marketplace/products/:id/images/:imageId/file` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /marketplace/products/:id/images/file` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /me/consents` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /me/consents` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /me/consents/revoke` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /me/notifications` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /me/notifications/read` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /me/privacy/data` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /me/privacy/suppression` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /me/push/config` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /me/push/subscriptions` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /me/push/subscriptions/remove` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /metrics` |  |  |  |  |  |  |  |  |  | pública |
| `GET /org/accounting` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `GET /org/accounting/periods/:period` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `POST /org/accounting/periods/:period/close` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/accounting/periods/:period/export` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `GET /org/accounting/periods/:period/reconciliation` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `POST /org/accounting/periods/:period/report` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /org/accounting/periods/:period/reread` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /org/accounting/periods/:period/shares` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `DELETE /org/accounting/shares/:id` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /org/announcements` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/announcements/audience` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/dashboard/donations` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `GET /org/documents` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `POST /org/documents` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/documents/:id/prefill` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /org/documents/file` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/documents/verification` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `GET /org/exports/data.xlsx` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/exports/impact-report.pdf` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/formalization` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /org/formalization/capabilities` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /org/formalization/dian-verification/retry` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/formalization/history` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /org/formalization/transitions` | ✓ |  |  |  |  |  |  |  |  |  |
| `GET /org/invitations` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /org/invitations` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `DELETE /org/invitations/:invitationId` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/ledger` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `POST /org/ledger` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/ledger/:id/support` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `POST /org/ledger/:id/void` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/legal-representative` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `POST /org/legal-representative` | ✓ |  |  |  |  |  | ✓ |  |  |  |
| `GET /org/members` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `DELETE /org/members/:userId` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `PUT /org/members/:userId/role` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/mercadopago/callback` |  |  |  |  |  |  |  |  |  | pública |
| `DELETE /org/mercadopago/connect` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/mercadopago/connect` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/mercadopago/status` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/pending-reads` | ✓ | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |
| `POST /org/pending-reads` | ✓ | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |
| `GET /org/plan` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /org/plan/cancel` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /org/plan/checkout` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/plan/checkout/status` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `DELETE /org/portal/domain` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/portal/domain` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `PUT /org/portal/domain` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /org/portal/domain/verify` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/portal/preview` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |
| `GET /org/portal/preview/animals` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |
| `GET /org/portal/preview/campaigns` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |
| `GET /org/profile` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `PUT /org/profile` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /org/profile/uploads` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/qr` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `PUT /org/qr/target` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/reports` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `POST /org/reports` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /org/reports/:id/decision` | ✓ |  |  |  |  |  | ✓ |  |  |  |
| `GET /org/reports/:id/pdf` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `POST /org/reports/:id/signature-requests` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /org/reports/:id/xlsx` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `GET /org/reports/pending-signatures` | ✓ |  |  |  |  |  | ✓ |  |  |  |
| `PUT /org/reports/policy` | ✓ |  |  |  |  |  |  |  |  |  |
| `GET /org/reports/readiness` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `GET /org/signers` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /org/signers` | ✓ |  |  |  |  |  |  |  |  |  |
| `DELETE /org/signers/:id` | ✓ |  |  |  |  |  |  |  |  |  |
| `GET /org/status` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |
| `POST /org/status/submit` | ✓ |  |  |  |  |  |  |  |  |  |
| `GET /org/summary` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /platform/coffee` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/coffee/campaigns` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/coffee/deliveries` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/coffee/deliveries` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `PATCH /platform/coffee/lots/:id` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/coffee/lots/:id/close` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/coffee/lots/:id/pause` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/coffee/lots/:id/physical-sales` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/coffee/lots/:id/resume` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/coffee/orders` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/coffee/orders/:id/shipped` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/coffee/physical-sales` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/coffee/physical-sales/:id/reverse` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/coffee/products` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/coffee/products/:id/lots` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/community/posts` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `PATCH /platform/community/posts/:id/moderate` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/community/service-reviews` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `PATCH /platform/community/service-reviews/:id/moderate` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/community/services` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `PATCH /platform/community/services/:id/moderate` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `PATCH /platform/community/services/:id/partner` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/dashboard/admin` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/dashboard/super-admin` |  |  |  |  |  |  |  |  | ✓ |  |
| `POST /platform/documents/:id/decision` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/documents/:id/verification` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/documents/queue` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/duplicates/:id/decision` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/duplicates/queue` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/email-templates` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/email-templates/:event` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `PUT /platform/email-templates/:event/active` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `PUT /platform/email-templates/:event/enabled` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/email-templates/:event/preview` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/email-templates/:event/test-send` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/email-templates/:event/versions` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/organizations` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/organizations/:id/plan` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `PUT /platform/organizations/:id/plan` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/organizations/:organizationId/formalization/transitions` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/organizations/:organizationId/status` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/review-claims` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `DELETE /platform/review-claims/:organizationId` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `PUT /platform/review-claims/:organizationId` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/reviews/:id/decision` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/reviews/:id/hide` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/reviews/queue` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/settings` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `PUT /platform/settings` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/settings/uploads` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/workspace/activity` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/workspace/approvals` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/workspace/approvals` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/workspace/approvals/:id/approve` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/workspace/approvals/:id/cancel` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/workspace/approvals/:id/export.csv` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/workspace/approvals/:id/reject` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/workspace/me` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/workspace/team` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/workspace/tickets` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /platform/workspace/tickets/:id` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/workspace/tickets/:id/notes` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/workspace/tickets/:id/release` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/workspace/tickets/:id/status` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `POST /platform/workspace/tickets/:id/take` |  |  |  |  |  |  |  | ✓ | ✓ |  |
| `GET /portals/theme` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `PUT /portals/theme` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /public/accounting/shares/export` |  |  |  |  |  |  |  |  |  | pública |
| `POST /public/accounting/shares/preview` |  |  |  |  |  |  |  |  |  | pública |
| `POST /public/accounting/signature-package` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/animals` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/campaigns` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/campaigns/:id` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/campaigns/:id/accountability` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/coffee` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/coffee/:code` |  |  |  |  |  |  |  |  |  | pública |
| `POST /public/coffee/:code/checkout` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/coffee/campaigns` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/coffee/orders/:reference` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/community/leaders` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/community/posts` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/community/posts/:id` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/community/posts/:id/card.png` |  |  |  |  |  |  |  |  |  | pública |
| `POST /public/community/pre-registrations` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/community/services` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/community/services/:id` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/community/services/:id/reviews` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/config/features` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/custody/pay/:token` |  |  |  |  |  |  |  |  |  | pública |
| `POST /public/custody/pay/:token/checkout` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/custody/pay/status/:reference` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/donations/access/:token` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/donations/certificates/:code` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/donations/directory` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/donations/organizations/:organizationId/availability` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/donations/status/:reference` |  |  |  |  |  |  |  |  |  | pública |
| `POST /public/email/unsubscribe` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/hero-banner` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/legal/documents` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/marketplace/products` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/marketplace/products/:id` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/network` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/organizations/:slug` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/organizations/:slug/animals` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/organizations/:slug/animals/:ref` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/organizations/:slug/campaigns` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/organizations/:slug/ledger` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/organizations/:slug/reputation-summary` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/organizations/:slug/reviews` |  |  |  |  |  |  |  |  |  | pública |
| `POST /public/organizations/:slug/reviews` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /public/organizations/:slug/theme` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/organizations/:slug/volunteer-opportunities` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/organizations/by-subdomain/:subdomain` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/portal-domains/ask` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/portal-domains/resolve` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/qr/:code` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/reports/:code` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/resources/needs` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/resources/needs/:id` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/resources/open-offers` |  |  |  |  |  |  |  |  |  | pública |
| `POST /public/security/csp-report` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/share/p/:id` |  |  |  |  |  |  |  |  |  | pública |
| `POST /public/signature-requests/decision` |  |  |  |  |  |  |  |  |  | pública |
| `POST /public/signature-requests/pdf` |  |  |  |  |  |  |  |  |  | pública |
| `POST /public/signature-requests/preview` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/sponsorships/animals/:animalId` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/sponsorships/status/:reference` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/transparency/national` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/volunteer-certificates/:code` |  |  |  |  |  |  |  |  |  | pública |
| `GET /public/volunteer-opportunities` |  |  |  |  |  |  |  |  |  | pública |
| `GET /rbac/my-roles` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /rbac/roles` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `POST /rbac/roles` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `DELETE /rbac/roles/:userId/:role` | ✓ |  |  |  |  |  |  |  |  |  |
| `GET /resources/deliveries` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `GET /resources/deliveries/:deliveryId/evidences` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `POST /resources/deliveries/:deliveryId/evidences` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `DELETE /resources/deliveries/:deliveryId/evidences/:id` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /resources/deliveries/:id` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `PATCH /resources/deliveries/:id` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `PATCH /resources/deliveries/:id/cancel` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `PATCH /resources/deliveries/:id/complete` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /resources/needs` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `POST /resources/needs` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /resources/needs/:id` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `PATCH /resources/needs/:id` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `POST /resources/offers` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `PATCH /resources/offers/:id/cancel` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `PATCH /resources/offers/:id/decision` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `PATCH /resources/offers/:offerId/proof-validation` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /resources/offers/:offerId/proofs` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `POST /resources/offers/:offerId/proofs` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /resources/offers/:offerId/proofs/:proofId/file` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `GET /resources/offers/mine` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /resources/offers/received` | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `POST /resources/open-offers` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /resources/open-offers/:id/claim` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `PATCH /resources/open-offers/:id/withdraw` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /resources/open-offers/board` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `GET /resources/open-offers/mine` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /reviews` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /reviews/:id/mark-spam` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /reviews/mine` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /reviews/org` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /service-hours` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `POST /service-hours` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /service-hours/:id/decision` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /service-hours/:id/photos` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /service-hours/:id/photos/:photoId/file` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `GET /service-hours/mine` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /sponsorship-plans` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `POST /sponsorship-plans` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /sponsorship-plans/:id` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `PATCH /sponsorship-plans/:id` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `DELETE /sponsorship-plans/animal/:animalId` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /sponsorship-plans/animal/:animalId` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `PUT /sponsorship-plans/animal/:animalId` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /sponsorships` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `POST /sponsorships` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /sponsorships/:id` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `POST /sponsorships/:id/cancel` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /sponsorships/:id/history` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `POST /sponsorships/:id/pay` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /sponsorships/:id/payments` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `POST /sponsorships/:id/reactivate` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /sponsorships/:id/retry-payment` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `POST /sponsorships/:id/suspend` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /sponsorships/mine` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /storage/private` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /storage/public` |  |  |  |  |  |  |  |  |  | pública |
| `PUT /storage/upload` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /volunteer-certificates` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `POST /volunteer-certificates/:enrollmentId` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /volunteer-certificates/:id` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /volunteer-certificates/:id/pdf` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /volunteer-certificates/mine` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /volunteer-enrollments` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `POST /volunteer-enrollments` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /volunteer-enrollments/:id` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `POST /volunteer-enrollments/:id/complete` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /volunteer-enrollments/:id/decision` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /volunteer-enrollments/mine` |  |  |  |  |  |  |  |  |  | cualquier cuenta (sin `@Roles`) |
| `GET /volunteer-opportunities` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `POST /volunteer-opportunities` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `GET /volunteer-opportunities/:id` | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `PATCH /volunteer-opportunities/:id` | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `POST /volunteer-opportunities/:id/cancel` | ✓ | ✓ |  |  |  |  |  |  |  |  |
