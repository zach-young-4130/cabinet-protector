// Fulfillment status is pending → paid → shipped → delivered (or canceled).
// Refund state is orthogonal — derived from refundAmount, shown as its own badge.

export function orderStatusClass(status: string): string {
  switch (status) {
    case 'paid':
      return 'text-bg-primary';
    case 'pending':
      return 'text-bg-warning';
    case 'shipped':
      return 'text-bg-info';
    case 'delivered':
      return 'text-bg-success';
    default:
      return 'text-bg-secondary';
  }
}

export function orderItemCount(order: { lines: { quantity: number }[] }): number {
  return order.lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function refundLabel(order: { total: number; refundAmount: number }): string | null {
  if (!order.refundAmount || order.refundAmount <= 0) {
    return null;
  }
  if (order.refundAmount >= order.total) {
    return 'Fully refunded';
  }
  return `Refunded $${order.refundAmount.toFixed(2)} of $${order.total.toFixed(2)}`;
}
