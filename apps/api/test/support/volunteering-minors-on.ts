/**
 * Importar PRIMERO (antes de AppModule): `ConfigModule.forRoot` valida el
 * entorno al importarse el módulo, así que el flag debe estar puesto antes.
 * Enciende el flujo de menores (solo existe fuera de producción) para las
 * pruebas S-12 que lo ejercitan. Cada suite restaura el valor en `afterAll`.
 */
export const previousVolunteeringMinors = process.env.FEATURE_VOLUNTEERING_MINORS;
process.env.FEATURE_VOLUNTEERING_MINORS = 'true';
