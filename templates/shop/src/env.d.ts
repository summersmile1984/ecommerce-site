/**
 * App-wide SSR locals.
 * The cart-count badge was removed (review finding5): baking per-user counts
 * into cacheable HTML would poison the page cache.
 */
declare namespace App {
  interface Locals {}
}
