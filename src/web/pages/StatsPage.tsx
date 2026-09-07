import { AppShell } from '../components/AppShell';
import { BucketBars } from '../components/BucketBars';
import { ReadingHeatmap } from '../components/ReadingHeatmap';
import { StatCard } from '../components/StatCard';
import { useStats } from '../hooks/useStats';
import { useSyncSettings } from '../hooks/useSyncSettings';
import { useT } from '../i18n/LocaleProvider';
import { describeError } from '../lib/errorMessage';
import { formatDuration, formatNumber } from '../lib/format';

export const StatsPage = () => {
  const { t, tn, locale } = useT();
  const { stats, loading, loadError } = useStats();
  const { settings } = useSyncSettings();

  const syncConfigured = !!settings?.enabled && settings.hasCredentials;

  return (
    <AppShell syncBadge={null}>
      <div className="px-5 pt-safe-top pb-10 md:px-10 md:pt-9">
        <div className="flex items-center gap-2.5">
          <h1 className="font-serif text-[30px] font-semibold tracking-[-.01em] md:text-[34px]">{t('stats.title')}</h1>
          <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-accent-ink">
            {t('stats.beta')}
          </span>
        </div>
        <p className="mt-1 text-[13px] text-faint">{t('stats.betaNotice')}</p>
        {syncConfigured ? <p className="mt-1 text-[13px] text-faint">{t('stats.scopeNotice')}</p> : null}

        {loading ? null : loadError ? (
          <p role="alert" className="mt-6 text-[13.5px] text-danger">
            {describeError(loadError, t)}
          </p>
        ) : stats && stats.sessions === 0 ? (
          <p className="mt-6 text-[14px] text-faint">{t('stats.empty')}</p>
        ) : stats ? (
          <div className="mt-6 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              <StatCard label={t('stats.time')} value={formatDuration(stats.seconds, locale)} />
              <StatCard
                label={t('stats.sessions')}
                value={formatNumber(stats.sessions, locale)}
                hint={t('stats.sessionAvg', { duration: formatDuration(stats.seconds / stats.sessions, locale) })}
              />
              <StatCard label={t('stats.pages')} value={formatNumber(stats.pages, locale)} />
              <StatCard label={t('stats.completed')} value={formatNumber(stats.completed, locale)} />
              <StatCard
                label={t('stats.streak')}
                value={tn('stats.streakDays', stats.currentStreak)}
                hint={t('stats.streakBest', { count: stats.streak })}
                wide
              />
            </div>

            {/* From xl up the calendar hugs its 53 fixed-width columns and the two bucket
                charts take the width it cannot use - stacked in that column while it is
                narrow, side by side again once there is room. Below xl the calendar spans
                the card and the charts pair up underneath it. */}
            <div className="flex flex-col gap-4 xl:flex-row">
              <div className="flex flex-col gap-3.5 rounded-lg border border-border bg-surface p-5 xl:w-fit xl:self-start">
                <span className="text-[13px] font-semibold uppercase tracking-[.04em] text-muted">{t('stats.calendar')}</span>
                <ReadingHeatmap historyB64={stats.historyB64} minutesB64={stats.minutesB64} anchorDay={stats.anchorDay} />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:min-w-0 xl:flex-1 xl:grid-cols-1 2xl:grid-cols-2">
                <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-surface p-5">
                  <span className="text-[13px] font-semibold uppercase tracking-[.04em] text-muted">{t('stats.byHour')}</span>
                  <BucketBars
                    labels={[t('stats.tod.morning'), t('stats.tod.afternoon'), t('stats.tod.evening'), t('stats.tod.night')]}
                    values={stats.tod}
                  />
                </div>
                <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-surface p-5">
                  <span className="text-[13px] font-semibold uppercase tracking-[.04em] text-muted">{t('stats.byDay')}</span>
                  <BucketBars
                    labels={[
                      t('stats.dow.mon'),
                      t('stats.dow.tue'),
                      t('stats.dow.wed'),
                      t('stats.dow.thu'),
                      t('stats.dow.fri'),
                      t('stats.dow.sat'),
                      t('stats.dow.sun'),
                    ]}
                    values={stats.dow}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
};
