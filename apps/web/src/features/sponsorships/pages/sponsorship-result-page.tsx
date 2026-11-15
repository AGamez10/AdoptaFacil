import { Link } from 'react-router-dom';
import { buttonVariants, Card, CardContent, CardHeader, CardTitle, cn } from '@adoptafacil/ui';
import { PageContainer } from '../../_layout';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { useNoIndex } from '../../../seo/seo';

/**
 * `/apadrinar/resultado` — adonde vuelve el navegador después de pagar un mes
 * de apadrinamiento en Mercado Pago. PÚBLICA.
 *
 * Igual que `/donaciones/resultado`, NO lee el estado del pago de la query
 * string (cualquiera puede escribirla): el mes se marca pagado solo con el
 * aviso firmado que Mercado Pago envía al servidor. Aquí se le dice al padrino,
 * con honestidad, que se está confirmando y dónde verlo.
 */
export function SponsorshipResultPage() {
  useNoIndex();
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNavbar />
      <main className="flex-1">
        <PageContainer>
          <Card className="mx-auto max-w-xl">
            <CardHeader>
              <CardTitle>Gracias por apadrinar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Estamos confirmando tu pago con Mercado Pago. Cuando quede aprobado, el dinero queda
                en la cuenta de la organización y te avisamos por correo y en la campana.
              </p>
              <p className="text-sm text-muted-foreground">
                Si pagaste por PSE o en efectivo, la confirmación puede tardar un poco más. No hace
                falta que vuelvas a pagar. Cada mes te avisamos para pagar el siguiente.
              </p>
              <Link to="/apadrinar" className={cn(buttonVariants())}>
                Ver mis apadrinamientos
              </Link>
            </CardContent>
          </Card>
        </PageContainer>
      </main>
      <PublicFooter />
    </div>
  );
}
