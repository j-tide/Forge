export function orderTotal(lines) {
  return lines.reduce((total, line) => total + line.price * line.quantity, 0);
}
