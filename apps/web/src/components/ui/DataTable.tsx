/**
 * `DataTable` — **Y18**, the primary surface of this application.
 *
 * Deliberately small, and deliberately **not** a grid library:
 *
 * - **the server's order is the meaningful order.** This component never sorts.
 *   Inventory order is highest-authority-first because a reviewer resolving a
 *   conflict needs it that way ([ADR-0012](../../../../../docs/adr/ADR-0012-deterministic-conflict-precedence.md)),
 *   and a client that re-sorted by default would quietly destroy that;
 * - **an undecided cell renders the undecided token**, never a blank and never a
 *   zero — U2's third distinction, and the reason `authorityOf` exists;
 * - row selection drives the inspector, and selection is marked by
 *   `aria-selected` **and** an edge rule, never by colour alone;
 * - the table scrolls **inside its own region**, so the page never scrolls
 *   sideways.
 */

import type { ReactNode } from 'react';

export interface Column<Row> {
  readonly key: string;
  readonly header: ReactNode;
  readonly render: (row: Row) => ReactNode;
  /** Numeric/monospace alignment for counts and ranks. */
  readonly numeric?: boolean;
}

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  rowTestId,
  selectedKey,
  onSelect,
}: {
  caption: string;
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  rowTestId?: (row: Row) => string;
  selectedKey?: string;
  onSelect?: (row: Row) => void;
}): ReactNode {
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const selected = selectedKey !== undefined && selectedKey === key;
            return (
              <tr
                key={key}
                aria-selected={selected ? 'true' : undefined}
                {...(rowTestId === undefined ? {} : { 'data-testid': rowTestId(row) })}
                {...(onSelect === undefined ? {} : { onClick: () => onSelect(row) })}
              >
                {columns.map((c) => (
                  <td key={c.key} className={c.numeric === true ? 'table__num' : undefined}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Two lines in one cell: a primary value and a quiet secondary one. */
export function CellStack({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }): ReactNode {
  return (
    <span className="table__cellstack">
      <span className="table__primary">{primary}</span>
      {secondary === undefined ? null : <span className="table__sub">{secondary}</span>}
    </span>
  );
}
