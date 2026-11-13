/** A short, human order number from the payment's transaction signature: "K7Q2X". Unique enough for one shop's counter. */
export function orderNumber(signature: string): string {
  return signature.replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase();
}
