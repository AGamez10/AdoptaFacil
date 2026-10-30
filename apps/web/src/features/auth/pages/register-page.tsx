import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@adoptafacil/ui';
import type { AccountType } from '../../../shell/api';
import { templateDemoHref, templateName } from '../../portals/templates/demo/demo-templates';
import { AuthLayout } from '../components/auth-layout';
import { readSignupTemplate } from '../lib/signup-template';
import { RegisterOrganizationForm } from './register-organization-form';
import { RegisterPersonForm } from './register-person-form';

/**
 * Registration screen. A clear account-type selector (§13) keeps the two flows
 * separate: each tab renders its own distinct form — Organization and Person
 * fields are never mixed. Tab state is in memory only (no browser storage).
 */
export function RegisterPage() {
  const [accountType, setAccountType] = useState<AccountType>('organization');
  const [search] = useSearchParams();
  // Plantilla elegida en la vista de ejemplo: queda como la del portal nuevo.
  const template = useMemo(() => readSignupTemplate(search), [search]);

  return (
    <AuthLayout
      wide
      title="Crear cuenta"
      description="Elige el tipo de cuenta y completa tus datos."
      footer={
        <p>
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Inicia sesión
          </Link>
        </p>
      }
    >
      <Tabs value={accountType} onValueChange={(value) => setAccountType(value as AccountType)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="organization">Organización</TabsTrigger>
          <TabsTrigger value="person">Persona</TabsTrigger>
        </TabsList>
        <TabsContent value="organization" className="mt-4">
          {template && (
            <p
              className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground"
              data-testid="register-template-note"
            >
              Tu portal empezará con la plantilla <strong>{templateName(template)}</strong>. Podrás
              cambiarla cuando quieras.{' '}
              <Link
                to={templateDemoHref(template)}
                className="font-medium text-primary hover:underline"
              >
                Verla de nuevo
              </Link>
            </p>
          )}
          <RegisterOrganizationForm template={template} />
        </TabsContent>
        <TabsContent value="person" className="mt-4">
          <RegisterPersonForm />
        </TabsContent>
      </Tabs>
    </AuthLayout>
  );
}
