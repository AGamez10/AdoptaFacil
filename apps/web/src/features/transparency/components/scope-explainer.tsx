import styles from './scope-explainer.module.scss';

/**
 * Las dos escalas de la transparencia, sin solaparse: el libro público es el
 * detalle de UNA organización (micro); Transparencia Nacional es la suma de
 * todas (macro).
 */
export function ScopeExplainer() {
  return (
    <div className={styles.scopes} data-testid="transparency-scopes">
      <section>
        <p className={styles.tag}>Nivel organización</p>
        <h3>Libro público</h3>
        <p>
          Cada refugio o fundación muestra en su portal cada ingreso y cada gasto, con fecha y
          soporte. Sirve a quien le dona a esa organización para ver en qué se usó su ayuda.
        </p>
      </section>
      <section>
        <p className={styles.tag}>Nivel país</p>
        <h3>Transparencia Nacional</h3>
        <p>
          Suma los libros públicos de todas las organizaciones aprobadas en AdoptaFácil. Responde
          cuánto se mueve en el rescate animal de Colombia, sin mostrar movimientos sueltos ni datos
          de nadie.
        </p>
      </section>
    </div>
  );
}
