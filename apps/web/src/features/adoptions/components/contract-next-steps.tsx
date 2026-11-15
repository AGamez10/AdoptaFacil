import type { ContractNextSteps as Steps } from '../model/adoptions-next-steps';

/** "Próximos pasos" del contrato (punto 14): lista corta y numerada. */
export function ContractNextSteps({ steps }: { steps: Steps }) {
  return (
    <section
      aria-label="Próximos pasos"
      data-testid="contract-next-steps"
      className="mb-4 rounded-md border border-primary/30 bg-primary/5 p-4"
    >
      <h3 className="font-semibold">{steps.title}</h3>
      <ol className="mt-2 space-y-1.5 text-sm">
        {steps.steps.map((step, index) => (
          <li key={step.text} className="flex gap-2">
            <span
              aria-hidden
              className={
                step.done
                  ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground'
                  : 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/50 text-xs font-semibold'
              }
            >
              {step.done ? '✓' : index + 1}
            </span>
            <span className={step.done ? 'text-muted-foreground' : undefined}>
              {step.done && <span className="sr-only">Hecho: </span>}
              {step.text}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
