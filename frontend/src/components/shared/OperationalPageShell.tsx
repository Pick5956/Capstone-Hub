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
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.08),transparent_28rem),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] px-3 py-4 text-gray-900 dark:bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.14),transparent_26rem),linear-gradient(180deg,#020617_0%,#030712_100%)] dark:text-gray-100 sm:px-6 lg:px-8 lg:py-6">
      <div className="mx-auto w-full max-w-[1600px] space-y-5">
        <header className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
          <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">{eyebrow}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">{title}</h1>
              {subtitle ? <p className="mt-1 max-w-2xl text-[13px] leading-5 text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
              {lastUpdated ? <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">{lastUpdated}</p> : null}
            </div>
            {actions ? <div className="flex flex-col gap-2 sm:flex-row sm:items-center">{actions}</div> : null}
          </div>

          {stats?.length ? (
            <div className="grid grid-cols-1 divide-y divide-gray-200 border-t border-gray-200 dark:divide-gray-800 dark:border-gray-800 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {stats.map((stat) => (
                <div key={stat.label} className="px-4 py-3">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{stat.label}</p>
                  <p className={`mt-1 text-[22px] font-semibold tabular-nums ${statToneClass[stat.tone ?? "neutral"]}`}>{stat.value}</p>
                  {stat.helper ? <p className="text-[12px] text-gray-500 dark:text-gray-400">{stat.helper}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
        </header>

        {children}
      </div>
    </div>
  );
}
