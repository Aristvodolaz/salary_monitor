import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import {
  Search,
  Dashboard,
  ListAlt,
  AdminPanelSettings,
  Logout,
  Refresh,
  Download,
} from '@mui/icons-material';

type CommandAction = {
  id: string;
  label: string;
  hint?: string;
  keywords: string;
  icon: React.ReactNode;
  onSelect: () => void;
};

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  currentPath: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  onToggleTheme: () => void;
}

const RECENT_COMMANDS_KEY = 'bm_recent_commands_v1';
const ACTION_HISTORY_KEY = 'bm_action_history_v1';
const COMMAND_USAGE_KEY = 'bm_command_usage_v1';

export const CommandPalette = ({
  isOpen,
  onClose,
  isAdmin,
  currentPath,
  onNavigate,
  onLogout,
  onToggleTheme,
}: CommandPaletteProps) => {
  const [query, setQuery] = useState('');
  const [recentCommandIds, setRecentCommandIds] = useState<string[]>([]);
  const [actionHistory, setActionHistory] = useState<string[]>([]);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      const recentRaw = localStorage.getItem(RECENT_COMMANDS_KEY);
      const historyRaw = localStorage.getItem(ACTION_HISTORY_KEY);
      const usageRaw = localStorage.getItem(COMMAND_USAGE_KEY);
      if (recentRaw) setRecentCommandIds(JSON.parse(recentRaw));
      if (historyRaw) setActionHistory(JSON.parse(historyRaw));
      if (usageRaw) setUsageCounts(JSON.parse(usageRaw));
    } catch {
      setRecentCommandIds([]);
      setActionHistory([]);
      setUsageCounts({});
    }
  }, []);

  const commands = useMemo<CommandAction[]>(() => {
    const base: CommandAction[] = [
      {
        id: 'go-dashboard',
        label: 'Перейти: Дашборд',
        hint: '/',
        keywords: 'dashboard дашборд главная home',
        icon: <Dashboard fontSize="small" />,
        onSelect: () => onNavigate('/'),
      },
      {
        id: 'go-operations',
        label: 'Перейти: Операции',
        hint: '/operations',
        keywords: 'operations операции журнал',
        icon: <ListAlt fontSize="small" />,
        onSelect: () => onNavigate('/operations'),
      },
      {
        id: 'go-admin',
        label: 'Перейти: Админ-панель',
        hint: '/admin',
        keywords: 'admin админ управление',
        icon: <AdminPanelSettings fontSize="small" />,
        onSelect: () => onNavigate('/admin'),
      },
      {
        id: 'refresh-page',
        label: 'Обновить текущую страницу',
        keywords: 'refresh reload обновить перезагрузить',
        icon: <Refresh fontSize="small" />,
        onSelect: () => window.location.reload(),
      },
      {
        id: 'toggle-theme',
        label: 'Переключить тему',
        keywords: 'theme dark light тема',
        icon: <AdminPanelSettings fontSize="small" />,
        onSelect: onToggleTheme,
      },
      {
        id: 'logout',
        label: 'Выйти из аккаунта',
        keywords: 'logout exit выйти',
        icon: <Logout fontSize="small" />,
        onSelect: onLogout,
      },
    ];

    const adminContextCommands: CommandAction[] = isAdmin && currentPath === '/admin'
      ? [
          {
            id: 'admin-refresh-data',
            label: 'Админ: обновить данные',
            keywords: 'admin refresh reload обновить данные',
            icon: <Refresh fontSize="small" />,
            onSelect: () => window.dispatchEvent(new CustomEvent('bm:admin-refresh')),
          },
          {
            id: 'admin-export-csv',
            label: 'Админ: экспорт CSV',
            keywords: 'admin export csv выгрузка',
            icon: <Download fontSize="small" />,
            onSelect: () => window.dispatchEvent(new CustomEvent('bm:admin-export-csv')),
          },
          {
            id: 'admin-export-excel',
            label: 'Админ: экспорт Excel',
            keywords: 'admin export excel xlsx выгрузка',
            icon: <Download fontSize="small" />,
            onSelect: () => window.dispatchEvent(new CustomEvent('bm:admin-export-excel')),
          },
          {
            id: 'admin-period-today',
            label: 'Админ: период Сегодня',
            keywords: 'admin period today сегодня',
            icon: <AdminPanelSettings fontSize="small" />,
            onSelect: () => window.dispatchEvent(new CustomEvent('bm:admin-set-period', { detail: { period: 'today' } })),
          },
          {
            id: 'admin-period-week',
            label: 'Админ: период Неделя',
            keywords: 'admin period week неделя',
            icon: <AdminPanelSettings fontSize="small" />,
            onSelect: () => window.dispatchEvent(new CustomEvent('bm:admin-set-period', { detail: { period: 'week' } })),
          },
          {
            id: 'admin-period-month',
            label: 'Админ: период Месяц',
            keywords: 'admin period month месяц',
            icon: <AdminPanelSettings fontSize="small" />,
            onSelect: () => window.dispatchEvent(new CustomEvent('bm:admin-set-period', { detail: { period: 'month' } })),
          },
          {
            id: 'admin-period-saved',
            label: 'Админ: мой последний диапазон',
            keywords: 'admin period saved последний диапазон',
            icon: <AdminPanelSettings fontSize="small" />,
            onSelect: () => window.dispatchEvent(new CustomEvent('bm:admin-apply-saved-range')),
          },
        ]
      : [];

    if (isAdmin) {
      return [...base.filter((c) => c.id !== 'go-dashboard' && c.id !== 'go-operations'), ...adminContextCommands];
    }
    return base.filter((c) => c.id !== 'go-admin');
  }, [currentPath, isAdmin, onLogout, onNavigate, onToggleTheme]);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? commands.filter(
      (command) =>
        command.label.toLowerCase().includes(q) ||
        command.keywords.toLowerCase().includes(q) ||
        command.hint?.toLowerCase().includes(q),
        )
      : commands;

    if (q) return base;

    const rank = new Map(recentCommandIds.map((id, index) => [id, index]));
    return [...base].sort((a, b) => {
      const ai = rank.has(a.id) ? (rank.get(a.id) as number) : Number.MAX_SAFE_INTEGER;
      const bi = rank.has(b.id) ? (rank.get(b.id) as number) : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  }, [commands, query, recentCommandIds]);

  const handleSelect = (action: CommandAction) => {
    onClose();
    setQuery('');
    const nextRecent = [action.id, ...recentCommandIds.filter((id) => id !== action.id)].slice(0, 5);
    setRecentCommandIds(nextRecent);
    localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(nextRecent));

    const nextHistory = [action.label, ...actionHistory.filter((item) => item !== action.label)].slice(0, 5);
    setActionHistory(nextHistory);
    localStorage.setItem(ACTION_HISTORY_KEY, JSON.stringify(nextHistory));

    const nextUsage = { ...usageCounts, [action.id]: (usageCounts[action.id] || 0) + 1 };
    setUsageCounts(nextUsage);
    localStorage.setItem(COMMAND_USAGE_KEY, JSON.stringify(nextUsage));

    action.onSelect();
  };

  useEffect(() => {
    if (!isOpen) setQuery('');
  }, [isOpen]);

  const popularLabels = useMemo(() => {
    const topIds = Object.entries(usageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id);
    return topIds
      .map((id) => commands.find((c) => c.id === id)?.label)
      .filter(Boolean) as string[];
  }, [commands, usageCounts]);

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          overflow: 'hidden',
          border: '1px solid var(--color-border)',
        },
      }}
    >
      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ p: 1.5, borderBottom: '1px solid var(--color-border)' }}>
          <TextField
            fullWidth
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти действие... (например: операции, обновить, выйти)"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search sx={{ color: 'var(--color-text-muted)' }} />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        <List sx={{ py: 0.75 }}>
          {!query.trim() && recentCommandIds.length > 0 && (
            <Box sx={{ px: 2, pb: 0.75 }}>
              <Typography
                variant="caption"
                sx={{ color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}
              >
                Частые действия
              </Typography>
            </Box>
          )}
          {filteredCommands.map((action) => (
            <ListItemButton
              key={action.id}
              onClick={() => handleSelect(action)}
              sx={{
                mx: 1,
                borderRadius: 1.5,
                '& .MuiListItemIcon-root': { minWidth: 32, color: 'var(--color-text-secondary)' },
              }}
            >
              <ListItemIcon>{action.icon}</ListItemIcon>
              <ListItemText
                primary={action.label}
                primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600 }}
              />
              {action.hint && (
                <Typography
                  variant="caption"
                  sx={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}
                >
                  {action.hint}
                </Typography>
              )}
            </ListItemButton>
          ))}
          {filteredCommands.length === 0 && (
            <Box sx={{ py: 3, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: 'var(--color-text-secondary)' }}>
                Ничего не найдено
              </Typography>
            </Box>
          )}
        </List>

        {!query.trim() && actionHistory.length > 0 && (
          <Box sx={{ px: 2, pb: 1.25, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {actionHistory.map((item) => (
              <Chip key={item} size="small" label={item} />
            ))}
          </Box>
        )}
        {!query.trim() && popularLabels.length > 0 && (
          <Box sx={{ px: 2, pb: 1.25, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {popularLabels.map((item) => (
              <Chip key={item} size="small" label={`Топ: ${item}`} />
            ))}
          </Box>
        )}

        <Box
          sx={{
            px: 2,
            py: 1,
            borderTop: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)',
            fontSize: '0.75rem',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Typography variant="caption" sx={{ color: 'inherit' }}>
            Enter — выполнить
          </Typography>
          <Typography variant="caption" sx={{ color: 'inherit' }}>
            Esc — закрыть
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default CommandPalette;

