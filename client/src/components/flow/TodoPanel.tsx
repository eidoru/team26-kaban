import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ui } from "../../lib/ui";

export interface TodoAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * One thing the viewer should do now. `title` is an instruction ("Hand ₱6,000 to Lola Nena"); the
 * first todo's title is also the label of the page's main button, so the two always match.
 */
export interface Todo {
  id: string;
  icon: LucideIcon;
  title: string;
  detail?: ReactNode;
  action: TodoAction;
  /** A second choice shown before the main one (Decline / Deny). */
  secondary?: TodoAction;
  /** Whether the main button may run this todo's action. False for choices that need reading first (swaps). */
  inBar?: boolean;
}

/**
 * The top of a running group page when there's something to do: every task at once, most urgent
 * first, each with its own button. Replaces showing only the most urgent task in the Now panel.
 */
export function TodoPanel({ todos }: { todos: Todo[] }) {
  return (
    <section aria-labelledby="todo-heading" className="animate-rise rounded-3xl border-2 border-brand-200 bg-brand-50 p-2 sm:p-3">
      <h2 id="todo-heading" className="px-3 pb-2 pt-2 text-xs font-bold uppercase tracking-wide text-brand-700">
        To do
      </h2>
      <ol className="space-y-2">
        {todos.map((todo) => (
          // Two buttons (swaps) need the width, so only those rows let the buttons wrap under the text.
          <li
            key={todo.id}
            className={`flex items-center gap-x-3 gap-y-2 rounded-2xl bg-white p-3 sm:p-4 ${todo.secondary ? "flex-wrap" : ""}`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-800" aria-hidden>
              <todo.icon className="h-5 w-5" />
            </span>
            <div className={`min-w-0 flex-1 ${todo.secondary ? "basis-48" : ""}`}>
              <h3 className="text-sm font-bold text-ink-900">{todo.title}</h3>
              {todo.detail && <p className="mt-0.5 text-xs text-ink-600">{todo.detail}</p>}
            </div>
            <div className="ml-auto flex shrink-0 gap-2">
              {todo.secondary && (
                <button type="button" onClick={todo.secondary.onClick} disabled={todo.secondary.disabled} className={ui.btnSecondarySm}>
                  {todo.secondary.label}
                </button>
              )}
              <button type="button" onClick={todo.action.onClick} disabled={todo.action.disabled} className={ui.btnPrimarySm}>
                {todo.action.label}
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * The page's main button: the first todo it may run, labelled with that todo's title. Render it
 * only when `todos.some((t) => t.inBar !== false)`.
 */
export function TodoBarButton({ todos }: { todos: Todo[] }) {
  const first = todos.find((t) => t.inBar !== false);
  if (!first) return null;
  return (
    <button type="button" onClick={first.action.onClick} disabled={first.action.disabled} className={ui.btnPrimary}>
      {first.title}
    </button>
  );
}
