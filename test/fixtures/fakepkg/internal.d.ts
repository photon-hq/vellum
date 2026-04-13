/**
 * A widget from the fake package.
 */
export interface Widget {
  /** Widget identifier. */
  id: string;
  /** Display label. */
  label: string;
}

/**
 * Create a new widget.
 */
export declare function createWidget(label: string): Widget;
