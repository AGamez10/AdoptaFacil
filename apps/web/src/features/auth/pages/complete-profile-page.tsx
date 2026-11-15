import { useState } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { Button, Card, CardContent } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { FormAlert } from '../components/form-alert';
import { ProfileFieldsForm } from '../components/profile-gate';

interface FromState {
  from?: Location;
  /** Optional hint shown above the form, set by the page that sent the person here. */
  reason?: string;
}

/**
 * "Completa tu perfil": teléfono, documento y dirección. Las acciones que los
 * necesitan (donar, solicitar adopción, inscribirse) ya no mandan aquí: los
 * piden en una ventana encima de la acción y la siguen solas
 * (`useProfileGate`). Esta pantalla queda para quien entra directo a
 * completarlo; si llegó desde una acción (`state.from`), al guardar vuelve a
 * ella con lo que ya había elegido, sin pasar por el inicio.
 */
export function CompleteProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as FromState | null) ?? null;
  const [done, setDone] = useState(false);

  const onSaved = () => {
    if (state?.from) {
      navigate(`${state.from.pathname}${state.from.search}`, {
        replace: true,
        state: state.from.state,
      });
      return;
    }
    setDone(true);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Completa tu perfil"
        description={
          state?.reason ??
          'Necesitamos estos datos para donar/apadrinar, solicitar una adopción o inscribirte como voluntario.'
        }
      />
      <Card className="mx-auto max-w-lg">
        <CardContent className="space-y-4 pt-6">
          {done ? (
            <div className="space-y-4">
              <FormAlert variant="success">Perfil actualizado.</FormAlert>
              <Button type="button" className="w-full" onClick={() => navigate('/inicio')}>
                Ir al inicio
              </Button>
            </div>
          ) : (
            <ProfileFieldsForm
              submitLabel={state?.from ? 'Guardar y continuar' : 'Guardar perfil'}
              onSaved={onSaved}
            />
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
