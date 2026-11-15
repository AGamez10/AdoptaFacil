import { Link } from 'react-router-dom';
import { NationalBoard } from '../../transparency/components/national-board';
import { ScopeExplainer } from '../../transparency/components/scope-explainer';
import { PageContainer, PageHeader } from '../../_layout';

/**
 * `/organizacion/transparencia-nacional`: el consolidado del rescate animal en
 * Colombia (la suma de los libros públicos de todas las organizaciones
 * aprobadas), el mismo tablero que ve cualquiera en `/transparencia-nacional`.
 * El detalle de ESTA organización sigue en su libro público.
 */
export function NationalTransparencyPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Transparencia nacional"
        description="La suma de los libros públicos de todas las organizaciones aprobadas en Colombia."
      />
      <div className="space-y-6">
        <NationalBoard variant="full" />
        <ScopeExplainer />
        <p className="text-sm text-muted-foreground">
          Tus movimientos suman aquí desde que los registras en{' '}
          <Link
            to="/organizacion/libro-publico"
            className="font-semibold text-foreground underline"
          >
            tu libro público
          </Link>
          . Este tablero también es público en{' '}
          <Link to="/transparencia-nacional" className="font-semibold text-foreground underline">
            la página de Transparencia Nacional
          </Link>
          .
        </p>
      </div>
    </PageContainer>
  );
}
