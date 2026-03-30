import { NextResponse } from 'next/server';
import { execFileSync } from 'child_process';

function run(cmd: string, args: string[], options?: { cwd?: string }): string {
  try {
    return execFileSync(cmd, args, {
      cwd: options?.cwd,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (e: any) {
    throw new Error(e?.stderr || e?.message || String(e));
  }
}

export async function POST(req: Request) {
  try {
    const docsRepoPath = process.env.MAINTENANCE_DOCS_REPO_PATH;
    if (!docsRepoPath) {
      return NextResponse.json({
        ok: false,
        error: 'MAINTENANCE_DOCS_REPO_PATH environment variable is not configured. Please add it in your Vercel project settings.',
      }, { status: 400 });
    }

    const baseBranch = process.env.MAINTENANCE_BASE_BRANCH || 'main';

    // Check if there are any local changes
    let hasChanges = false;
    try {
      const status = run('git', ['status', '--porcelain'], { cwd: docsRepoPath });
      hasChanges = status.trim().length > 0;
    } catch (e: any) {
      return NextResponse.json({
        ok: false,
        error: `Failed to check git status: ${e.message}`,
      }, { status: 500 });
    }

    // Stash changes if there are any
    let stashMessage = '';
    if (hasChanges) {
      try {
        const timestamp = new Date().toISOString();
        stashMessage = `Auto-stash from reset-to-main (${timestamp})`;
        run('git', ['stash', 'push', '-u', '-m', stashMessage], { cwd: docsRepoPath });
      } catch (e: any) {
        return NextResponse.json({
          ok: false,
          error: `Failed to stash changes: ${e.message}`,
        }, { status: 500 });
      }
    }

    // Checkout base branch
    try {
      run('git', ['checkout', baseBranch], { cwd: docsRepoPath });
    } catch (e: any) {
      return NextResponse.json({
        ok: false,
        error: `Failed to checkout ${baseBranch}: ${e.message}`,
      }, { status: 500 });
    }

    // Pull latest changes
    try {
      run('git', ['pull', 'origin', baseBranch], { cwd: docsRepoPath });
    } catch (e: any) {
      return NextResponse.json({
        ok: false,
        error: `Failed to pull from origin/${baseBranch}: ${e.message}`,
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: hasChanges
        ? `Successfully reset to ${baseBranch}. Local changes were stashed.`
        : `Successfully reset to ${baseBranch}.`,
      stashed: hasChanges,
      branch: baseBranch,
    });

  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err?.message || String(err),
    }, { status: 500 });
  }
}
