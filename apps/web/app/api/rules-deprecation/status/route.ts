import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { z } from 'zod';

const PutSchema = z.object({
  filePath: z.string().min(1),
  status: z.enum(['pending', 'in_progress', 'done', 'wont_fix']),
  prUrl: z.string().optional(),
  notes: z.string().optional(),
  updatedBy: z.string().optional(),
});

export async function GET() {
  try {
    // Ensure table exists
    await sql`
      CREATE TABLE IF NOT EXISTS rules_deprecation_status (
        file_path TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'pending',
        pr_url TEXT,
        notes TEXT,
        updated_by TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    const result = await sql`SELECT * FROM rules_deprecation_status`;

    const statusMap: Record<string, {
      status: string;
      prUrl: string | null;
      notes: string | null;
      updatedBy: string | null;
      updatedAt: string | null;
    }> = {};

    for (const row of result.rows) {
      statusMap[row.file_path] = {
        status: row.status,
        prUrl: row.pr_url,
        notes: row.notes,
        updatedBy: row.updated_by,
        updatedAt: row.updated_at,
      };
    }

    return NextResponse.json({ ok: true, statuses: statusMap });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    // Ensure table exists
    await sql`
      CREATE TABLE IF NOT EXISTS rules_deprecation_status (
        file_path TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'pending',
        pr_url TEXT,
        notes TEXT,
        updated_by TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    const body = PutSchema.parse(await req.json());

    await sql`
      INSERT INTO rules_deprecation_status (file_path, status, pr_url, notes, updated_by, updated_at)
      VALUES (${body.filePath}, ${body.status}, ${body.prUrl ?? null}, ${body.notes ?? null}, ${body.updatedBy ?? null}, NOW())
      ON CONFLICT (file_path) DO UPDATE SET
        status = ${body.status},
        pr_url = COALESCE(${body.prUrl ?? null}, rules_deprecation_status.pr_url),
        notes = COALESCE(${body.notes ?? null}, rules_deprecation_status.notes),
        updated_by = COALESCE(${body.updatedBy ?? null}, rules_deprecation_status.updated_by),
        updated_at = NOW()
    `;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 400 }
    );
  }
}
