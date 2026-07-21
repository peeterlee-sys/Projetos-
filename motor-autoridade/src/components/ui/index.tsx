import { forwardRef } from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  full?: boolean;
};

/** Botão do design system (verde floresta / secundário creme / ghost). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", full, className = "", ...props },
  ref
) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";
  const variants = {
    primary: "bg-brand-700 text-sand-50 hover:bg-brand-800",
    secondary: "bg-sand-200 text-ink-900 hover:bg-sand-300",
    ghost: "bg-transparent text-ink-700 hover:bg-sand-100",
  } as const;
  return (
    <button
      ref={ref}
      className={`${base} ${variants[variant]} ${full ? "w-full" : ""} ${className}`}
      {...props}
    />
  );
});

/** Cartão editorial (superfície creme, sombra suave). */
export function Card({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-[var(--radius-card)] bg-white/70 p-5 shadow-[var(--shadow-card)] ring-1 ring-sand-200 ${className}`}
      {...props}
    />
  );
}

type FieldProps = {
  label: string;
  hint?: string;
  children: React.ReactNode;
};

/** Campo de formulário rotulado. */
export function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-ink-700">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-ink-400">{hint}</span> : null}
    </label>
  );
}

const inputBase =
  "w-full rounded-2xl border border-sand-300 bg-sand-50 px-4 py-3 text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-700 focus:ring-2 focus:ring-brand-700/20";

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className = "", ...props }, ref) {
  return <input ref={ref} className={`${inputBase} ${className}`} {...props} />;
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = "", ...props }, ref) {
  return <textarea ref={ref} className={`${inputBase} min-h-24 resize-y ${className}`} {...props} />;
});
