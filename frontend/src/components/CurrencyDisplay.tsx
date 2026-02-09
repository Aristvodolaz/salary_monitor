import { Box } from '@mui/material';

interface CurrencyDisplayProps {
  amount: number;
  decimals?: number;
  variant?: 'default' | 'inline' | 'large';
}

/**
 * Component for displaying currency with K inside coin icon
 * Example: (K) 1234.56
 */
const CurrencyDisplay: React.FC<CurrencyDisplayProps> = ({ 
  amount, 
  decimals = 2,
  variant = 'default'
}) => {
  const formattedAmount = amount.toLocaleString('ru-RU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  // Красивая иконка монетки с буквой К внутри
  const CoinIcon = ({ fontSize = '1em' }: { fontSize?: string }) => (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '1em',
        height: '1em',
        borderRadius: '50%',
        backgroundColor: '#E31E24',
        color: 'white',
        fontSize: fontSize,
        fontWeight: 700,
        mr: 0.4,
        boxShadow: '0 2px 4px rgba(227, 30, 36, 0.3)',
        position: 'relative',
        top: '-0.05em',
      }}
    >
      <Box component="span" sx={{ fontSize: '0.6em', lineHeight: 1 }}>
        К
      </Box>
    </Box>
  );

  if (variant === 'inline') {
    return (
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
        <CoinIcon fontSize="1.2em" />
        {formattedAmount}
      </Box>
    );
  }

  if (variant === 'large') {
    return (
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
        <CoinIcon fontSize="1em" />
        {formattedAmount}
      </Box>
    );
  }

  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
      <CoinIcon fontSize="1em" />
      {formattedAmount}
    </Box>
  );
};

export default CurrencyDisplay;
