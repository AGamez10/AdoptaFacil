import { Link } from 'react-router-dom';
import { buttonVariants, Card, CardContent, CardHeader, CardTitle, cn } from '@adoptafacil/ui';
import { PageContainer } from '../../_layout';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';

/**
 * `/donaciones/resultado` — página a la que vuelve el navegador tras el
 * checkout de ePayco (ADR-PAG-002, `EPAYCO_RESPONSE_URL`). PÚBLICA.
 *
 * A propósito NO lee el estado del pago de la query string (`ref_payco`,
 * `x_response`…): esos parámetros los puede escribir cualquiera. La donación
 * solo se aprueba con la confirmación firmada que ePayco envía al servidor;
 * aquí se le dice al donante, con honestidad, que el pago se está confirmando
 * y que el comprobante le llega por correo.
 */
export function DonationResultPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNavbar />
      <main className="flex-1">
        <PageContainer>
          <Card className="mx-auto max-w-xl">
            <CardHeader>
              <CardTitle>Gracias por tu donación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Estamos confirmando tu pago con la pasarela. Cuando quede aprobado, el dinero queda
                en la cuenta de la organización y te enviamos el comprobante a tu correo.
              </p>
              <p className="text-sm text-muted-foreground">
                Si pagaste por PSE o en efectivo, la confirmación puede tardar un poco más. No hace
                falta que vuelvas a pagar.
              </p>
              <Link to="/" className={cn(buttonVariants({ variant: 'outline' }))}>
                Volver al inicio
              </Link>
            </CardContent>
          </Card>
        </PageContainer>
      </main>
      <PublicFooter />
    </div>
  );
}
