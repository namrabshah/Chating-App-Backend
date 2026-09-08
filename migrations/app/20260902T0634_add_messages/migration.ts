#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/0f7d10a0341e3725d7bafce1ffe52cdbf4ef50d118b733dbb293f68712c79f55/contract';
import startContract from '../../snapshots/0f7d10a0341e3725d7bafce1ffe52cdbf4ef50d118b733dbb293f68712c79f55/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/fcb934e3f7898d97c12ea55699ee9bd80ae1a55e20936b0df29bbe2d5347bcfb/contract';
import endContract from '../../snapshots/fcb934e3f7898d97c12ea55699ee9bd80ae1a55e20936b0df29bbe2d5347bcfb/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'message',
        columns: [
          col('content', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('conversationId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('senderId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
