/** App-wide SSR locals (populated by the cache middleware, T14). */
declare namespace App {
  interface Locals {
    cartCount?: number;
  }
}
