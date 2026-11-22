import { useState } from 'react';
import {
  CARE_LOG_VIEW_ROLES,
  PUBLIC_ANIMAL_STATUSES,
  Role,
  type Animal,
  type AnimalSex,
  type ComputedAge,
} from '@adoptafacil/contracts';
import { Badge, Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@adoptafacil/ui';
import { useSession } from '../../../shell/auth';
import { AnimalCustodySection } from '../../custody';
import { AnimalCareLogSection } from '../../team/components/care-log-list';
import { AnimalCarnetSection } from './animal-carnet-section';
import { AnimalDocumentosSection } from './animal-documentos-section';
import { AnimalRegistroClinicoSection } from './animal-registro-clinico-section';
import { IconButton } from './icon-button';
import { FolderIcon, HeartIcon, PawEmptyIcon, PencilIcon, ShieldIcon, TrashIcon } from './icons';
import styles from './animal-detail-panel.module.scss';

const SEX_LABELS: Record<AnimalSex, string> = {
  male: 'macho',
  female: 'hembra',
  unknown: 'sexo desconocido',
};

/** Misma derivación que `animals-page.tsx`/`animal-clinical-panel.tsx` —
 *  duplicada feature-localmente por convención del proyecto (bajo riesgo de
 *  divergencia, 6 líneas). */
function ageLabel(age?: ComputedAge): string {
  if (!age) return 'edad desconocida';
  const parts: string[] = [];
  if (age.years > 0) parts.push(`${age.years} años`);
  if (age.months > 0) parts.push(`${age.months} m`);
  const text = parts.join(' ') || '0 m';
  return age.approximate ? `~${text}` : text;
}

/** "Raza · sexo · edad" (T-ANIMALS-DETAIL): el mockup de este refactor pedía
 *  también "· peso", pero `Animal` no tiene un campo de peso — se omite en
 *  vez de inventar un dato (ver CLAUDE.md "sin datos inventados"). */
function detailSubline(animal: Animal): string {
  const parts: string[] = [];
  if (animal.breed) parts.push(animal.breed);
  parts.push(SEX_LABELS[animal.sex]);
  parts.push(ageLabel(animal.computedAge));
  return parts.join(' · ');
}

export interface AnimalDetailPanelProps {
  animal: Animal;
  canManage: boolean;
  canDelete: boolean;
  canManageSponsorship: boolean;
  onEdit: (animal: Animal) => void;
  onDelete: (animal: Animal) => void;
  onSponsor: (animal: Animal) => void;
  onDeclareBehavior: (animal: Animal) => void;
  onReactivate: (animal: Animal) => void;
  /** Publica o retira del portal (por cargo, o el veterinario con permiso expreso). */
  canPublish?: boolean;
  onPublish?: (animal: Animal) => void;
  /** Marcar o quitar "apto para adopción". */
  onReadiness?: (animal: Animal, ready: boolean) => void;
  /** Solo se usa en móvil (`lg:hidden`) para volver a la lista. */
  onBack: () => void;
}

/**
 * Panel de detalle del animal seleccionado (refactor visual maestro-detalle,
 * M03). Header con foto/nombre/raza-sexo-edad + acciones en icon-button con
 * tooltip, y las tabs Carnet · Registro clínico · Documentos · Custodia (esta
 * última, documentación y guardería, solo para quien puede consultarla). Las 3 secciones
 * reutilizan `useAnimalClinicalRecord` para no duplicar los fetches ya usados
 * por `AnimalClinicalPanel` (shell). "Documentos" (fix,
 * T-ANIMALS-ATTACHMENTS-AUDIT) ya NO es un `ComingSoon`: es la galería
 * consolidada de los adjuntos reales del expediente clínico.
 */
export function AnimalDetailPanel({
  animal,
  canManage,
  canDelete,
  canManageSponsorship,
  onEdit,
  onDelete,
  onSponsor,
  onDeclareBehavior,
  onReactivate,
  canPublish = false,
  onPublish,
  onReadiness,
  onBack,
}: AnimalDetailPanelProps) {
  const [tab, setTab] = useState<'carnet' | 'registro' | 'documentos' | 'custodia' | 'cuidados'>(
    'carnet',
  );
  const { hasAnyRole } = useSession();
  // Mismos roles que exige `GET /custody/animals/:id/overview`.
  const canViewCustody = hasAnyRole(
    Role.Owner,
    Role.Administrator,
    Role.Operator,
    Role.ReadOnlyAuditor,
  );
  const canViewCare = hasAnyRole(...CARE_LOG_VIEW_ROLES);
  const isInactive = animal.isActive === false;
  const inAdoption = animal.status !== 'adopted' && animal.status !== 'deceased';
  const isPublic = !isInactive && PUBLIC_ANIMAL_STATUSES.includes(animal.status);
  const photo = animal.photos[0];

  return (
    <div className={styles.detail}>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-left text-sm text-muted-foreground underline-offset-4 hover:underline lg:hidden"
      >
        ← Volver a la lista
      </button>

      <div className={styles.detail__header}>
        {photo ? (
          <img src={photo} alt={`Foto de ${animal.name}`} className={styles.detail__avatar} />
        ) : (
          <div aria-hidden className={styles['detail__avatar-fallback']}>
            <PawEmptyIcon className="h-6 w-6" />
          </div>
        )}

        <div className={styles.detail__identity}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={styles.detail__name}>{animal.name}</h2>
            {isInactive && <Badge variant="destructive">Inactivo</Badge>}
            {!isInactive && inAdoption && !isPublic && (
              <Badge variant="secondary">Fuera del portal</Badge>
            )}
            {animal.adoptionReadyAt && inAdoption && (
              <Badge variant="success">Apto para adopción</Badge>
            )}
          </div>
          {animal.adoptionReadyAt && inAdoption && (
            <p className="text-xs text-muted-foreground" data-testid="adoption-ready-note">
              Marcado apto por {animal.adoptionReadyByName ?? 'el equipo'}
              {animal.adoptionReadyNote ? `: ${animal.adoptionReadyNote}` : '.'}
              {!isPublic && !canPublish && ' Un administrador u operador lo publica.'}
            </p>
          )}
          <p className={styles.detail__subline}>{detailSubline(animal)}</p>
          {animal.tags && animal.tags.length > 0 && (
            <div className={styles.detail__tags}>
              {animal.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className={styles.detail__actions}>
          {canManage && (
            <IconButton
              tooltipAlign="end"
              icon={<PencilIcon />}
              label="Editar"
              onClick={() => onEdit(animal)}
            />
          )}
          {canManage && (
            <IconButton
              tooltipAlign="end"
              icon={<FolderIcon />}
              label="Expediente médico"
              onClick={() => setTab('registro')}
            />
          )}
          {!isInactive && canDelete && (
            <IconButton
              tooltipAlign="end"
              icon={<TrashIcon />}
              label="Eliminar"
              variant="danger"
              onClick={() => onDelete(animal)}
            />
          )}
          {!isInactive && canManageSponsorship && (
            <IconButton
              tooltipAlign="end"
              icon={<HeartIcon />}
              label="Apadrinamiento"
              onClick={() => onSponsor(animal)}
            />
          )}
          {canManage && (
            <IconButton
              tooltipAlign="end"
              icon={<ShieldIcon />}
              label="Declaración de comportamiento"
              onClick={() => onDeclareBehavior(animal)}
            />
          )}
          {canManage && inAdoption && onReadiness && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReadiness(animal, !animal.adoptionReadyAt)}
            >
              {animal.adoptionReadyAt ? 'Quitar apto' : 'Marcar apto para adopción'}
            </Button>
          )}
          {canPublish && inAdoption && !isPublic && !isInactive && onPublish && (
            <Button size="sm" onClick={() => onPublish(animal)}>
              Publicar en el portal
            </Button>
          )}
          {isInactive && canPublish && (
            <Button size="sm" variant="outline" onClick={() => onReactivate(animal)}>
              Reactivar
            </Button>
          )}
        </div>
      </div>

      {/* `key`: al elegir otro animal las secciones se montan de cero, así nunca
          queda en pantalla el carnet, el registro o la custodia del anterior. */}
      <div key={animal.id} className={styles.detail__body}>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          {/* En pantallas angostas las pestañas se desplazan en vez de desbordar la página. */}
          <div className="w-0 min-w-full overflow-x-auto">
            <TabsList aria-label="Secciones del expediente del animal">
              <TabsTrigger value="carnet">Carnet</TabsTrigger>
              <TabsTrigger value="registro">Registro clínico</TabsTrigger>
              <TabsTrigger value="documentos">Documentos</TabsTrigger>
              {canViewCustody && <TabsTrigger value="custodia">Custodia</TabsTrigger>}
              {canViewCare && <TabsTrigger value="cuidados">Cuidados</TabsTrigger>}
            </TabsList>
          </div>

          <TabsContent value="carnet">
            <AnimalCarnetSection animal={animal} />
          </TabsContent>

          <TabsContent value="registro">
            <AnimalRegistroClinicoSection animalId={animal.id} />
          </TabsContent>

          <TabsContent value="documentos">
            <AnimalDocumentosSection animalId={animal.id} />
          </TabsContent>

          {canViewCare && (
            <TabsContent value="cuidados">
              <AnimalCareLogSection animalId={animal.id} />
            </TabsContent>
          )}

          {canViewCustody && (
            <TabsContent value="custodia">
              <AnimalCustodySection animalId={animal.id} animalName={animal.name} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
