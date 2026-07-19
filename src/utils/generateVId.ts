/**
 * Generates a permanent Vee ID in the required format: "v" + 7 digits,
 * e.g. "v1234567". Digits are randomly generated with no leading zero so
 * the ID always renders as a full 7-digit number.
 *
 * This alone does not guarantee uniqueness across users — callers must
 * check `isVIdAvailable()` (see `src/services/userService.ts`) and retry
 * on collision before persisting the ID, since a truly random 7-digit
 * space (9,000,000 possibilities) can still collide as the user base grows.
 */
export default function generateVId(): string {
  const firstDigit = Math.floor(Math.random() * 9) + 1; // 1-9, no leading zero
  let rest = '';
  for (let i = 0; i < 6; i++) {
    rest += Math.floor(Math.random() * 10).toString();
  }
  return `v${firstDigit}${rest}`;
}
