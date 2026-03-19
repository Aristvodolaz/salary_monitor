import { Box, Card, CardContent, Skeleton } from '@mui/material';

export const SkeletonCard = () => (
  <Card>
    <CardContent sx={{ p: 3 }}>
      <Skeleton width="45%" height={14} sx={{ mb: 2 }} />
      <Skeleton width="65%" height={44} sx={{ mb: 2.5 }} />
      <Box sx={{ display: 'flex', gap: 3 }}>
        <Box>
          <Skeleton width={56} height={12} sx={{ mb: 0.75 }} />
          <Skeleton width={44} height={20} />
        </Box>
        <Box>
          <Skeleton width={36} height={12} sx={{ mb: 0.75 }} />
          <Skeleton width={44} height={20} />
        </Box>
      </Box>
    </CardContent>
  </Card>
);
