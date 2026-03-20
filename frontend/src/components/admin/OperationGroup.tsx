import { memo } from 'react';
import {
  Box,
  Typography,
  Collapse,
  IconButton,
  Chip,
} from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowRight } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { TOKENS } from '../../theme';
import CurrencyDisplay from '../CurrencyDisplay';
import type { OperationSummary } from '../../services/api';
import { OperationDetails } from './OperationDetails';

interface OperationGroupProps {
  employeeId: number;
  group: OperationSummary;
  startDate: string;
  endDate: string;
  isExpanded: boolean;
  onToggle: () => void;
}

export const OperationGroup = memo(({
  employeeId,
  group,
  startDate,
  endDate,
  isExpanded,
  onToggle,
}: OperationGroupProps) => {
  const formatDate = (d: string) => {
    try {
      return format(new Date(d), 'dd MMM', { locale: ru });
    } catch {
      return d;
    }
  };

  return (
    <Box>
      {/* Строка агрегата */}
      <Box
        onClick={onToggle}
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '24px 1fr', sm: '24px 1fr 110px 90px 90px 120px' },
          gap: { xs: 0.5, sm: 1 },
          alignItems: 'center',
          px: 1.5,
          py: 1,
          mb: 0.5,
          borderRadius: 1.5,
          backgroundColor: isExpanded
            ? alpha(TOKENS.gold, 0.06)
            : 'var(--color-bg-elevated)',
          border: `1px solid ${isExpanded ? alpha(TOKENS.gold, 0.25) : 'var(--color-border-subtle)'}`,
          cursor: 'pointer',
          transition: 'all 150ms ease',
          '&:hover': {
            backgroundColor: alpha(TOKENS.gold, 0.04),
            borderColor: alpha(TOKENS.gold, 0.2),
          },
        }}
      >
        {/* Expand icon */}
        <IconButton
          size="small"
          sx={{ color: 'var(--color-text-muted)', p: 0.25, pointerEvents: 'none' }}
        >
          {isExpanded
            ? <KeyboardArrowDown fontSize="small" />
            : <KeyboardArrowRight fontSize="small" />}
        </IconButton>

        {/* Operation type + area */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <Typography sx={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {group.operation_type}
          </Typography>
          {group.participant_area && (
            <Chip
              label={group.participant_area}
              size="small"
              sx={{
                fontSize: '0.625rem',
                height: 18,
                backgroundColor: alpha(TOKENS.info, 0.1),
                color: TOKENS.info,
                border: `1px solid ${alpha(TOKENS.info, 0.2)}`,
                flexShrink: 0,
              }}
            />
          )}
          <Typography sx={{
            fontSize: '0.6875rem',
            color: 'var(--color-text-muted)',
            fontFamily: 'var(--font-mono)',
            whiteSpace: 'nowrap',
            display: { xs: 'none', sm: 'block' },
          }}>
            {formatDate(group.first_date)} — {formatDate(group.last_date)}
          </Typography>
        </Box>

        {/* Count */}
        <Box sx={{ display: { xs: 'none', sm: 'flex' }, justifyContent: 'flex-end' }}>
          <Typography sx={{
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-secondary)',
          }}>
            {group.operations_count} оп.
          </Typography>
        </Box>

        {/* AEI */}
        <Box sx={{ display: { xs: 'none', sm: 'flex' }, justifyContent: 'flex-end' }}>
          <Typography sx={{
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-secondary)',
          }}>
            АЕИ: {group.total_aei}
          </Typography>
        </Box>

        {/* Avg rate */}
        <Box sx={{ display: { xs: 'none', sm: 'flex' }, justifyContent: 'flex-end' }}>
          <Typography sx={{
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-muted)',
          }}>
            <CurrencyDisplay amount={group.avg_rate || 0} variant="compact" />
          </Typography>
        </Box>

        {/* Amount */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Box
            component="span"
            sx={{
              color: TOKENS.gold,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.875rem',
              px: 1,
              py: 0.25,
              borderRadius: 1,
              backgroundColor: alpha(TOKENS.gold, 0.08),
              display: 'inline-block',
            }}
          >
            <CurrencyDisplay amount={group.total_amount || 0} variant="compact" />
          </Box>
        </Box>
      </Box>

      {/* Детализация (уровень 3) */}
      <Collapse in={isExpanded} timeout={200} unmountOnExit={false}>
        {isExpanded && (
          <Box
            sx={{
              ml: 3,
              mb: 1,
              borderLeft: `2px solid ${alpha(TOKENS.gold, 0.2)}`,
              pl: 1.5,
            }}
          >
            <OperationDetails
              employeeId={employeeId}
              operationType={group.operation_type}
              participantArea={group.participant_area || ''}
              startDate={startDate}
              endDate={endDate}
            />
          </Box>
        )}
      </Collapse>
    </Box>
  );
});

OperationGroup.displayName = 'OperationGroup';
