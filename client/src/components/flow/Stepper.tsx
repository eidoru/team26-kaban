/** Wizard progress: "Step 2 of 5 · Money" with one bar segment per step. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
        Step {current + 1} of {steps.length} · <span className="text-brand-700">{steps[current]}</span>
      </p>
      <ol className="mt-2 flex gap-1.5" aria-label="Steps">
        {steps.map((step, index) => (
          <li
            key={step}
            aria-current={index === current ? "step" : undefined}
            className={`h-1.5 flex-1 rounded-full transition-colors ${index <= current ? "bg-brand-600" : "bg-ink-200"}`}
          >
            <span className="sr-only">
              {step}
              {index < current ? " (done)" : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
