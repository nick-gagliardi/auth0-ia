export type Status = 'PASS' | 'FAIL' | 'MANUAL' | 'NA';

function fmt(status: Status) {
  if (status === 'PASS') return '[x]';
  if (status === 'FAIL') return '[!]';
  if (status === 'MANUAL') return '[-]';
  return '[ ]';
}

export function formatChecklistHuman(checklistAuto: any) {
  const cs = checklistAuto?.codeSamples || {};
  const dash = checklistAuto?.dashboard || {};
  const hk = checklistAuto?.housekeeping || {};

  const lines: string[] = [];
  lines.push('Technical correctness (auto)');
  lines.push('');

  lines.push('Code samples');
  lines.push(`${fmt(cs.curl)} cURL samples runnable + passing`);
  lines.push(`${fmt(cs.tabRendering)} Code tab rendering (Mintlify)`);
  if (cs.tabRenderingWarning) lines.push(`    ⚠ ${cs.tabRenderingWarning}`);
  lines.push(`${fmt(cs.sdk)} SDK samples present (execution not automated)`);
  lines.push(`${fmt(cs.har)} HAR rendering (not automated)`);
  lines.push(`${fmt(cs.missingSamples)} Missing code samples where expected (heuristic)`);
  lines.push(`${fmt(cs.removeObjcSwift)} Obj-C/Swift present in Mgmt API calls (needs review)`);

  lines.push('');
  lines.push('Auth0 Dashboard');
  lines.push(`${fmt(dash.screenshots)} Screenshots present + accurate (manual)`);
  lines.push(`${fmt(dash.screenshotsHiRes)} Screenshots hi-res/style (manual)`);
  lines.push(`${fmt(dash.stepsWork)} Dashboard steps work (manual)`);

  lines.push('');
  lines.push('General housekeeping');
  lines.push(`${fmt(hk.rulesToActions)} Replace Rules with Actions`);
  lines.push(`${fmt(hk.brokenLinks)} Broken internal docs links`);
  lines.push(`${fmt(hk.typos)} Possible typos (heuristic)`);

  return lines.join('\n');
}
