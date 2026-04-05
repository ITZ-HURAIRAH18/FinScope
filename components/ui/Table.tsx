import { TableHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

// Table Container
function TableContainer({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('table-container', className)} {...props}>
      {children}
    </div>
  );
}

TableContainer.displayName = 'TableContainer';

// Table
const Table = forwardRef<HTMLTableElement, TableHTMLAttributes<HTMLTableElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <table ref={ref} className={clsx('table', className)} {...props}>
        {children}
      </table>
    );
  }
);

Table.displayName = 'Table';

// Table Header
function TableHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={clsx('', className)} {...props}>
      {children}
    </thead>
  );
}

TableHeader.displayName = 'TableHeader';

// Table Body
function TableBody({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={clsx('', className)} {...props}>
      {children}
    </tbody>
  );
}

TableBody.displayName = 'TableBody';

// Table Row
function TableRow({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={clsx('', className)} {...props}>
      {children}
    </tr>
  );
}

TableRow.displayName = 'TableRow';

// Table Head
function TableHead({
  className,
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={clsx('', className)} {...props}>
      {children}
    </th>
  );
}

TableHead.displayName = 'TableHead';

// Table Cell
function TableCell({
  className,
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={clsx('', className)} {...props}>
      {children}
    </td>
  );
}

TableCell.displayName = 'TableCell';

export {
  TableContainer,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
};
