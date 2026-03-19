import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { TOKENS } from '../theme';

interface CurrencyDisplayProps {
  amount: number;
  decimals?: number;
  variant?: 'default' | 'inline' | 'large' | 'compact';
}

interface CoinBadgeProps {
  size: 'sm' | 'md' | 'lg';
}

const BADGE_SIZES = {
  sm: { wh: 14, fs: '0.55em', mr: 0.4 },
  md: { wh: 18, fs: '0.6em',  mr: 0.5 },
  lg: { wh: 28, fs: '0.62em', mr: 0.75 },
};

const CoinBadge = ({ size }: CoinBadgeProps) => {
  const s = BADGE_SIZES[size];
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: s.wh,
        height: s.wh,
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${TOKENS.red} 0%, ${TOKENS.redDim} 100%)`,
        color: 'white',
        fontWeight: 700,
        mr: s.mr,
        flexShrink: 0,
        boxShadow: `0 2px 4px ${alpha(TOKENS.red, 0.4)}`,
        verticalAlign: 'middle',
        position: 'relative',
        top: '-0.05em',
        fontFamily: TOKENS.fontDisplay,
      }}
    >
      <Box component="span" sx={{ fontSize: s.fs, lineHeight: 1 }}>
        К
      </Box>
    </Box>
  );
};

const CurrencyDisplay: React.FC<CurrencyDisplayProps> = ({
  amount,
  decimals = 2,
  variant = 'default',
}) => {
  const formattedAmount = amount.toLocaleString('ru-RU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (variant === 'large') {
    return (
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          fontFamily: TOKENS.fontMono,
          fontSize: '2rem',
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: '-0.01em',
        }}
      >
        <CoinBadge size="lg" />
        {formattedAmount}
      </Box>
    );
  }

  if (variant === 'compact') {
    return (
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          fontFamily: TOKENS.fontMono,
          fontSize: '0.875rem',
          fontWeight: 500,
        }}
      >
        <CoinBadge size="sm" />
        {formattedAmount}
      </Box>
    );
  }

  // default | inline
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: TOKENS.fontMono,
        fontWeight: 500,
      }}
    >
      <CoinBadge size="md" />
      {formattedAmount}
    </Box>
  );
};

export default CurrencyDisplay;
