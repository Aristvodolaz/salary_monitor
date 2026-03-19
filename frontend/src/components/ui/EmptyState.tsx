import { Box, Fade, Typography } from '@mui/material';
import InboxIcon from '@mui/icons-material/Inbox';
import { TOKENS } from '../../theme';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => (
  <Fade in timeout={400}>
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 10,
        px: 3,
        textAlign: 'center',
      }}
    >
      <Box
        sx={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          backgroundColor: `rgba(37, 42, 61, 0.6)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 3,
          '& .MuiSvgIcon-root': {
            fontSize: 28,
            color: TOKENS.textMuted,
          },
        }}
      >
        {icon ?? <InboxIcon />}
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, color: TOKENS.textPrimary }}>
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" sx={{ color: TOKENS.textSecondary, mb: action ? 3 : 0, maxWidth: 320 }}>
          {description}
        </Typography>
      )}
      {action && <Box>{action}</Box>}
    </Box>
  </Fade>
);
