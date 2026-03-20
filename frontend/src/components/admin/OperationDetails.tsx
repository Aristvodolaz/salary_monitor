import { memo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Typography,
  Skeleton,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import { NavigateBefore, NavigateNext } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { TOKENS } from '../../theme';
import CurrencyDisplay from '../CurrencyDisplay';
import { adminAPI } from '../../services/api';

const PAGE_SIZE = 20;

interface OperationDetailsProps {
  employeeId: number;
  operationType: string;
  participantArea: string;
  startDate: string;
  endDate: string;
}

export const OperationDetails = memo(({
  employeeId,
  operationType,
  participantArea,
  startDate,
  endDate,
}: OperationDetailsProps) => {
  const [page, setPage] = useState(0);
  const offset = page * PAGE_SIZE;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['op-details', employeeId, operationType, participantArea, startDate, endDate, page],
    queryFn: () =>
      adminAPI
        .getEmployeeOperationDetails(
          employeeId,
          operationType,
          participantArea,
          startDate,
          endDate,
          PAGE_SIZE,
          offset,
        )
        .then((res) => res.data),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Box sx={{ py: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Skeleton width={130} height={13} />
            <Skeleton width={50} height={13} />
            <Skeleton width={70} height={13} />
            <Skeleton width={80} height={13} />
          </Box>
        ))}
      </Box>
    );
  }

  if (isError) {
    const errMsg = (error as any)?.response?.data?.message || 'Ошибка загрузки деталей';
    return (
      <Box sx={{ py: 1 }}>
        <Alert severity="error" sx={{ fontSize: '0.75rem', py: 0.5 }}>{errMsg}</Alert>
      </Box>
    );
  }

  const records = data?.records || [];
  const total = data?.pagination?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (records.length === 0) {
    return (
      <Box sx={{ py: 2, textAlign: 'center' }}>
        <Typography sx={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
          Нет записей
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Заголовок детализации */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, mb: 0.5 }}>
        <Typography sx={{
          fontSize: '0.625rem',
          fontWeight: 700,
          color: 'var(--color-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          Записи
        </Typography>
        <Box sx={{ flex: 1, height: '1px', backgroundColor: 'var(--color-border)' }} />
        <Typography sx={{
          fontSize: '0.6875rem',
          color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-mono)',
        }}>
          {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} из {total}
        </Typography>
      </Box>

      {/* Шапка таблицы */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr 60px 80px', sm: '1fr 70px 70px 80px 100px' },
        gap: 1,
        px: 1,
        py: 0.5,
        mb: 0.25,
      }}>
        {['Дата и время', 'АЕИ', 'Ставка', 'Сумма'].map((h, i) => (
          <Typography key={i} sx={{
            fontSize: '0.625rem',
            fontWeight: 700,
            color: 'var(--color-text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            textAlign: i > 0 ? 'right' : 'left',
            display: i === 1 || i === 2 ? { xs: 'none', sm: 'block' } : 'block',
          }}>
            {h}
          </Typography>
        ))}
      </Box>

      {/* Строки */}
      {records.map((rec) => {
        let dateLabel = '—';
        try {
          const d = new Date(rec.operation_date);
          dateLabel = format(d, 'dd MMM yyyy, HH:mm', { locale: ru });
        } catch {
          //
        }

        return (
          <Box
            key={rec.operation_id}
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 60px 80px', sm: '1fr 70px 70px 80px 100px' },
              gap: 1,
              alignItems: 'center',
              px: 1,
              py: 0.625,
              mb: 0.25,
              borderRadius: 1,
              backgroundColor: 'var(--color-bg-elevated)',
              border: '1px solid transparent',
              transition: 'border-color 120ms ease',
              '&:hover': { borderColor: 'var(--color-border-subtle)' },
            }}
          >
            <Typography sx={{
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-secondary)',
            }}>
              {dateLabel}
            </Typography>
            <Typography sx={{
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-secondary)',
              textAlign: 'right',
              display: { xs: 'none', sm: 'block' },
            }}>
              {rec.aei_count}
            </Typography>
            <Typography sx={{
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-muted)',
              textAlign: 'right',
              display: { xs: 'none', sm: 'block' },
            }}>
              <CurrencyDisplay amount={rec.rate || 0} variant="compact" />
            </Typography>
            <Box sx={{ textAlign: 'right' }}>
              <Box
                component="span"
                sx={{
                  color: TOKENS.gold,
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8125rem',
                  px: 0.75,
                  py: 0.125,
                  borderRadius: 0.75,
                  backgroundColor: alpha(TOKENS.gold, 0.06),
                  display: 'inline-block',
                }}
              >
                <CurrencyDisplay amount={rec.base_amount || 0} variant="compact" />
              </Box>
            </Box>
          </Box>
        );
      })}

      {/* Пагинация */}
      {totalPages > 1 && (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 0.5,
          pt: 1,
          mt: 0.5,
          borderTop: '1px solid var(--color-border)',
        }}>
          <Typography sx={{
            fontSize: '0.6875rem',
            color: 'var(--color-text-muted)',
            fontFamily: 'var(--font-mono)',
            mr: 0.5,
          }}>
            {page + 1} / {totalPages}
          </Typography>
          <Tooltip title="Назад">
            <span>
              <IconButton
                size="small"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                sx={{ color: 'var(--color-text-secondary)', p: 0.5 }}
              >
                <NavigateBefore fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Вперёд">
            <span>
              <IconButton
                size="small"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                sx={{ color: 'var(--color-text-secondary)', p: 0.5 }}
              >
                <NavigateNext fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
});

OperationDetails.displayName = 'OperationDetails';
