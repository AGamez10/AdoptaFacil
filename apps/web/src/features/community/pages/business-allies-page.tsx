import { Link } from 'react-router-dom';
import { PublicFooter, PublicNavbar, PublicPageBody, PublicPageHero } from '../../../shell/layout';
import { accessPathWithReturn, useSession } from '../../../shell/auth';
import { AllySeal, PassTicket } from '../components/business-ui';

const PANEL = '/mi-negocio';

const WAYS = [
  {
    tone: 'bg-brand-teal/10',
    kicker: '1 · Aporta',
    title: 'Dona lo que tu negocio ya tiene',
    text: 'Concentrado, un baño, una consulta, una esterilización a precio social. Los refugios publican lo que necesitan en el Banco de recursos y tú ofreces. Cuenta cuando el refugio confirma que lo recibió.',
  },
  {
    tone: 'bg-brand-gold/20',
    kicker: '2 · Recibe a quien adopta',
    title: 'Un beneficio para las nuevas familias',
    text: 'Publica un beneficio, por ejemplo "primera consulta gratis". Quien adopta lo ve en su cuenta y te muestra un código. Tú lo validas y listo: llega un cliente nuevo que ya ama a los animales.',
  },
  {
    tone: 'bg-brand-coral/15',
    kicker: '3 · Gana el sello',
    title: 'Aliado de AdoptaFácil',
    text: 'Con tu perfil publicado y un aporte entregado o un beneficio vigente, revisamos y te damos el sello. Sales primero en el directorio de tu ciudad y tu impacto se ve en tu perfil.',
  },
] as const;

const RULES = [
  {
    title: 'Es gratis',
    text: 'Publicar tu negocio, tus beneficios y recibir el sello no cuesta nada.',
  },
  {
    title: 'El sello no se vende',
    text: 'Se gana con hechos que otros confirman. Si algún día ofrecemos planes para negocios, lo pagado se marcará como destacado y nunca como sello.',
  },
  {
    title: 'Nadie te pasa datos de quien adopta',
    text: 'Al validar un código solo ves el beneficio, el nombre del animal y el mes de la adopción. Nada de nombres, teléfonos ni correos.',
  },
  {
    title: 'Tu beneficio, tu responsabilidad',
    text: 'Lo ofreces y lo cumples tú. Lo revisamos antes de publicarlo para que sea claro y real.',
  },
] as const;

/**
 * `/negocios-aliados` (público): la única puerta de entrada para un negocio
 * del ecosistema. Explica qué gana el negocio y qué gana la causa, y lleva a
 * crear la cuenta (o entrar) con el panel de negocio como destino.
 */
export function BusinessAlliesPage() {
  const { status } = useSession();
  const signedIn = status === 'authenticated';
  const primary = signedIn ? PANEL : accessPathWithReturn('/register', PANEL);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />
      <main className="flex-1">
        <PublicPageHero
          eyebrow="Negocios aliados"
          tone="mint"
          title="Tu negocio, del lado de los animales"
          lead="Veterinarias, peluquerías, paseadores y tiendas que no solo venden: ayudan a que más animales encuentren hogar. Y reciben a las familias que acaban de adoptar."
        >
          <div className="flex flex-wrap gap-3">
            <Link
              to={primary}
              className="rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90"
              data-testid="allies-primary-cta"
            >
              {signedIn ? 'Ir a mi panel de negocio' : 'Publicar mi negocio gratis'}
            </Link>
            {!signedIn && (
              <Link
                to={accessPathWithReturn('/login', PANEL)}
                className="rounded-full border-2 border-foreground/20 px-6 py-3 font-semibold hover:bg-card"
              >
                Ya tengo cuenta
              </Link>
            )}
          </div>
        </PublicPageHero>

        <PublicPageBody>
          <section aria-labelledby="ways-title">
            <h2 id="ways-title" className="text-2xl font-extrabold tracking-tight">
              Tres formas de ser aliado
            </h2>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {WAYS.map((way) => (
                <article key={way.kicker} className={`rounded-2xl p-5 ${way.tone}`}>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {way.kicker}
                  </p>
                  <h3 className="mt-1 text-lg font-bold leading-snug">{way.title}</h3>
                  <p className="mt-2 text-sm text-foreground/80">{way.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section
            aria-labelledby="pass-title"
            className="mt-12 grid items-center gap-8 rounded-3xl border border-border bg-card p-6 md:grid-cols-2 md:p-10"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-brand-teal-dark">
                Así llega una familia nueva a tu negocio
              </p>
              <h2 id="pass-title" className="mt-1 text-2xl font-extrabold tracking-tight">
                Un código, cero datos personales
              </h2>
              <ol className="mt-4 space-y-3 text-sm">
                <li>
                  <strong>Laura adopta a Luna</strong> en un refugio de AdoptaFácil y la entrega
                  queda confirmada.
                </li>
                <li>
                  En su cuenta aparece tu beneficio. Lo guarda y recibe un{' '}
                  <strong>código de un solo uso</strong>.
                </li>
                <li>
                  Llega a tu negocio, te lo muestra y tú lo validas en tu panel. Ves:{' '}
                  <em>"Primera consulta gratis · Luna · adoptada en marzo"</em>.
                </li>
                <li>Tu contador de familias beneficiadas sube y se ve en tu perfil.</li>
              </ol>
            </div>
            <div className="space-y-3">
              <PassTicket
                code="7K3P9QXM"
                title="Primera consulta gratis para animales adoptados"
                business="Clínica Huellitas"
                footer="Válido hasta el 31 de diciembre · Lunes a viernes"
              />
              <p className="text-center text-xs text-muted-foreground">Ejemplo ilustrativo.</p>
            </div>
          </section>

          <section
            aria-labelledby="seal-title"
            className="mt-12 flex flex-col gap-6 md:flex-row md:items-center"
          >
            <AllySeal size="lg" />
            <div>
              <h2 id="seal-title" className="text-2xl font-extrabold tracking-tight">
                El sello se gana, no se compra
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-foreground/80">
                En tu panel ves el camino: perfil publicado, primer aporte entregado a un refugio y
                un beneficio para quien adopta. Con el perfil y cualquiera de los otros dos,
                cumples. El equipo de AdoptaFácil lo revisa y te da el sello, y puede retirarlo si
                un beneficio no se cumple.
              </p>
            </div>
          </section>

          <section aria-labelledby="rules-title" className="mt-12">
            <h2 id="rules-title" className="text-2xl font-extrabold tracking-tight">
              Reglas claras
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {RULES.map((rule) => (
                <div key={rule.title} className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="font-bold">{rule.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{rule.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-12 flex flex-col items-start gap-4 rounded-3xl bg-brand-navy p-8 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-extrabold">¿Empezamos?</h2>
              <p className="text-sm text-white/80">
                Creas tu cuenta en un paso, activas tu panel y publicas tu perfil. Lo revisamos
                antes de mostrarlo.
              </p>
            </div>
            <Link
              to={primary}
              className="rounded-full bg-brand-gold px-6 py-3 font-bold text-brand-navy hover:bg-brand-gold/90"
            >
              {signedIn ? 'Ir a mi panel de negocio' : 'Publicar mi negocio gratis'}
            </Link>
          </section>
        </PublicPageBody>
      </main>
      <PublicFooter />
    </div>
  );
}
