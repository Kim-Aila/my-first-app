import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDateTime, type ImportLogRow } from "@/lib/stock"

/** Import-Protokoll (neueste zuerst). */
export function ImportLogTable({ rows }: { rows: ImportLogRow[] }) {
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <caption className="sr-only">Protokoll früherer Bestandsimporte</caption>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs uppercase tracking-wider">Zeitpunkt</TableHead>
            <TableHead className="text-xs uppercase tracking-wider">Datei</TableHead>
            <TableHead className="hidden text-xs uppercase tracking-wider md:table-cell">Nutzer</TableHead>
            <TableHead className="text-right text-xs uppercase tracking-wider">Neu</TableHead>
            <TableHead className="text-right text-xs uppercase tracking-wider">Geändert</TableHead>
            <TableHead className="hidden text-right text-xs uppercase tracking-wider sm:table-cell">
              Unverändert
            </TableHead>
            <TableHead className="text-right text-xs uppercase tracking-wider">Fehlend</TableHead>
            <TableHead className="hidden text-right text-xs uppercase tracking-wider lg:table-cell">
              Wieder da
            </TableHead>
            <TableHead className="hidden text-right text-xs uppercase tracking-wider lg:table-cell">
              Übersprungen
            </TableHead>
            <TableHead className="text-right text-xs uppercase tracking-wider">Fehler</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap">{formatDateTime(row.createdAt)}</TableCell>
              <TableCell className="max-w-48 truncate" title={row.fileName}>
                {row.fileName}
              </TableCell>
              <TableCell className="hidden md:table-cell">{row.userName ?? "–"}</TableCell>
              <TableCell className="text-right tabular-nums">{row.counts.new}</TableCell>
              <TableCell className="text-right tabular-nums">{row.counts.changed}</TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">{row.counts.unchanged}</TableCell>
              <TableCell className="text-right tabular-nums">{row.counts.missing}</TableCell>
              <TableCell className="hidden text-right tabular-nums lg:table-cell">{row.counts.reappeared}</TableCell>
              <TableCell className="hidden text-right tabular-nums lg:table-cell">{row.skippedCount}</TableCell>
              <TableCell className={`text-right tabular-nums ${row.errorCount > 0 ? "font-medium text-[#9A3412]" : ""}`}>
                {row.errorCount}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
