#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/23252664ccdf3cfa8497c9ea1b63f2bb1d85a1ef3772497d3d7fca3714e775f2/contract';
import endContract from '../../snapshots/23252664ccdf3cfa8497c9ea1b63f2bb1d85a1ef3772497d3d7fca3714e775f2/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/ac7b45a18679903f923866bd91c597e51b199b26d5005737473b622b8acb7978/contract';
import startContract from '../../snapshots/ac7b45a18679903f923866bd91c597e51b199b26d5005737473b622b8acb7978/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'message',
        column: col('isDelivered', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
