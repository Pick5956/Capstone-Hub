"use client";

type OperationalStat = {
  label: string;
  value: React.ReactNode;
  helper?: string;
  tone?: "neutral" | "good" | "warning" | "danger" | "info";
};

const statToneClass: Record<NonNullable<OperationalStat["tone"]>, string> = {
  neutral: "text-gray-900 dark:text-white",
  good: "text-emerald-700 dark:text-emerald-300",
  warning: "text-amber-700 dark:text-amber-300",
  danger: "text-red-700 dark:text-red-300",
  info: "text-sky-700 dark:text-sky-300",
};

export default function OperationalPageShell({
  eyebrow,
  title,
  subtitle,
  actions,
  stats,
  lastUpdated,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  stats?: OperationalStat[];
  lastUpdated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 px-4 py-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100 sm:px-6 lg:px-8 lg:py-6">
      <div className="w-full space-y-5">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">{eyebrow}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">{title}</h1>
            {subtitle ? <p className="mt-1 max-w-3xl text-[13px] leading-5 text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
            {lastUpdated ? <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">{lastUpdated}</p> : null}
          </div>
          {actions ? <div className="flex flex-col gap-2 sm:flex-row sm:items-center">{actions}</div> : null}
        </header>

        {stats?.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-md border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-800 dark:bg-gray-950">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">{stat.label}</p>
                <p className={`mt-1 text-[22px] font-semibold tabular-nums ${statToneClass[stat.tone ?? "neutral"]}`}>{stat.value}</p>
                {stat.helper ? <p className="text-[12px] text-gray-500 dark:text-gray-400">{stat.helper}</p> : null}
              </div>
            ))}
          </div>
        ) : null}

        {children}
      </div>
    </div>
  );
}
