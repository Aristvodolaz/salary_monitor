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
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { TOKENS } from '../../theme';
import CurrencyDisplay from '../CurrencyDisplay';
import type { AxiosResponse } from 'axios';
import { adminAPI, type OperationDetailsResponse, type OperationRecord } from '../../services/api';

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
        .then((res: AxiosResponse<OperationDetailsResponse>) => res.data),
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

      {/* Строки детализации — формат: "18.10.2025 — Пополнение — 2 АЕИ — 1.56 руб — всего 3.12 руб" */}
      {records.map((rec: OperationRecord) => {
        let dateLabel = '—';
        let opType = operationType;
        try {
          const d = new Date(rec.operation_date);
          dateLabel = format(d, 'dd.MM.yyyy', { locale: ru });
        } catch {
          //
        }

        return (
          <Box
            key={rec.operation_id}
            sx={{
              px: 1.5,
              py: 0.75,
              mb: 0.5,
              borderRadius: 1,
              backgroundColor: 'var(--color-bg-elevated)',
              border: '1px solid transparent',
              transition: 'border-color 120ms ease',
              '&:hover': { borderColor: 'var(--color-border-subtle)' },
            }}
          >
            <Typography sx={{
              fontSize: '0.8125rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-primary)',
              lineHeight: 1.6,
            }}>
              {dateLabel} — {opType} — {rec.aei_count} АЕИ — <CurrencyDisplay amount={rec.rate || 0} variant="compact" /> — всего <Box
                component="span"
                sx={{
                  color: TOKENS.gold,
                  fontWeight: 700,
                }}
              >
                <CurrencyDisplay amount={rec.base_amount || 0} variant="compact" />
              </Box>
            </Typography>
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
