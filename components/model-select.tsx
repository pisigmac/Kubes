export function ModelSelect({
  value,
  models,
  onChange,
  disabled,
  className,
}: {
  value: string;
  models: string[];
  onChange: (model: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const options = models.includes(value) || value === "" ? models : [value, ...models];
  return (
    <select
      value={value}
      disabled={disabled || options.length === 0}
      onChange={(event) => onChange(event.target.value)}
      className={
        className ??
        "w-full min-w-0 max-w-full rounded-full border border-white/10 bg-black/40 px-3 py-1 font-mono text-xs text-white outline-none focus:border-[#e7ff3a] disabled:opacity-50"
      }
    >
      {options.map((model) => (
        <option key={model} value={model}>
          {model}
        </option>
      ))}
    </select>
  );
}
