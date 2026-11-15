/**
 * Importar PRIMERO (antes de AppModule): `ConfigModule.forRoot` valida el
 * entorno al importarse el módulo. Deja el flujo de menores APAGADO, como en
 * producción. Cada suite restaura el valor en `afterAll`.
 */
export const previousVolunteeringMinors = process.env.FEATURE_VOLUNTEERING_MINORS;
process.env.FEATURE_VOLUNTEERING_MINORS = 'false';
