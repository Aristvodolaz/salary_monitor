import { Box, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
}

const COL_WIDTHS = ['140px', '100%', '80px', '100px', '120px'];

export const SkeletonTable = ({ rows = 10, columns = 5 }: SkeletonTableProps) => (
  <TableContainer>
    <Table>
      <TableHead>
        <TableRow>
          {Array.from({ length: columns }).map((_, i) => (
            <TableCell key={i}>
              <Skeleton width={80} height={12} />
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <TableRow key={rowIdx}>
            {Array.from({ length: columns }).map((_, colIdx) => (
              <TableCell key={colIdx}>
                <Box sx={{ width: COL_WIDTHS[colIdx] || '80px', maxWidth: '100%' }}>
                  <Skeleton
                    height={16}
                    width={colIdx === 1 ? `${55 + Math.random() * 35}%` : '70%'}
                  />
                </Box>
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </TableContainer>
);
