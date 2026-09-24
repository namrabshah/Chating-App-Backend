#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/23252664ccdf3cfa8497c9ea1b63f2bb1d85a1ef3772497d3d7fca3714e775f2/contract';
import startContract from '../../snapshots/23252664ccdf3cfa8497c9ea1b63f2bb1d85a1ef3772497d3d7fca3714e775f2/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/33b38b57ce6560e269712f3b9cb761aace4c8813f52374775b928360f97ff3db/contract';
import endContract from '../../snapshots/33b38b57ce6560e269712f3b9cb761aace4c8813f52374775b928360f97ff3db/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'message',
        column: col('attachmentName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'message',
        column: col('attachmentSize', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'message',
        column: col('attachmentType', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'message',
        column: col('attachmentUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.dropNotNull({ schema: 'public', table: 'message', column: 'content' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
