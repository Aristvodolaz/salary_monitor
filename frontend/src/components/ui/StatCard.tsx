import { Box, Card, CardContent, Typography } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { alpha } from '@mui/material/styles';
import { TOKENS } from '../../theme';
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
          border: `2px solid ${TOKENS.gold}`,
          boxShadow: `0 0 32px ${alpha(TOKENS.gold, 0.12)}`,
        }),
        ...(isMuted && { opacity: 0.75 }),
        ...sx,
      }}
    >
      <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography
            sx={{
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: isHero ? TOKENS.gold : TOKENS.textSecondary,
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
                backgroundColor: alpha(trendPositive ? TOKENS.success : TOKENS.error, 0.12),
                color: trendPositive ? TOKENS.success : TOKENS.error,
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
            fontSize: isHero ? '2rem' : '1.5rem',
            fontWeight: 700,
            color: isHero ? TOKENS.gold : TOKENS.textPrimary,
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
                <Typography sx={{ fontSize: '0.6875rem', color: TOKENS.textMuted, mb: 0.25, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>
                  {stat.label}
                </Typography>
                <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: TOKENS.textSecondary, fontFamily: TOKENS.fontMono }}>
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
