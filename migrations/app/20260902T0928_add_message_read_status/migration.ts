#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/ac7b45a18679903f923866bd91c597e51b199b26d5005737473b622b8acb7978/contract';
import endContract from '../../snapshots/ac7b45a18679903f923866bd91c597e51b199b26d5005737473b622b8acb7978/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/fcb934e3f7898d97c12ea55699ee9bd80ae1a55e20936b0df29bbe2d5347bcfb/contract';
import startContract from '../../snapshots/fcb934e3f7898d97c12ea55699ee9bd80ae1a55e20936b0df29bbe2d5347bcfb/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'message',
        column: col('isRead', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
