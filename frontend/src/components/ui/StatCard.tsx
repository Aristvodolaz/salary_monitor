import { Box, Card, CardContent, Typography } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { SkeletonCard } from './SkeletonCard';

interface SubStat {
  label: string;
  value: string | number;
}

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  subStats?: SubStat[];
  variant?: 'default' | 'hero' | 'muted';
  trend?: { value: number; label?: string };
  loading?: boolean;
  sx?: object;
}

export const StatCard = ({
  label,
  value,
  subStats,
  variant = 'default',
  trend,
  loading = false,
  sx = {},
}: StatCardProps) => {
  if (loading) return <SkeletonCard />;

  const isHero = variant === 'hero';
  const isMuted = variant === 'muted';
  const trendPositive = trend && trend.value >= 0;

  return (
    <Card
      sx={{
        height: '100%',
        ...(isHero && {
          border: '2px solid var(--color-gold)',
          boxShadow: '0 0 32px var(--color-gold-glow)',
        }),
        ...(isMuted && { opacity: 0.75 }),
        ...sx,
      }}
    >
      <CardContent
        sx={{
          p: isHero ? 2.25 : 3,
          '&:last-child': { pb: isHero ? 2.25 : 3 },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography
            sx={{
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: isHero ? 'var(--color-gold)' : 'var(--color-text-secondary)',
            }}
          >
            {label}
          </Typography>
          {trend && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1,
                py: 0.25,
                borderRadius: 99,
                backgroundColor: trendPositive ? 'var(--color-success-muted)' : 'var(--color-error-muted)',
                color: trendPositive ? 'var(--color-success)' : 'var(--color-error)',
              }}
            >
              {trendPositive ? (
                <TrendingUpIcon sx={{ fontSize: 14 }} />
              ) : (
                <TrendingDownIcon sx={{ fontSize: 14 }} />
              )}
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                {trendPositive ? '+' : ''}{trend.value.toFixed(1)}%
              </Typography>
            </Box>
          )}
        </Box>

        <Box
          sx={{
            fontSize: isHero ? '1.75rem' : '1.5rem',
            fontWeight: 700,
            color: isHero ? 'var(--color-gold)' : 'var(--color-text-primary)',
            mb: subStats?.length ? 2 : 0,
            lineHeight: 1.2,
          }}
        >
          {value}
        </Box>

        {subStats && subStats.length > 0 && (
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {subStats.map((stat, i) => (
              <Box key={i}>
                <Typography sx={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', mb: 0.25, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>
                  {stat.label}
                </Typography>
                <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {stat.value}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};
